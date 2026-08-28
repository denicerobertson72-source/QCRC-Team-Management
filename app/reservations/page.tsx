import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ReservationActions } from "@/components/ReservationActions";
import { getMyPrivateBoatOutings, getMyProfileSummary, getMyReservations, getUpcomingOtherReservations } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { formatEasternDateTime, getEasternDateKey } from "@/lib/time";
import { ensureProfile } from "@/lib/auth";
import { ReservationTrackingManager } from "@/components/reservations/ReservationTrackingManager";
import { PrivateBoatOutingPanel } from "@/components/PrivateBoatOutingPanel";

type SearchParams = Promise<{
  reservation_status?: string;
  reservation_message?: string;
}>;

function formatDateTime(value: string) {
  return `${formatEasternDateTime(value)} ET`;
}

export default async function ReservationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [reservations, privateOutings, profile, otherReservations, { user }] = await Promise.all([
    getMyReservations(),
    getMyPrivateBoatOutings(),
    getMyProfileSummary(),
    getUpcomingOtherReservations(),
    ensureProfile(),
  ]);
  const activeCount =
    reservations.filter((reservation) => reservation.status === "reserved" || reservation.status === "checked_out").length +
    privateOutings.filter((outing) => outing.status === "checked_out").length;
  const reservationStatus = params.reservation_status === "error" ? "error" : params.reservation_status === "success" ? "success" : null;
  const reservationMessage = params.reservation_message ?? "";
  const activePrivateOuting = privateOutings.find((outing) => outing.status === "checked_out") ?? null;
  const canLaunchPrivateBoat = Boolean(profile.owns_private_boat && !activePrivateOuting);
  const todayKey = getEasternDateKey(new Date());
  const tomorrowKey = getEasternDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const todayOthers = otherReservations.filter((row) => row.date_key === todayKey);
  const tomorrowOthers = otherReservations.filter((row) => row.date_key === tomorrowKey);

  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">Boat Desk</span>
          <PageTitle
            title="My Reservations"
            subtitle={`Active outings: ${activeCount}. Record gate status from the Home page after returning; reservations do not remain here past their reservation day.`}
            actions={
              <Link href="/reserve" className="cta-link">
                Create a reservation
              </Link>
            }
          />
        </section>

        {reservationStatus && reservationMessage ? <FlashNotice status={reservationStatus} message={reservationMessage} /> : null}
        <ReservationTrackingManager
          currentUserId={user.id}
          outings={[
            ...reservations.map((reservation) => ({ id: reservation.id, kind: "reservation" as const, status: reservation.status })),
            ...privateOutings.map((outing) => ({ id: outing.id, kind: "private_boat" as const, status: outing.status })),
          ]}
        />

        <div className="stack">
          {profile.owns_private_boat ? (
            <Card className="stack">
              <h3>Private Boat</h3>
              <p className="muted">
                Launch and return your private boat here for safety tracking.
              </p>
              {activePrivateOuting?.checked_out_at ? (
                <p className="muted">Launched: {formatDateTime(activePrivateOuting.checked_out_at)}</p>
              ) : null}
              <PrivateBoatOutingPanel
                canLaunch={canLaunchPrivateBoat}
                activeOuting={activePrivateOuting}
              />
            </Card>
          ) : null}
          {reservations.length === 0 ? <Card subtle>No reservations yet.</Card> : null}
          {reservations.map((reservation) => (
            <Card key={reservation.id} className={`stack${reservation.status === "cancelled" ? " reservation-cancelled-card" : ""}`}>
              {reservation.status === "cancelled" ? <strong className="reservation-cancelled-label">CANCELLED</strong> : null}
              <h3>{reservation.boats?.name ?? reservation.boat_id}</h3>
              <p className="muted">
                {formatDateTime(reservation.start_time)} to {new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/New_York",
                  timeStyle: "short",
                }).format(new Date(reservation.end_time))}{" "}
                ET
              </p>
              {reservation.status === "cancelled" ? (
                <p className="error">This reservation was cancelled. The boat is available for someone else to reserve.</p>
              ) : null}
              <ReservationActions reservation={reservation} />
            </Card>
          ))}

          <Card className="stack">
            <h3>Other Rowers Today and Tomorrow</h3>
            {todayOthers.length === 0 && tomorrowOthers.length === 0 ? <p className="muted">No other reservations posted for today or tomorrow yet.</p> : null}
            {todayOthers.length > 0 ? (
              <div className="stack" style={{ gap: "0.45rem" }}>
                <strong>Today</strong>
                {todayOthers.map((row) => (
                  <p key={row.id} className="muted">
                    {row.member_name} | {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeStyle: "short" }).format(new Date(row.start_time))} ET | {row.boat_class_id}
                  </p>
                ))}
              </div>
            ) : null}
            {tomorrowOthers.length > 0 ? (
              <div className="stack" style={{ gap: "0.45rem" }}>
                <strong>Tomorrow</strong>
                {tomorrowOthers.map((row) => (
                  <p key={row.id} className="muted">
                    {row.member_name} | {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeStyle: "short" }).format(new Date(row.start_time))} ET | {row.boat_class_id}
                  </p>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      </main>
    </>
  );
}
