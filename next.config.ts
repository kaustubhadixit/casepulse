import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Bundle the embedded SQLite snapshot + Prisma engine for serverless
  // (read-only) deployments — see README "Deploy to Vercel".
  outputFileTracingIncludes: {
    "/**": ["./db/**", "./node_modules/.prisma/**", "./node_modules/@prisma/client/**"],
  },
  allowedDevOrigins: ["preview-chat-d2b90558-f5c6-419c-8ac8-95b4495ef630.space-z.ai"],
};

export default nextConfig;
