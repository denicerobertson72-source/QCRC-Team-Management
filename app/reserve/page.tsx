import { TopNav } from "@/components/TopNav";
import { ReservationForm } from "@/components/ReservationForm";
import { getAvailableBoats, getBoats, getMyProfileSummary } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { deriveReservationEndLocal } from "@/lib/reservations";
import { formatEasternDateTime } from "@/lib/time";

type ReserveSearchParams = Promise<{
  start?: string;
  boatClassId?: string;
  reservation_status?: string;
  reservation_message?: string;
}>;

function toInputDateTime(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export default async function ReservePage({
  searchParams,
}: {
  searchParams: ReserveSearchParams;
}) {
  const params = await searchParams;

  const now = new Date();

  const start = params.start ?? toInputDateTime(now);
  const end = deriveReservationEndLocal(start);
  const boatClassId = params.boatClassId ?? "";
  const reservationStatus = params.reservation_status === "error" ? "error" : params.reservation_status === "success" ? "success" : null;
  const reservationMessage = params.reservation_message ?? "";
  const reserveReturnTo = `/reserve?start=${encodeURIComponent(start)}${
    boatClassId ? `&boatClassId=${encodeURIComponent(boatClassId)}` : ""
  }`;

  const [availableBoats, allBoats, profile] = await Promise.all([
    getAvailableBoats(start, end ?? start, boatClassId || undefined),
    getBoats(),
    getMyProfileSummary(),
  ]);

  const availableIds = new Set(availableBoats.map((b) => b.id));
  const visibleBoats = boatClassId ? allBoats.filter((b) => b.boat_class_id === boatClassId) : allBoats;

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
          <Field label="Boat Class">
            <select name="boatClassId" defaultValue={boatClassId}>
              <option value="">All</option>
              <option value="1x">1x</option>
              <option value="2x">2x</option>
              <option value="4x">4x</option>
            </select>
          </Field>
          <p className="muted">
            {end ? `End time will be set automatically to ${formatEasternDateTime(end)} ET.` : "Choose a start time that stays within the same day."}
          </p>
          <Button type="submit">Find Eligible Boats</Button>
        </form>

        <div className="grid">
          {visibleBoats.length === 0 ? <Card subtle>No boats found.</Card> : null}

          {visibleBoats.map((boat) => {
            const reservable = boat.status === "available" && availableIds.has(boat.id);
            if (reservable) {
              return <ReservationForm key={boat.id} boat={boat} start={start} returnTo={reserveReturnTo} />;
            }

            return (
              <Card key={boat.id} className="stack">
                <div className="page-title">
                  <h3>{boat.name}</h3>
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
            );
          })}
        </div>
      </main>
    </>
  );
}
