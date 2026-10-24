// Every column the app reads, per table. The System Check page selects these
// to prove the live database matches what the screens expect.
export const SCHEMA_COLUMNS: Record<string, string[]> = {
  businesses: ["id", "name", "created_at"],
  business_members: ["id", "business_id", "user_id", "email", "display_name", "role", "created_at"],
  business_settings: ["business_id", "trip_prefix", "lr_prefix", "phone", "email", "address", "city", "state", "date_format"],
  doc_sequences: ["business_id", "doc_type", "last_value"],
  audit_logs: ["id", "business_id", "table_name", "record_id", "action", "old_data", "new_data", "user_id", "created_at"],
  ledger_entries: ["id", "business_id", "account_type", "account_id", "source_table", "source_id", "line_kind", "entry_date", "description", "debit", "credit", "reversal_of", "created_by"],
  parties: ["id", "name", "name_normalized", "roles", "contact_person", "phone", "alt_phone", "address", "city", "state", "notes", "is_active", "opening_balance", "opening_type", "opening_date"],
  drivers: ["id", "name", "phone", "licence_number", "joining_date", "address", "notes", "salary_amount", "salary_frequency", "is_active"],
  vehicles: ["id", "registration_number", "registration_normalized", "vehicle_type", "capacity", "notes", "is_active"],
  routes: ["id", "origin", "destination", "distance_km", "notes", "is_active"],
  transporters: ["id", "name", "name_normalized", "phone", "notes", "party_id", "is_active"],
  payment_accounts: ["id", "kind", "display_name", "bank_name", "account_holder", "account_number", "ifsc", "is_active", "opening_balance", "opening_date"],
  trips: ["id", "trip_number", "trip_date", "journey_type", "direction", "status", "parent_trip_id", "leg_label", "vehicle_mode", "vehicle_id", "market_vehicle_number", "market_vehicle_type", "transporter_id", "driver_id", "driver_name", "notes", "cancel_reason"],
  trip_stops: ["id", "trip_id", "seq", "location", "stop_type", "planned_arrival", "actual_arrival", "status", "notes"],
  lrs: ["id", "lr_number", "lr_date", "trip_id", "loading_stop_id", "unloading_stop_id", "goods_description", "quantity", "weight", "weight_unit", "loading_point", "delivery_point", "delivery_status", "freight_type", "billing_party_id", "rate_unit", "rate", "base_freight", "additions_total", "deductions_total", "final_freight", "transporter_id", "vehicle_number", "vehicle_type", "driver_name", "freight_payable", "direct_payment_enabled", "direct_payment_amount", "commission_enabled", "commission_mode", "commission_value", "commission_amount", "commission_payer_party_id", "commission_status", "commission_date", "status", "cancel_reason"],
  lr_parties: ["id", "lr_id", "role", "party_id", "seq", "goods_description", "quantity", "weight", "loading_point", "delivery_point"],
  lr_adjustments: ["id", "lr_id", "kind", "amount", "reason"],
  expenses: ["id", "scope", "trip_id", "lr_id", "lr_party_id", "category", "amount", "expense_date", "paid_by", "paid_to", "responsible", "responsible_party_id", "payment_method", "account_id", "payment_status", "reference", "notes", "is_cancelled"],
  advances: ["id", "trip_id", "recipient_type", "driver_id", "transporter_id", "party_id", "other_name", "advance_date", "amount", "payment_method", "account_id", "reference", "notes", "is_cancelled"],
  payments: ["id", "payment_type", "party_id", "transporter_id", "payer_name", "amount", "payment_date", "mode", "account_id", "reference", "notes", "lr_id", "trip_id", "bank_name", "bank_holder", "bank_account_number", "bank_ifsc", "upi_id", "txn_reference", "is_reversed", "reversal_reason"],
  payment_allocations: ["id", "payment_id", "lr_id", "target", "amount"],
  salary_entries: ["id", "driver_id", "period", "due_date", "amount", "notes", "is_cancelled"],
  salary_payments: ["id", "driver_id", "salary_entry_id", "payment_date", "amount", "recovered_advance", "recovered_commission", "payment_method", "account_id", "reference", "is_reversed"],
  driver_commissions: ["id", "business_id", "driver_id", "transporter_id", "lr_id", "trip_id", "amount", "commission_date", "reference", "notes", "is_cancelled", "cancel_reason"],
  commission_receipts: ["id", "business_id", "commission_id", "driver_id", "transporter_id", "amount", "receipt_date", "account_id", "salary_payment_id", "request_id", "reference", "notes", "is_reversed", "reversal_reason"],
  commission_balances: ["id", "driver_id", "transporter_id", "lr_id", "trip_id", "amount", "received_amount", "pending_amount", "cash_received_amount", "document_number", "is_cancelled", "cancel_reason", "commission_date"],
};
SCHEMA_COLUMNS.lrs.push("driver_id", "commission_cancel_reason", "commission_reference", "commission_notes");
SCHEMA_COLUMNS.trips.push("commission_enabled", "commission_mode", "commission_value", "commission_amount", "commission_date", "commission_reference", "commission_notes", "commission_cancel_reason");

SCHEMA_COLUMNS.lrs.push("cancelled_by", "cancelled_at");
SCHEMA_COLUMNS.lrs.push("transporter_rate", "transporter_rate_unit", "transporter_weight", "transporter_weight_unit");
SCHEMA_COLUMNS.lrs.push("transporter_additions", "transporter_additions_reason", "transporter_shortage", "transporter_shortage_reason");
SCHEMA_COLUMNS.trips.push("cancelled_by", "cancelled_at");
