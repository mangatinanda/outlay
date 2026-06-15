import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

// @serwist/turbopack integrates the PWA service worker without a webpack config,
// so the default Turbopack `next dev` / `next build` keep working. The service
// worker itself is built and served by the route handler at src/app/serwist/[path].
export default withSerwist(nextConfig);
