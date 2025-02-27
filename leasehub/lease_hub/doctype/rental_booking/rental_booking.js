frappe.ui.form.on("Rental Booking", {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('See Contract'), function () {
                frappe.set_route('List', 'Contract', { custom_rental_booking: frm.doc.name });
            });

            frm.add_custom_button(__('Contract'), function () {
                create_rental_contract(frm);
            }, __('Create'));
        }


    },

    customer: function (frm) {
        fetch_customer_details(frm, frm.doc.customer);
        set_car_filters(frm);
    },

    rental_start: function (frm) {
        sync_rental_period_to_items(frm);
        calculate_total_cost(frm, cdt, cdn);
    },

    rental_end: function (frm) {
        sync_rental_period_to_items(frm);
        calculate_total_cost(frm, cdt, cdn);
    },

    sync_rental_period: function (frm) {
        sync_rental_period_to_items(frm);
        calculate_total_cost(frm, cdt, cdn);
    },

    rental_based_on: function (frm) {
        sync_rental_based_on_to_items(frm);
        calculate_total_cost(frm, cdt, cdn);
    },

    sync_rental_based_on: function (frm) {
        sync_rental_based_on_to_items(frm);
        calculate_total_cost(frm, cdt, cdn);
    }
});

function fetch_customer_details(frm, customer_name) {
    if (customer_name) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Customer',
                name: customer_name
            },
            callback: function (response) {
                if (response.message) {
                    frm.set_value('customer_name', response.message.customer_name);
                    frm.set_value('customer_mobile', response.message.mobile_no);
                }
            }
        });
    }
}

function create_rental_contract(frm) {
    frappe.new_doc('Contract', {
        custom_rental_booking: frm.doc.name,
        party_type: 'Customer',
        party_name: frm.doc.customer,
        start_date: frm.doc.rental_start,
        end_date: frm.doc.rental_end
    });
}

// Function to sync rental period to table items
function sync_rental_period_to_items(frm) {
    if (frm.doc.sync_rental_period) {
        frm.doc.rental_booking_item.forEach(row => {
            frappe.model.set_value(row.doctype, row.name, "rental_start", frm.doc.rental_start);
            frappe.model.set_value(row.doctype, row.name, "rental_end", frm.doc.rental_end);
        });
        frm.refresh_field('rental_booking_item');
    }
}

// Function to sync rental_based_on to table items
function sync_rental_based_on_to_items(frm) {
    if (frm.doc.sync_rental_based_on) {
        frm.doc.rental_booking_item.forEach(row => {
            frappe.model.set_value(row.doctype, row.name, "rental_based_on", frm.doc.rental_based_on);
        });
        frm.refresh_field('rental_booking_item');
    }
}

// Items Table in Rental Booking
frappe.ui.form.on('Rental Booking Item', {
    item: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.item) {
            frappe.db.get_doc('Item', row.item).then(item => {
                frappe.model.set_value(cdt, cdn, 'rental_based_on', item.rental_based_on);
                // frappe.model.set_value(cdt, cdn, 'rental_rate', item.custom_hourly_rate);

                frm.refresh_field('rental_booking_item');
                sync_rental_based_on_to_items(frm);
            });
        }
        set_item_conditions(frm);
    },

    rental_based_on: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.item && row.rental_based_on) {
            frappe.db.get_doc('Item', row.item).then(item => {
                let rental_rate = 0;

                if (row.rental_based_on === 'Hourly') {
                    rental_rate = item.custom_hourly_rate;
                } else if (row.rental_based_on === 'Daily') {
                    rental_rate = item.custom_daily_rate;
                } else if (row.rental_based_on === 'Weekly') {
                    rental_rate = item.custom_weekly_rate;
                } else if (row.rental_based_on === 'Monthly') {
                    rental_rate = item.custom_monthly_rate;
                }

                frappe.model.set_value(cdt, cdn, 'rental_cost', rental_rate);
                calculate_total_cost(frm, cdt, cdn);
            });
        }
    },

    rental_start: function (frm, cdt, cdn) {
        calculate_total_cost(frm, cdt, cdn);
    },

    rental_end: function (frm, cdt, cdn) {
        calculate_total_cost(frm, cdt, cdn);
    },
    rental_booking_item_add: function (frm, cdt, cdn) {
        sync_rental_period_to_items(frm);  // Ensure all rows are updated
        frm.refresh_field('rental_booking_item');
    }
});


function set_item_conditions(frm) {
    frm.fields_dict['rental_booking_item'].grid.get_field('item').get_query = function () {
        let selected_item = (frm.doc.rental_booking_item || []).map(row => row.item);
        return {
            filters: [
                ['item_group', '=', 'Rentable'],
                ['rental_status', '=', 'Available'],
                ['name', 'not in', selected_item]
            ]
        };
    };
}


// Function to calculate total cost based on rental duration
function calculate_total_cost(frm, cdt, cdn) {
    let row = locals[cdt][cdn];

    if (row.rental_start && row.rental_end && row.rental_cost) {
        let start = new Date(row.rental_start);
        let end = new Date(row.rental_end);
        let duration = 0;

        if (start < end) {
            if (row.rental_based_on === 'Hourly') {
                duration = Math.abs((end - start) / (1000 * 60 * 60));
            } else if (row.rental_based_on === 'Daily') {
                duration = Math.abs((end - start) / (1000 * 60 * 60 * 24));
            } else if (row.rental_based_on === 'Weekly') {
                duration = Math.abs((end - start) / (1000 * 60 * 60 * 24 * 7));
            } else if (row.rental_based_on === 'Monthly') {
                let startMonth = start.getMonth() + 1;
                let startYear = start.getFullYear();
                let endMonth = end.getMonth() + 1;
                let endYear = end.getFullYear();
                duration = (endYear - startYear) * 12 + (endMonth - startMonth);
            }

            let total_cost = duration * row.rental_cost;
            frappe.model.set_value(cdt, cdn, 'total_cost', total_cost.toFixed(2));
        } else {
            frappe.msgprint(__('Rental End must be after Rental Start'));
            frappe.model.set_value(cdt, cdn, 'total_cost', 0);
        }
    }
}
