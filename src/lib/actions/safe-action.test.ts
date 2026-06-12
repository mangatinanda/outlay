import { afterEach, describe, expect, it, vi } from "vitest";
import { safeAction } from "@/lib/actions/safe-action";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safeAction", () => {
  it("passes through the wrapped function's result", async () => {
    const action = safeAction("ok", async (n: number) => ({ success: true as const, n }));
    expect(await action(7)).toEqual({ success: true, n: 7 });
  });

  it("converts a thrown error into the { error } envelope and logs it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const action = safeAction("boom", async () => {
      throw new Error("db connection lost");
    });

    const result = await action();

    expect(result).toEqual({
      error: "Something went wrong. Please try again.",
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toContain("boom");
  });

  it("rethrows Next.js control-flow errors (redirect) untouched", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/login;307;",
    });
    const action = safeAction("redirects", async () => {
      throw redirectError;
    });

    await expect(action()).rejects.toBe(redirectError);
  });
});
