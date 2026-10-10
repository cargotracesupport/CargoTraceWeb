/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking: nobody may frame the app (the Capacitor shell loads
          // it as a top-level WebView page, not in a frame).
          { key: "X-Frame-Options", value: "DENY" },
          // Only directives that can't break Google Maps, Supabase or Next's
          // inline scripts. A script-src policy needs nonces; not yet.
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Cross-origin requests (Google Maps tiles, WhatsApp links) get the
          // origin only, never the path, so /track/<token> doesn't leak. Kept
          // rather than no-referrer: a referrer-restricted Maps key needs it.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Canonical host: send the raw Vercel deployment URL to the real domain.
      // Runs at the edge before middleware, so it also covers /track and /api.
      {
        source: "/:path*",
        has: [{ type: "host", value: "cargo-trace-web.vercel.app" }],
        destination: "https://www.goodswala.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
