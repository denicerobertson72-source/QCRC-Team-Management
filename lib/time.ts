const ET_TIMEZONE = "America/New_York";

export type ProgramMonth = {
  /** Calendar month number, 1 (January) through 12 (December). */
  month: number;
  year: number;
  current: string;
  previous: string;
  next: string;
  label: string;
  start: Date;
  end: Date;
};

function easternYearMonth(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "");
  return { year: get("year"), month: get("month") };
}

/**
 * Parses an administrative calendar month as a 1-based year/month value and
 * builds Eastern-time month boundaries for querying and session generation.
 */
export function programMonthFromInput(monthInput?: string): ProgramMonth {
  const fallback = easternYearMonth(new Date());
  const [yearRaw, monthRaw] = (monthInput ?? "").split("-");
  const parsedYear = Number(yearRaw);
  const parsedMonth = Number(monthRaw);
  const year = Number.isFinite(parsedYear) && parsedYear > 2000 ? parsedYear : fallback.year;
  const month = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : fallback.month;
  const toKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthAnchor = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  const nextAnchor = new Date(Date.UTC(year, month, 15, 12, 0, 0));
  const previousAnchor = new Date(Date.UTC(year, month - 2, 15, 12, 0, 0));
  const current = toKey(monthAnchor);
  const start = new Date(easternLocalInputToIso(`${current}-01T00:00`)!);
  const end = new Date(easternLocalInputToIso(`${toKey(nextAnchor)}-01T00:00`)!);

  return {
    year,
    month,
    current,
    previous: toKey(previousAnchor),
    next: toKey(nextAnchor),
    label: formatEasternMonthLabel(monthAnchor),
    start,
    end,
  };
}

export function formatEasternDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en-US", {
    timeZone: ET_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatEasternTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString("en-US", {
    timeZone: ET_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatEasternTimeOffset(value: string | Date, offsetMinutes: number) {
  const date = value instanceof Date ? value : new Date(value);
  return formatEasternTime(new Date(date.getTime() + offsetMinutes * 60 * 1000));
}

export function formatEasternMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    timeZone: ET_TIMEZONE,
    month: "long",
    year: "numeric",
  });
}

export function formatEasternDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-US", {
    timeZone: ET_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getEasternDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getEasternOffsetMinutes(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(instant);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return -300;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function toEasternLocalIso(year: number, monthIndex: number, day: number, hour: number, minute: number) {
  const localWallMs = Date.UTC(year, monthIndex, day, hour, minute, 0);
  let guess = new Date(localWallMs);
  for (let i = 0; i < 2; i += 1) {
    const offsetMinutes = getEasternOffsetMinutes(guess);
    const corrected = new Date(localWallMs - offsetMinutes * 60 * 1000);
    if (corrected.getTime() === guess.getTime()) break;
    guess = corrected;
  }
  return guess.toISOString();
}

export function easternLocalInputToIso(value: string) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;

  const [yearRaw, monthRaw, dayRaw] = datePart.split("-");
  const [hourRaw, minuteRaw] = timePart.split(":");

  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  return toEasternLocalIso(year, month - 1, day, hour, minute);
}

export function formatEasternLocalInput(value: string) {
  const iso = easternLocalInputToIso(value);
  return iso ? formatEasternDateTime(iso) : "";
}

export function toEasternDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function nowEasternDateTimeLocalValue() {
  return toEasternDateTimeLocalValue(new Date().toISOString());
}
