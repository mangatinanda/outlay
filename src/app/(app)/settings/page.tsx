import { Home } from "lucide-react";
import { CurrencySwitcher } from "@/components/settings/currency-switcher";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentHousehold } from "@/lib/queries/household-queries";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const household = await getCurrentHousehold();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Manage your app preferences" />

      {household ? (
        <Card className="rounded-2xl border-0 bg-card shadow-card">
          <CardHeader>
            <CardTitle className="font-display">Household</CardTitle>
            <CardDescription>Your household information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Home className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display font-medium">{household.name}</p>
                <p className="text-muted-foreground text-sm">Your household</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">Currency</p>
              <CurrencySwitcher current={household.currency} />
              <p className="text-muted-foreground text-xs">
                Applied to all amounts across the app. Changes the symbol and
                formatting only — your recorded amounts stay the same.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <NoHousehold description="Create a household to set its name and currency." />
      )}

      <Card className="rounded-2xl border-0 bg-card shadow-card">
        <CardHeader>
          <CardTitle className="font-display">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-muted-foreground text-sm">
          <p>Outlay v0.1.0</p>
          <p>A collaborative household expense tracker</p>
          <p>Built with Next.js, SQLite, and shadcn/ui</p>
        </CardContent>
      </Card>
    </div>
  );
}
