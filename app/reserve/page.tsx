import { TopNav } from "@/components/TopNav";
import { ReservationForm } from "@/components/ReservationForm";
import { getAvailableBoats, getBoatAvailabilityBlocks, getBoats, getMyProfileSummary } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { deriveReservationEndLocal } from "@/lib/reservations";
import { easternLocalInputToIso, formatEasternDateTime, formatEasternLocalInput, nowEasternDateTimeLocalValue } from "@/lib/time";

type ReserveSearchParams = Promise<{
  start?: string;
  boatClassId?: string;
  boatName?: string;
  boatNumber?: string;
  onlyAvailable?: string;
  reservation_status?: string;
  reservation_message?: string;
}>;

export default async function ReservePage({
  searchParams,
}: {
  searchParams: ReserveSearchParams;
}) {
  const params = await searchParams;
  const start = params.start ?? nowEasternDateTimeLocalValue();
  const end = deriveReservationEndLocal(start);
  const boatClassId = params.boatClassId ?? "";
  const boatName = (params.boatName ?? "").trim().toLowerCase();
  const boatNumber = (params.boatNumber ?? "").trim().toLowerCase();
  const onlyAvailable = params.onlyAvailable === "true";
  const reservationStatus = params.reservation_status === "error" ? "error" : params.reservation_status === "success" ? "success" : null;
  const reservationMessage = params.reservation_message ?? "";
  const reserveReturnTo = `/reserve?start=${encodeURIComponent(start)}${
    boatClassId ? `&boatClassId=${encodeURIComponent(boatClassId)}` : ""
  }${params.boatName ? `&boatName=${encodeURIComponent(params.boatName)}` : ""}${params.boatNumber ? `&boatNumber=${encodeURIComponent(params.boatNumber)}` : ""}${onlyAvailable ? "&onlyAvailable=true" : ""}`;

  const [availableBoats, allBoats, profile, availabilityBlocks] = await Promise.all([
    getAvailableBoats(start, end ?? start, boatClassId || undefined),
    getBoats(),
    getMyProfileSummary(),
    getBoatAvailabilityBlocks(),
  ]);

  const availableIds = new Set(availableBoats.map((b) => b.id));
  const filteredBoats = allBoats.filter((b) => {
    if (boatClassId && b.boat_class_id !== boatClassId) return false;
    if (boatName && !b.name.toLowerCase().includes(boatName)) return false;
    if (boatNumber && !(b.boat_number ?? "").toLowerCase().includes(boatNumber)) return false;
    return true;
  });
  const visibleBoats = onlyAvailable ? filteredBoats.filter((boat) => boat.status === "available" && availableIds.has(boat.id)) : filteredBoats;
  const startIso = easternLocalInputToIso(start);
  const endIso = end ? easternLocalInputToIso(end) : null;
  const matchingBlocks =
    startIso && endIso
      ? availabilityBlocks.filter((block) => {
          const overlaps = new Date(block.starts_at).getTime() < new Date(endIso).getTime() && new Date(block.ends_at).getTime() > new Date(startIso).getTime();
          if (!overlaps) return false;
          if (block.applies_to_membership_type && block.applies_to_membership_type !== profile.membership_type) return false;
          if (block.applies_to_boat_class_id && boatClassId && block.applies_to_boat_class_id !== boatClassId) return false;
          return true;
        })
      : [];
  const noReservableBoats = filteredBoats.every((boat) => !(boat.status === "available" && availableIds.has(boat.id)));

  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">Boat Matching</span>
          <PageTitle
            title="Reserve a Boat"
            subtitle={`Skill level: ${profile.skill_level}. Weight class: ${profile.weight_class}. Reservations are limited to one two-hour outing on a single day.`}
          />
        </section>

        {reservationStatus && reservationMessage ? <FlashNotice status={reservationStatus} message={reservationMessage} /> : null}

        <form method="get" className="card form-grid">
          <Field label="Start time">
            <input name="start" type="datetime-local" defaultValue={start} required />
          </Field>
          <Field label="Boat Name">
            <input name="boatName" defaultValue={params.boatName ?? ""} placeholder="Search by boat name" />
          </Field>
          <Field label="Boat Number">
            <input name="boatNumber" defaultValue={params.boatNumber ?? ""} placeholder="Search by number" />
          </Field>
          <Field label="Boat Class">
            <select name="boatClassId" defaultValue={boatClassId}>
              <option value="">All</option>
              <option value="1x">1x</option>
              <option value="2x">2x</option>
              <option value="4x">4x</option>
            </select>
          </Field>
          <label className="member-checkbox-row">
            <input name="onlyAvailable" type="checkbox" value="true" defaultChecked={onlyAvailable} />
            <span>Open only available boats</span>
          </label>
          <p className="muted">{end ? `End time will be set automatically to ${formatEasternLocalInput(end)} ET.` : "Choose a start time that stays within the same day."}</p>
          <Button type="submit">Find Eligible Boats</Button>
        </form>

        {matchingBlocks.length > 0 && noReservableBoats ? (
          <Card subtle className="stack">
            <strong>No boats are currently available for this time window.</strong>
            <p className="muted">
              An active availability block is in effect for your search window.
            </p>
            <div className="stack">
              {matchingBlocks.map((block) => (
                <p key={block.id} className="muted">
                  <strong>{block.title}</strong>: {formatEasternDateTime(block.starts_at)} ET to {formatEasternDateTime(block.ends_at)} ET
                  {block.notes ? ` — ${block.notes}` : ""}
                </p>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="grid">
          {visibleBoats.length === 0 ? <Card subtle>No boats found.</Card> : null}

          {visibleBoats.map((boat) => {
            const reservable = boat.status === "available" && availableIds.has(boat.id);
            return (
              <details key={boat.id} className="card boat-collapsible">
                <summary className="boat-summary">
                  <div className="boat-summary-main">
                    <h3>
                      {boat.name}
                      {boat.boat_number ? ` #${boat.boat_number}` : ""}
                    </h3>
                    <p className="muted">
                      {boat.boat_class_id} | {boat.boat_type} | skill {boat.required_skill_level} | weight {boat.weight_class ?? "Any"}
                    </p>
                  </div>
                  <div className="boat-summary-side">
                    <div className="row">
                      <StatusChip label={boat.boat_class_id} />
                      <StatusChip label={reservable ? "available" : boat.status === "available" ? "unavailable" : "out of service"} kind={reservable ? "checked_out" : "reserved"} />
                    </div>
                    <span className="member-summary-hint">{reservable ? "Click to reserve" : "Click for details"}</span>
                  </div>
                </summary>
                <div className="boat-details">
                  {reservable ? (
                    <ReservationForm boat={boat} start={start} returnTo={reserveReturnTo} />
                  ) : (
                    <Card className="stack">
                      <div className="page-title">
                        <h3>
                          {boat.name}
                          {boat.boat_number ? ` #${boat.boat_number}` : ""}
                        </h3>
                        <StatusChip label={boat.status === "available" ? "unavailable" : "out of service"} />
                      </div>
                      <p className="muted">
                        {boat.boat_class_id} | {boat.boat_type} | skill {boat.required_skill_level} | weight {boat.weight_class ?? "Any"}
                      </p>
                      <p>
                        This boat cannot be reserved right now.
                        {boat.status !== "available" ? " Marked out of service by admin." : " It is unavailable for this time window."}
                      </p>
                    </Card>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </main>
    </>
  );
}
