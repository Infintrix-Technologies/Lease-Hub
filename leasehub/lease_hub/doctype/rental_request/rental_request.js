frappe.ui.form.on("Rental Request", {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Make Booking'), function () {
                handle_rental_booking(frm);
            });
        }
        if (frm.fields_dict["rental_booking_item"] && frm.fields_dict["rental_booking_item"].grid) {
            setTimeout(() => {
                frm.fields_dict["rental_booking_item"].grid.set_grid_columns([
                    { fieldname: "item", width: 140 },
                    { fieldname: "rental_based_on", width: 120 },
                    { fieldname: "rental_start", width: 180 },
                    { fieldname: "rental_end", width: 100 },
                    { fieldname: "rental_cost", width: 130 },
                    { fieldname: "total_cost", width: 130 }
                ]);
                frm.fields_dict["rental_booking_item"].grid.refresh();
            }, 100);
        }
    },
    before_save: function (frm) {
        if (!frm.doc.rental_start) {
            frm.set_value('rental_start', frappe.datetime.now_datetime());
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

// For the Rental Request doctype, we will add a custom button to create a Rental Booking. When the button is clicked, we will check if the customer exists in the system. If the customer exists, we will proceed with creating a Rental Booking. If the customer doesn't exist, we will create a new Customer record and then create a Rental Booking.

function handle_rental_booking(frm) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Customer",
            filters: {
                mobile_no: frm.doc.customer_mobile,
                email_id: frm.doc.customer_email
            },
            fields: ["name"]
        },
        callback: function (res) {
            if (res.message.length > 0) {
                frm.set_value('booking_status', 'In Progress');
                frm.save();
                create_rental_booking(frm, res.message[0].name);
            } else {
                create_customer(frm);
            }
        }
    });
}

function create_customer(frm) {
    frappe.call({
        method: "frappe.client.insert",
        args: {
            doc: {
                doctype: "Customer",
                customer_name: frm.doc.customer_name,
                mobile_no: frm.doc.customer_mobile, // Ensure correct field name
                email_id: frm.doc.customer_email,
                gender: frm.doc.gender,
                customer_type: "Normal Customer"
            }
        },
        callback: function (res) {
            if (res.message) {
                frappe.msgprint(__("Customer Created: " + res.message.name));
                create_rental_booking(frm, res.message.name);
            }
        }
    });
}



function create_rental_booking(frm, customer_name) {
    frappe.new_doc('Rental Booking', {
        customer: customer_name,
        customer_name: customer_name,
        customer_mobile: frm.doc.customer_mobile,
        rental_start: frm.doc.rental_start,
        rental_end: frm.doc.rental_end,
        rental_based_on: frm.doc.rental_based_on,
        rental_booking_item: frm.doc.rental_booking_item.map(item => ({
            item: item.item,
            rental_based_on: item.rental_based_on,
            rental_start: item.rental_start,
            rental_end: item.rental_end,
            rental_cost: item.rental_cost,
            total_cost: item.total_cost
        })),
        rental_cost: frm.doc.rental_cost

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
        update_total_rental_cost(frm);
        frm.refresh_field('rental_booking_item');
    },
    rental_booking_item_remove: function (frm, cdt, cdn) {
        update_total_rental_cost(frm);
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
    update_total_rental_cost(frm);
}



function update_total_rental_cost(frm) {
    let total_rental_cost = 0;

    (frm.doc.rental_booking_item || []).forEach(row => {
        total_rental_cost += parseFloat(row.total_cost) || 0;
    });

    frm.set_value('rental_cost', total_rental_cost.toFixed(2));
}
