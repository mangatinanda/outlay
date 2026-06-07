import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { getDefaultHousehold } from "@/lib/queries/household-queries";
import { CurrencySwitcher } from "@/components/settings/currency-switcher";

export const metadata = { title: "Settings" };

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default async function SettingsPage() {
  const household = await getDefaultHousehold();
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
          <CardTitle>Account</CardTitle>
          <CardDescription>Connect your Google account for sync across devices</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="gap-3" disabled>
            <GoogleIcon />
            Sign in with Google
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Google authentication coming soon.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>HomeExpense v0.1.0</p>
          <p>A collaborative household expense tracker</p>
          <p>Built with Next.js, SQLite, and shadcn/ui</p>
        </CardContent>
      </Card>
    </div>
  );
}
