/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow PDF download from backend during dev
  async rewrites() {
    // Use BACKEND_URL (server-side only, readable at runtime) for rewrites.
    // NEXT_PUBLIC_API_URL is baked into the browser bundle at build time
    // and cannot be overridden via Docker environment at runtime.
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  webpack: (config) => {
    // pdfjs-dist references optional Node 'canvas' — unused in browser print path
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
