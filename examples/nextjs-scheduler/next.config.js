/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'dist',
  basePath: '/yorkie-js-sdk/examples/nextjs-scheduler',
  assetPrefix: '/yorkie-js-sdk/examples/nextjs-scheduler/',
  swcMinify: false, // See https://github.com/vercel/next.js/issues/38436
};

module.exports = nextConfig;
