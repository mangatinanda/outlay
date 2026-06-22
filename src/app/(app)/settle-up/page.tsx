import { SettleUpView } from "@/components/settle-up/settle-up-view";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { getMembers } from "@/lib/queries/member-queries";
import { getSettlements, getSettleUp } from "@/lib/queries/settle-up-queries";

export const metadata = { title: "Settle Up" };
export const dynamic = "force-dynamic";

export default async function SettleUpPage() {
  const household = await getCurrentHousehold();
  if (!household) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settle up" />
        <NoHousehold />
      </div>
    );
  }

  const [settleUp, history, members] = await Promise.all([
    getSettleUp(household.id),
    getSettlements(household.id),
    getMembers(household.id),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Settle up"
        description="Who owes whom in this household"
      />
      <SettleUpView
        balances={settleUp.balances}
        suggestions={settleUp.suggestions}
        settledUp={settleUp.settledUp}
        history={history}
        participants={members
          .filter((m) => m.includeInSettleUp)
          .map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}
