import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@a3/domain"],
  turbopack: { root: "..", },
  trailingSlash: true,
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
  redirects: async () => [
    { source: "/A3TRANZ", destination: "/", permanent: true },
    { source: "/A3TRANZ/:path*", destination: "/:path*", permanent: true },
  ],
};

export default nextConfig;
