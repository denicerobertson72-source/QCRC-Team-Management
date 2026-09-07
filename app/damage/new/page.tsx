import { TopNav } from "@/components/TopNav";
import { DamageReportForm } from "@/components/DamageReportForm";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { getBoats, getMyReservations } from "@/lib/queries";

type SearchParams = Promise<{
  damage_status?: string;
  damage_message?: string;
  reservation_id?: string;
  boat_id?: string;
}>;

export default async function NewDamagePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = params.damage_status === "error" ? "error" : params.damage_status === "success" ? "success" : null;
  const message = params.damage_message ?? "";
  const [boats, reservations] = await Promise.all([getBoats(), getMyReservations()]);
  const selectedReservation = reservations.find((reservation) => reservation.id === params.reservation_id) ?? null;
  const defaultReservationId = selectedReservation?.id ?? "";
  const requestedBoatId = selectedReservation?.boat_id ?? params.boat_id ?? "";
  const defaultBoatId = boats.some((boat) => boat.id === requestedBoatId) ? requestedBoatId : "";

  return (
    <>
      <TopNav />
      <main className="stack">
        {status && message ? <FlashNotice status={status} message={message} /> : null}
        <DamageReportForm
          boats={boats}
          reservations={reservations}
          defaultReservationId={defaultReservationId}
          defaultBoatId={defaultBoatId}
        />
      </main>
    </>
  );
}
