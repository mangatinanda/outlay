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
});
