/** @type {import("next").NextConfig} */
const nextConfig = {
  agentRules: false,
  transpilePackages: ["@framebranch/engine"],
  outputFileTracingIncludes: {
    "/api/**": ["./fixtures/**"],
  },
};

export default nextConfig;
