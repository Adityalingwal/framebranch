/**
 * Next.js config — API routes only in M7a (no UI; that is M8).
 *
 * `transpilePackages` is needed because @framebranch/engine is published
 * inside the workspace as TypeScript source (its `exports` points at
 * src/index.ts), which is exactly the "small door" C7 asks for.
 *
 * `outputFileTracingIncludes` keeps fixtures/demo.otio in the deployed
 * bundle: the seed reads it from disk at runtime.
 */

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@framebranch/engine"],
  outputFileTracingIncludes: {
    "/api/**": ["./fixtures/**"],
  },
};

export default nextConfig;
