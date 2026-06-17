export const TRACKING_STORAGE_KEY = "rowing-live-sharing-outing-key";
export const INTENT_STORAGE_KEY = "rowing-live-sharing-intent-outing-key";

export type TrackableOutingKind = "reservation" | "private_boat";

export function makeOutingKey(kind: TrackableOutingKind, id: string) {
  return `${kind}:${id}`;
}

export function parseOutingKey(value: string | null): { kind: TrackableOutingKind; id: string } | null {
  if (!value) return null;
  const [kindRaw, ...rest] = value.split(":");
  const id = rest.join(":");
  if (!id) return null;
  if (kindRaw !== "reservation" && kindRaw !== "private_boat") return null;
  return { kind: kindRaw, id };
}
