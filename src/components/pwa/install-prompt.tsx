"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Browser-native "Add to Home Screen" affordance.
 *
 * - Chrome/Edge/Android: captures the standard `beforeinstallprompt` event
 *   and surfaces an Install button. Calling `event.prompt()` shows the OS UI.
 * - iOS Safari: the event doesn't exist, so we render a one-time hint
 *   pointing at the Share → Add to Home Screen flow.
 * - Dismissal persists in localStorage so the card never nags twice.
 * - Hides itself when the app already runs as installed (display-mode:
 *   standalone) or once `appinstalled` fires.
 */

const DISMISSED_KEY = "outlay-install-dismissed-v1";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari legacy
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start hidden; hydrate after mount

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    setDismissed(false);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // iOS never fires beforeinstallprompt — show the share-menu hint there.
    if (isIOS()) setShowIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "dismissed") dismiss();
  }

  if (dismissed) return null;
  if (!deferred && !showIosHint) return null;

  return (
    <div className="relative rounded-2xl border border-border bg-card p-4 shadow-card">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          {deferred ? (
            <Download className="h-5 w-5" />
          ) : (
            <Share className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-display font-semibold text-sm">Install Outlay</p>
            <p className="text-muted-foreground text-sm">
              {deferred
                ? "Add it to your home screen for one-tap access."
                : "Tap the Share icon below, then “Add to Home Screen”."}
            </p>
          </div>
          {deferred && (
            <div className="flex gap-2">
              <Button size="sm" onClick={install}>
                Install
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Maybe later
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
