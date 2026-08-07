/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@framebranch/engine"],
  outputFileTracingIncludes: {
    "/api/**": ["./fixtures/**"],
  },
};

export default nextConfig;
