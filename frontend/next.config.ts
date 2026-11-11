import type { NextConfig } from "next";

// Where the Django API lives. The browser only ever talks to this app's /api/*,
// which Next proxies to Django, so no CORS setup is needed on the backend.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Django's routes end in "/" and it won't accept POSTs without it,
  // so keep Next from stripping trailing slashes.
  skipTrailingSlashRedirect: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      // Every Django route here ends in "/", and `:path*` would drop it.
      {
        source: "/api/:path*/",
        destination: `${BACKEND_URL}/api/:path*/`,
      },
    ];
  },
};

export default nextConfig;
