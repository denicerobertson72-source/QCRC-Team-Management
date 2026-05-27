import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ReservationActions } from "@/components/ReservationActions";
import { getMyReservations } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { formatEasternDateTime } from "@/lib/time";

type SearchParams = Promise<{
  reservation_status?: string;
  reservation_message?: string;
}>;

function formatDateTime(value: string) {
  return `${formatEasternDateTime(value)} ET`;
}

export default async function ReservationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const reservations = await getMyReservations();
  const activeCount = reservations.filter((reservation) => reservation.status === "reserved" || reservation.status === "checked_out").length;
  const reservationStatus = params.reservation_status === "error" ? "error" : params.reservation_status === "success" ? "success" : null;
  const reservationMessage = params.reservation_message ?? "";

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

        <div className="stack">
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
