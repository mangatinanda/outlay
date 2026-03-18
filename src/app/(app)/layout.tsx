import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";
import { seed } from "@/lib/db/seed";

async function ensureSeeded() {
  const existing = await db.select().from(households).limit(1);
  if (existing.length === 0) {
    await seed();
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureSeeded();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:pl-64">
        <Header />
        <main className="p-4 md:p-6 pb-24 md:pb-6">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
