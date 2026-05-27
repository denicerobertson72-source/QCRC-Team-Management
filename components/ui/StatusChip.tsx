export function StatusChip({ label, kind = "default" }: { label: string; kind?: "default" | "reserved" | "checked_out" | "checked_in" }) {
  const kindClass = kind === "reserved" ? "status-reserved" : kind === "checked_out" ? "status-checked_out" : kind === "checked_in" ? "status-checked_in" : "";
  return <span className={`status-chip ${kindClass}`.trim()}>{label}</span>;
}
