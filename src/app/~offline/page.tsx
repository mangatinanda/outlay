import { WifiOff } from "lucide-react";

export const metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <WifiOff className="h-8 w-8" />
      </div>
      <div>
        <h1 className="font-semibold text-xl">You&apos;re offline</h1>
        <p className="mt-1 max-w-xs text-muted-foreground text-sm">
          This page isn&apos;t cached yet. Reconnect to load it, or revisit a
          page you&apos;ve already opened.
        </p>
      </div>
    </div>
  );
}
