/** Pure option-building logic for the Transporter field (kept separate so it can be unit-tested). */
export type PartyRow = { id: string; name: string; is_active?: boolean | null };
export type TransporterRow = { id: string; name: string; party_id?: string | null; is_active?: boolean | null };
export type TransporterOption = { value: string; label: string; hint: string };

/** Same rule the database uses for name_normalized: trim, collapse repeated spaces, lower-case. */
export const normName = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * One option per active party. A party resolves to its transporter record when one exists
 * (linked by party_id, or an older unlinked record with the same normalised name); otherwise it
 * is offered as "party:<id>" and a transporter is created/linked on selection.
 * Transporters that belong to no active party are listed after the parties.
 * `needsLink` maps an old unlinked transporter id to the party that should be linked to it.
 */
export function buildTransporterOptions(parties: PartyRow[], transporters: TransporterRow[], current?: string | null) {
  const byParty = new Map<string, TransporterRow>();
  const unlinkedByName = new Map<string, TransporterRow>();
  for (const t of transporters) {
    if (t.party_id) { if (!byParty.has(t.party_id)) byParty.set(t.party_id, t); }
    else if (!unlinkedByName.has(normName(t.name))) unlinkedByName.set(normName(t.name), t);
  }
  const used = new Set<string>();
  const needsLink = new Map<string, string>();
  const options: TransporterOption[] = [];
  for (const p of parties) {
    if (p.is_active === false) continue;
    const t = byParty.get(p.id) ?? unlinkedByName.get(normName(p.name));
    if (t && used.has(t.id)) continue;
    if (t) {
      used.add(t.id);
      if (!t.party_id) needsLink.set(t.id, p.id);
      options.push({ value: t.id, label: p.name, hint: "party" });
    } else options.push({ value: "party:" + p.id, label: p.name, hint: "party" });
  }
  for (const t of transporters) {
    if (used.has(t.id) || (t.is_active === false && t.id !== current)) continue;
    options.push({ value: t.id, label: t.name, hint: t.party_id ? "party" : "" });
  }
  return { options, needsLink };
}

/** Active party whose normalised name equals the typed text, if any. */
export const findPartyByName = (parties: PartyRow[], text: string) =>
  parties.find((p) => p.is_active !== false && normName(p.name) === normName(text));
