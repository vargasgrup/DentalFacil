/** @type {import('next').NextConfig} */
const nextConfig = {
  // API calls use relative "/api/..." and are proxied at runtime by
  // src/app/api/[...path]/route.ts using BACKEND_URL (Railway-friendly).
  // Do not bake localhost rewrites into the production build.
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
