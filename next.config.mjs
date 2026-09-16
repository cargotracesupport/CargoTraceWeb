/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
