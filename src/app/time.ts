export function formatRelativeTime(
  date: Date,
  locale: "ar" | "en",
  nowMs: number = Date.now(),
): string {
  const targetMs = date.getTime();
  if (!Number.isFinite(targetMs)) return locale === "ar" ? "—" : "—";

  const diffMs = targetMs - nowMs;
  const absSec = Math.abs(diffMs) / 1000;

  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let value = Math.round(diffMs / (1000 * 60));

  if (absSec >= 60 * 60 * 24) {
    unit = "day";
    value = Math.round(diffMs / (1000 * 60 * 60 * 24));
  } else if (absSec >= 60 * 60) {
    unit = "hour";
    value = Math.round(diffMs / (1000 * 60 * 60));
  } else {
    unit = "minute";
    value = Math.round(diffMs / (1000 * 60));
  }

  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  // Avoid "in 0 minutes" / "0 minutes ago"
  if (value === 0) value = diffMs < 0 ? -1 : 1;
  return fmt.format(value, unit);
}

