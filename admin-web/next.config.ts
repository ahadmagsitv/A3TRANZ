import type { NextConfig } from "next";

// The data now comes from the API, not a fixture file, so `output: "export"`
// is gone: a static export can only prerender the ids known at build time and
// would 404 on every job created after the deploy. `generateStaticParams` is
// kept — the fixture ids are still worth prerendering, and any other id now
// renders on demand instead of not existing.
//
// basePath stays: it is only a URL prefix, and unsetting it is a hosting
// decision (BACKEND_PLAN B1, still open).
const nextConfig: NextConfig = {
  // `@a3/domain` is raw TypeScript sourced straight from the monorepo (a
  // `file:` symlink), so Next has to compile it rather than assume a built
  // package. It is the single copy of the capability map and the contracts —
  // the API reads the same file.
  transpilePackages: ["@a3/domain"],
  // The domain package lives above this project, so Turbopack's root has to
  // include it or the symlink resolves to nothing.
  turbopack: { root: "..", },
  basePath: "/A3TRANZ",
  trailingSlash: true,
};

export default nextConfig;
