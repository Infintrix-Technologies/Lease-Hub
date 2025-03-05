// Copyright (c) 2025, Infintrix Technologies and contributors
// For license information, please see license.txt

frappe.ui.form.on("Rental Item Return", {
    refresh(frm) {
    },
    after_save(frm) {
        frm.doc.booking_status = "Closed";
        frm.save();
    }
});