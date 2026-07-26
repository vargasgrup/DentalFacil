/** @type {import('next').NextConfig} */
const isExport = process.env.NEXT_OUTPUT === "export";
const backendUrl = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8001"
).replace(/\/$/, "");

const nextConfig = {
  // Desktop LAN installer: static HTML/JS served by FastAPI (same origin as /api).
  ...(isExport
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  // Dev / Railway (`next start`): proxy /api → FastAPI. Desktop export: same-origin FastAPI.
  ...(!isExport
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${backendUrl}/api/:path*`,
            },
          ];
        },
      }
    : {}),
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
      path: false,
      stream: false,
    };
    return config;
  },
};

module.exports = nextConfig;
