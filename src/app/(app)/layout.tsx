import { auth } from "@/auth";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { PageTransition } from "@/components/motion/page-transition";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { HouseholdProvider } from "@/components/providers/household-provider";
import { getCurrentActor } from "@/lib/auth/actor";
import {
  getCurrentHousehold,
  listHouseholds,
} from "@/lib/queries/household-queries";
import { getUnreadCount } from "@/lib/queries/notification-queries";
import { resolveAccent } from "@/lib/theme/palette";

// These pages read from the database per request, so they must render
// dynamically rather than being statically prerendered at build time (which
// would require a populated database during the build / CI).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [household, householdList, session, actor, unreadCount] =
    await Promise.all([
      getCurrentHousehold(),
      listHouseholds(),
      auth(),
      getCurrentActor(),
      getUnreadCount(),
    ]);

  // A signed-in user with no household still enters the app shell; each menu
  // renders a friendly empty state (see <NoHousehold />) that nudges them to
  // create their first household when they're ready — no forced onboarding.

  // Per-household accent: overrides --primary + --primary-foreground for this
  // subtree (both light and dark mode), no-op if accent is null.
  const accent = resolveAccent(household?.accent);
  const accentStyle = accent
    ? ({
        "--primary": accent.primary,
        "--primary-foreground": accent.primaryForeground,
      } as React.CSSProperties)
    : undefined;

  return (
    <HouseholdProvider
      households={householdList.map((h) => ({ id: h.id, name: h.name }))}
      currentId={household?.id ?? null}
    >
      <CurrencyProvider currency={household?.currency ?? "INR"}>
        <div className="min-h-screen bg-background" style={accentStyle}>
          <Sidebar />
          <div className="md:pl-64">
            <Header
              user={session?.user ?? null}
              householdName={household?.name ?? null}
              isSuperadmin={actor?.kind === "superadmin"}
              unreadCount={actor?.kind === "user" ? unreadCount : null}
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
