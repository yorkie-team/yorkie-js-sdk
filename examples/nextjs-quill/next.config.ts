import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '',
  reactStrictMode: false,
};

export default nextConfig;
