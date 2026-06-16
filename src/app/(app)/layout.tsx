import { auth } from "@/auth";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { PageTransition } from "@/components/motion/page-transition";
import { FirstHousehold } from "@/components/onboarding/first-household";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { HouseholdProvider } from "@/components/providers/household-provider";
import { getCurrentActor } from "@/lib/auth/actor";
import {
  getCurrentHousehold,
  listHouseholds,
} from "@/lib/queries/household-queries";

// These pages read from the database per request, so they must render
// dynamically rather than being statically prerendered at build time (which
// would require a populated database during the build / CI).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [household, householdList, session, actor] = await Promise.all([
    getCurrentHousehold(),
    listHouseholds(),
    auth(),
    getCurrentActor(),
  ]);

  // A signed-in user who belongs to no household sees an onboarding screen
  // instead of the empty app shell. Superadmin always has households.
  if (actor?.kind === "user" && householdList.length === 0) {
    return <FirstHousehold />;
  }

  return (
    <HouseholdProvider
      households={householdList.map((h) => ({ id: h.id, name: h.name }))}
      currentId={household?.id ?? null}
    >
      <CurrencyProvider currency={household?.currency ?? "INR"}>
        <div className="min-h-screen bg-background">
          <Sidebar />
          <div className="md:pl-64">
            <Header
              user={session?.user ?? null}
              householdName={household?.name ?? null}
              isSuperadmin={actor?.kind === "superadmin"}
            />
            <main className="p-4 pb-24 md:p-6 md:pb-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
          <MobileNav />
        </div>
      </CurrencyProvider>
    </HouseholdProvider>
  );
}
