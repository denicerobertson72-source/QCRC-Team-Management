// Upload no more often than every 15 seconds for movement, but ensure Safety
// receives a position at least once per minute during an active outing.
export const MAX_LOCATION_UPLOAD_INTERVAL_MS = 60_000;
export const MIN_LOCATION_UPLOAD_INTERVAL_MS = 15_000;
export const LOCATION_MOVEMENT_THRESHOLD_METERS = 50;
export const LOCATION_UPLOAD_RETRY_INTERVAL_MS = 5_000;
export const SAFETY_LOCATION_REFRESH_INTERVAL_MS = 30_000;

// Safety freshness reflects the age of the last point successfully stored in
// Supabase, rather than the browser's raw GPS callback cadence.
export const LOCATION_DELAYED_AFTER_MS = 90_000;
export const LOCATION_STALE_AFTER_MS = 180_000;

export type LocationFreshness = "current" | "delayed" | "stale" | "unavailable";

export function getLocationFreshness(recordedAt: string | null | undefined, now = Date.now()): LocationFreshness {
  if (!recordedAt || Number.isNaN(new Date(recordedAt).getTime())) return "unavailable";
  const age = now - new Date(recordedAt).getTime();
  if (age > LOCATION_STALE_AFTER_MS) return "stale";
  if (age > LOCATION_DELAYED_AFTER_MS) return "delayed";
  return "current";
}

export function distanceBetweenMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const latitudeFrom = toRadians(from.latitude);
  const latitudeTo = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function formatLocationAge(recordedAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(recordedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}
