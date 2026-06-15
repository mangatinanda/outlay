import { describe, expect, it } from "vitest";
import { envSchema, formatEnvError } from "./env";

const valid = {
  DATABASE_URL: "file:./data/expense.db",
  AUTH_SECRET: "x".repeat(32),
  HOUSEHOLD_PASSCODE: "swordfish",
};

describe("envSchema", () => {
  it("accepts the minimal valid input", () => {
    const result = envSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_URL).toBe("file:./data/expense.db");
      expect(result.data.AUTH_SECRET).toBe("x".repeat(32));
      expect(result.data.HOUSEHOLD_PASSCODE).toBe("swordfish");
      expect(result.data.AUTH_GOOGLE_ID).toBeUndefined();
      expect(result.data.AUTH_GOOGLE_SECRET).toBeUndefined();
      expect(result.data.HOUSEHOLD_ALLOWED_EMAILS).toBeUndefined();
      expect(result.data.TURSO_AUTH_TOKEN).toBeUndefined();
    }
  });

  it("accepts the optional vars when present", () => {
    const result = envSchema.safeParse({
      ...valid,
      AUTH_GOOGLE_ID: "id",
      AUTH_GOOGLE_SECRET: "secret",
      HOUSEHOLD_ALLOWED_EMAILS: "a@b.com,c@d.com",
      TURSO_AUTH_TOKEN: "token",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.AUTH_GOOGLE_ID).toBe("id");
      expect(result.data.TURSO_AUTH_TOKEN).toBe("token");
    }
  });

  it("rejects when a required var is missing", () => {
    const { AUTH_SECRET, ...rest } = valid;
    void AUTH_SECRET;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("AUTH_SECRET");
    }
  });

  it("rejects an invalid value (empty required string)", () => {
    const result = envSchema.safeParse({ ...valid, HOUSEHOLD_PASSCODE: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("HOUSEHOLD_PASSCODE");
    }
  });

  it("treats an empty optional string as absent (Vercel empty-var quirk)", () => {
    const result = envSchema.safeParse({ ...valid, TURSO_AUTH_TOKEN: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TURSO_AUTH_TOKEN).toBeUndefined();
    }
  });
});

describe("formatEnvError", () => {
  it("lists each offending var with a clear, fail-fast message", () => {
    const result = envSchema.safeParse({ DATABASE_URL: "file:./x.db" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatEnvError(result.error);
      expect(message).toContain("Invalid environment variables");
      expect(message).toContain("AUTH_SECRET");
      expect(message).toContain("HOUSEHOLD_PASSCODE");
    }
  });
});
