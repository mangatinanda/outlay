import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home } from "lucide-react";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { CurrencySwitcher } from "@/components/settings/currency-switcher";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const household = await getCurrentHousehold();
  const currency = household?.currency ?? "INR";

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Settings" description="Manage your app preferences" />

      <Card>
        <CardHeader>
          <CardTitle>Household</CardTitle>
          <CardDescription>Your household information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground">
              <Home className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">{household?.name ?? "My Home"}</p>
              <p className="text-sm text-muted-foreground">Your household</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Currency</p>
            <CurrencySwitcher current={currency} />
            <p className="text-xs text-muted-foreground">
              Applied to all amounts across the app. Changes the symbol and
              formatting only — your recorded amounts stay the same.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Outlay v0.1.0</p>
          <p>A collaborative household expense tracker</p>
          <p>Built with Next.js, SQLite, and shadcn/ui</p>
        </CardContent>
      </Card>
    </div>
  );
}
