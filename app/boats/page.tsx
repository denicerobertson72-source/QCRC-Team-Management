import { TopNav } from "@/components/TopNav";
import { BoatCard } from "@/components/BoatCard";
import { getBoats } from "@/lib/queries";
import { PageTitle } from "@/components/ui/PageTitle";

export default async function BoatsPage() {
  const boats = await getBoats();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Boats" subtitle="Inventory, status, and setup notes." />
        <div className="grid">
          {boats.map((boat) => (
            <BoatCard key={boat.id} boat={boat} />
          ))}
        </div>
      </main>
    </>
  );
}
