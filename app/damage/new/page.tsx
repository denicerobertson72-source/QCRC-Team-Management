import { TopNav } from "@/components/TopNav";
import { DamageReportForm } from "@/components/DamageReportForm";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { getBoats, getMyReservations } from "@/lib/queries";

type SearchParams = Promise<{
  damage_status?: string;
  damage_message?: string;
}>;

export default async function NewDamagePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = params.damage_status === "error" ? "error" : params.damage_status === "success" ? "success" : null;
  const message = params.damage_message ?? "";
  const [boats, reservations] = await Promise.all([getBoats(), getMyReservations()]);

  return (
    <>
      <TopNav />
      <main className="stack">
        {status && message ? <FlashNotice status={status} message={message} /> : null}
        <DamageReportForm boats={boats} reservations={reservations} />
      </main>
    </>
  );
}
