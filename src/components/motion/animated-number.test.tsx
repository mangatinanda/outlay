// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useReducedMotionMock = vi.fn<() => boolean>();

vi.mock("motion/react", async () => {
  const actual =
    await vi.importActual<typeof import("motion/react")>("motion/react");
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

import { AnimatedNumber } from "./animated-number";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

describe("AnimatedNumber", () => {
  beforeEach(() => {
    useReducedMotionMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the formatted final value immediately under reduced motion", () => {
    useReducedMotionMock.mockReturnValue(true);
    render(<AnimatedNumber value={1234} format={usd} />);
    expect(screen.getByText("$1,234")).toBeInTheDocument();
  });

  it("formats via the provided format fn (uses format, not raw value)", () => {
    useReducedMotionMock.mockReturnValue(true);
    render(<AnimatedNumber value={5} format={(n) => `${n} pts`} />);
    expect(screen.getByText("5 pts")).toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });

  // Guards the reduced-motion early-return. A synchronous getByText on first
  // mount cannot tell the branches apart: motion's useSpring initializes at the
  // source value, so the animated branch *also* renders format(value) on the
  // first render. The branches only diverge when `value` changes: under reduced
  // motion the early-return re-renders format(value) synchronously, while the
  // animated branch holds the spring's previous output (no rAF loop advances it
  // in happy-dom). These two tests rerender 0 -> 1000 and assert that divergence,
  // so deleting `if (reduce) return ...` from animated-number.tsx fails them.
  it("updates synchronously to the new value when motion is reduced", () => {
    useReducedMotionMock.mockReturnValue(true);
    const { rerender } = render(<AnimatedNumber value={0} format={usd} />);
    expect(screen.getByText("$0")).toBeInTheDocument();

    rerender(<AnimatedNumber value={1000} format={usd} />);
    // Early-return path: the new formatted value is shown immediately.
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("does not jump straight to the new value when animating (spring path)", () => {
    useReducedMotionMock.mockReturnValue(false);
    const { rerender } = render(<AnimatedNumber value={0} format={usd} />);
    expect(screen.getByText("$0")).toBeInTheDocument();

    rerender(<AnimatedNumber value={1000} format={usd} />);
    // Spring path: the displayed value has not advanced to the target yet, so
    // the final value must NOT appear synchronously. (If the reduced-motion
    // early-return were removed, the reduced-motion test above would render via
    // this same spring path and fail to show $1,000 immediately.)
    expect(screen.queryByText("$1,000")).not.toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
  });
});
