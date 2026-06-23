"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getServerProgressSnapshot,
  isProgressActive,
  setNavInFlight,
  subscribeProgress,
} from "@/lib/progress";

// How far the bar creeps while we're still waiting (it never reaches 100%
// until the work actually finishes), and how long that trickle takes.
const TRICKLE_TARGET = 0.9;
const TRICKLE_DURATION = 6;
// Safety net: if a navigation never commits (e.g. it was blocked or pointed at
// the current route), force the bar to finish after this long so it can't hang.
const NAV_SAFETY_MS = 4000;

/**
 * A slim, app-wide top loading bar shown whenever the app is waiting on the
 * server — route navigations (detected from internal link clicks, completed
 * when the committed pathname changes) and server-action saves (flagged via
 * `withProgress`). Token-styled and degrades to an instant, non-animated bar
 * under reduced motion.
 */
export function TopProgressBar() {
  const active = useSyncExternalStore(
    subscribeProgress,
    isProgressActive,
    getServerProgressSnapshot,
  );
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navSafety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Detect navigation START ---------------------------------------------
  // The App Router exposes no router events, so we detect the start of a
  // navigation the same way top-loader libraries do: a capture-phase click on
  // an internal <a> that points somewhere new. The navigation is considered
  // finished by the effect below, when the committed route actually changes.
  useEffect(() => {
    // Clear any stale nav flag in case this component remounted while a
    // navigation was mid-flight (e.g. an errored navigation tore down the tree
    // and cancelled the per-nav safety timeout). On a normal first mount the
    // flag is already false, so this is a no-op.
    setNavInFlight(false);

    function beginNav() {
      setNavInFlight(true);
      if (navSafety.current) clearTimeout(navSafety.current);
      navSafety.current = setTimeout(() => {
        setNavInFlight(false);
      }, NAV_SAFETY_MS);
    }

    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // Only same-origin navigations to a different path/query count.
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      beginNav();
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      if (navSafety.current) clearTimeout(navSafety.current);
    };
  }, []);

  // --- Detect navigation FINISH --------------------------------------------
  // A committed route change means the navigation has landed. We compare the
  // current route key against the last one we saw (a ref initialised to null,
  // so the first run only records the starting route and never falsely clears).
  // pathname/searchParams are read in the effect BODY so the lint autofixer
  // keeps them as real deps — a dependency-only value would be stripped.
  const lastRoute = useRef<string | null>(null);
  useEffect(() => {
    const routeKey = `${pathname}?${searchParams}`;
    if (lastRoute.current === null) {
      lastRoute.current = routeKey;
      return;
    }
    if (lastRoute.current === routeKey) return;
    lastRoute.current = routeKey;
    if (navSafety.current) clearTimeout(navSafety.current);
    setNavInFlight(false);
  }, [searchParams, pathname]);

  // --- Drive the visual ----------------------------------------------------
  const progress = useMotionValue(0);
  const opacity = useMotionValue(0);
  const glowLeft = useTransform(progress, (value) => `${value * 100}%`);

  const showing = useRef(false);
  useEffect(() => {
    if (active) {
      showing.current = true;
      opacity.set(1);
      if (reduceMotion) {
        progress.set(TRICKLE_TARGET);
        return;
      }
      // Creep toward (but never reach) the target while we wait.
      const controls = animate(progress, TRICKLE_TARGET, {
        duration: TRICKLE_DURATION,
        ease: [0.1, 0.7, 0.2, 1],
      });
      return () => controls.stop();
    }

    // Nothing is showing — stay hidden.
    if (!showing.current) return;
    showing.current = false;

    if (reduceMotion) {
      opacity.set(0);
      progress.set(0);
      return;
    }
    // Snap to full, fade out, then reset for the next run.
    const finish = animate(progress, 1, { duration: 0.2, ease: "easeOut" });
    const fade = animate(opacity, 0, { duration: 0.25, delay: 0.18 });
    const reset = setTimeout(() => progress.set(0), 600);
    return () => {
      finish.stop();
      fade.stop();
      clearTimeout(reset);
    };
  }, [active, reduceMotion, opacity, progress]);

  return (
    <motion.div
      aria-hidden
      style={{ opacity }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
    >
      <motion.div
        style={{ scaleX: progress }}
        className="h-full w-full origin-left bg-primary"
      />
      <motion.span
        style={{ left: glowLeft }}
        className="absolute top-0 h-full w-16 -translate-x-1/2 rounded-full bg-primary/60 blur-sm"
      />
    </motion.div>
  );
}
