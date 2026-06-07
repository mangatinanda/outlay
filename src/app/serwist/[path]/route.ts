import { createSerwistRoute } from "@serwist/turbopack";

// Revision versions the precached offline page so a new deploy refreshes it.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    useNativeEsbuild: true,
  });
