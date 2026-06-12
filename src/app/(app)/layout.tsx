import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { HouseholdProvider } from "@/components/providers/household-provider";
import { getCurrentHousehold, listHouseholds } from "@/lib/queries/household-queries";
import { auth } from "@/auth";

// These pages read from the database per request, so they must render
// dynamically rather than being statically prerendered at build time (which
// would require a populated database during the build / CI).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [household, householdList, session] = await Promise.all([
    getCurrentHousehold(),
    listHouseholds(),
    auth(),
  ]);

  return (
    <HouseholdProvider
      households={householdList.map((h) => ({ id: h.id, name: h.name }))}
      currentId={household?.id ?? null}
    >
      <CurrencyProvider currency={household?.currency ?? "INR"}>
        <div className="min-h-screen bg-background">
          <Sidebar />
          <div className="md:pl-64">
            <Header user={session?.user ?? null} />
            <main className="p-4 md:p-6 pb-24 md:pb-6">{children}</main>
          </div>
          <MobileNav />
        </div>
      </CurrencyProvider>
    </HouseholdProvider>
  );
}
