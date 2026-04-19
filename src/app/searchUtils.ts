/** Normalize for substring search (Arabic + Latin, NFC). */
export function normalizeForSearch(s: string): string {
  try {
    return s.normalize("NFKC").trim().replace(/\s+/g, " ");
  } catch {
    return String(s ?? "").trim().replace(/\s+/g, " ");
  }
}

export function textMatchesQuery(haystack: string | null | undefined, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const h = normalizeForSearch(String(haystack ?? ""));
  const ql = q.toLowerCase();
  const hl = h.toLowerCase();
  return hl.includes(ql) || h.includes(q);
}

export type PlanBucket = "trial" | "pro" | "basic" | "other";

export function normalizePlanKey(raw: string | null | undefined): PlanBucket {
  const s = normalizeForSearch(String(raw ?? "")).toLowerCase();
  if (!s) return "other";
  if (s.includes("trial") || s.includes("تجريب")) return "trial";
  if (s.includes("pro") || s.includes("premium") || s.includes("بريم")) return "pro";
  if (s.includes("basic") || s.includes("أساسي")) return "basic";
  return "other";
}

/** Match dropdown value (either locale) against DB/display value. */
export function bilingualOptionMatches(
  dbValue: string,
  selected: string,
  allLabel: string,
  arOptions: string[],
  enOptions: string[],
): boolean {
  if (selected === allLabel) return true;
  const dNorm = normalizeForSearch(dbValue).toLowerCase();
  for (let k = 1; k < Math.min(arOptions.length, enOptions.length); k++) {
    const ar = arOptions[k] ?? "";
    const en = enOptions[k] ?? "";
    if (selected !== ar && selected !== en) continue;
    const enL = normalizeForSearch(en).toLowerCase();
    const arL = normalizeForSearch(ar).toLowerCase();
    if (dNorm === enL || dNorm === arL) return true;
    if (textMatchesQuery(dbValue, en) || textMatchesQuery(dbValue, ar)) return true;
  }
  return textMatchesQuery(dbValue, selected);
}
