import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ReservationActions } from "@/components/ReservationActions";
import { getMyPrivateBoatOutings, getMyProfileSummary, getMyReservations } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { formatEasternDateTime } from "@/lib/time";
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
  const [reservations, privateOutings, profile, { user }] = await Promise.all([
    getMyReservations(),
    getMyPrivateBoatOutings(),
    getMyProfileSummary(),
    ensureProfile(),
  ]);
  const activeCount =
    reservations.filter((reservation) => reservation.status === "reserved" || reservation.status === "checked_out").length +
    privateOutings.filter((outing) => outing.status === "checked_out").length;
  const reservationStatus = params.reservation_status === "error" ? "error" : params.reservation_status === "success" ? "success" : null;
  const reservationMessage = params.reservation_message ?? "";
  const activePrivateOuting = privateOutings.find((outing) => outing.status === "checked_out") ?? null;
  const canLaunchPrivateBoat = Boolean(profile.owns_private_boat && profile.boat_storage_fee_ok && !activePrivateOuting);

  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">Boat Desk</span>
          <PageTitle
            title="My Reservations"
            subtitle={`Active outings: ${activeCount}. Returned and cancelled outings drop off this list but remain saved in club history.`}
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
                {!profile.boat_storage_fee_ok ? " Boat storage dues must be current before launch is available." : ""}
              </p>
              {activePrivateOuting?.checked_out_at ? (
                <p className="muted">Launched: {formatDateTime(activePrivateOuting.checked_out_at)}</p>
              ) : null}
              <PrivateBoatOutingPanel canLaunch={canLaunchPrivateBoat} activeOuting={activePrivateOuting} />
            </Card>
          ) : null}
          {reservations.length === 0 ? <Card subtle>No reservations yet.</Card> : null}
          {reservations.map((reservation) => (
            <Card key={reservation.id} className="stack">
              <h3>{reservation.boats?.name ?? reservation.boat_id}</h3>
              <p className="muted">
                {formatDateTime(reservation.start_time)} to {new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/New_York",
                  timeStyle: "short",
                }).format(new Date(reservation.end_time))}{" "}
                ET
              </p>
              <ReservationActions reservation={reservation} />
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
