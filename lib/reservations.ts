function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function deriveReservationEndLocal(startLocal: string) {
  const match = startLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  const startUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const endUtc = new Date(startUtc.getTime() + 2 * 60 * 60 * 1000);

  const sameDay =
    startUtc.getUTCFullYear() === endUtc.getUTCFullYear() &&
    startUtc.getUTCMonth() === endUtc.getUTCMonth() &&
    startUtc.getUTCDate() === endUtc.getUTCDate();

  if (!sameDay) return null;

  return `${endUtc.getUTCFullYear()}-${pad(endUtc.getUTCMonth() + 1)}-${pad(endUtc.getUTCDate())}T${pad(endUtc.getUTCHours())}:${pad(endUtc.getUTCMinutes())}`;
}
