import { HouseholdManager } from "@/components/households/household-manager";
import { PageHeader } from "@/components/shared/page-header";
import {
  getCurrentHousehold,
  listHouseholds,
} from "@/lib/queries/household-queries";

export const metadata = { title: "Households" };

export default async function HouseholdsPage() {
  const households = await listHouseholds();
  const current = await getCurrentHousehold();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Households"
        description="Create, switch, and manage your households"
      />
      <HouseholdManager
        households={households.map((h) => ({
          id: h.id,
          name: h.name,
          currency: h.currency,
          accent: h.accent,
        }))}
        currentId={current?.id ?? null}
      />
    </div>
  );
}
