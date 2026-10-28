// Turns raw Supabase/PostgREST errors into messages that say what to do, WITHOUT hiding the real database message.
// The original text is always kept first; a hint is appended only for recognised "schema not set up / not reloaded" cases.

const MIGRATION_OF: [RegExp, string][] = [
  [/account_movements?\b|account_balances_as_of|account_unassigned_outflows|save_payment|system_key/i, "0022 (then 0024)"],
  [/transporter_manual_entries|set_transporter_opening|save_transporter_manual_entry/i, "0021"],
  [/user_nav_favourites/i, "0023"],
  [/party_manual_entries|set_party_opening|save_party_manual_entry|reverse_party_manual_entry/i, "0024"],
];

export function explainDbError(raw: string): string {
  const msg = String(raw ?? "");
  if (!/schema cache|could not find the (table|function)|does not exist|relation .* does not exist|PGRST20[0-9]|PGRST202/i.test(msg)) return msg;
  const hit = MIGRATION_OF.find(([re]) => re.test(msg));
  const which = hit ? `Run migration ${hit[1]} in the Supabase SQL editor` : "Run the latest migrations in the Supabase SQL editor";
  return `${msg} — the database is missing something the app needs, or the API schema cache has not been reloaded. ${which}, then run NOTIFY pgrst, 'reload schema'; (or Supabase → Settings → API → Reload schema) and refresh this page.`;
}
