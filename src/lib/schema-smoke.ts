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
  payment_accounts: ["id", "kind", "display_name", "bank_name", "account_holder", "account_number", "ifsc", "is_active"],
};
