/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export',
  distDir: 'dist',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '',
  reactStrictMode: false,
};

module.exports = nextConfig;
