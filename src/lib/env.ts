import { z } from "zod/v4";

// Vercel (and some shells) inject unset variables as empty strings rather
// than leaving them absent. Treat "" as "not provided" for optional vars so
// the DB-free CI build — which sets only AUTH_SECRET + DATABASE_URL — passes.
const optionalString = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().min(1).optional(),
);

export const envSchema = z.object({
  // Required at runtime, including a real deployment.
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  HOUSEHOLD_PASSCODE: z.string().min(1),

  // Optional: Google sign-in and Turso are not needed for the CI build.
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  HOUSEHOLD_ALLOWED_EMAILS: optionalString,
  TURSO_AUTH_TOKEN: optionalString,
});

export type Env = z.infer<typeof envSchema>;

/** Human-readable, fail-fast summary listing each missing/invalid variable. */
export function formatEnvError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)";
    return `  - ${name}: ${issue.message}`;
  });
  return `Invalid environment variables:\n${lines.join("\n")}`;
}

// Next.js sets NEXT_PHASE to "phase-production-build" while `next build` runs.
// The build executes no queries (pages are dynamic) and CI provides only
// AUTH_SECRET + DATABASE_URL, so we relax required-var checks during the
// build and re-enforce the full schema at runtime (fail-fast).
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function parseEnv(): Env {
  const schema = isBuildPhase ? envSchema.partial() : envSchema;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  // During the build phase the partial parse may omit required keys; the
  // returned object is only ever read by code paths that don't run at build
  // time, so the cast is safe and runtime parsing remains strict.
  return result.data as Env;
}

/** Parsed once at import; throws immediately on misconfiguration at runtime. */
export const env = parseEnv();
