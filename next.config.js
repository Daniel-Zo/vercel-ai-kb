/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 完全删除output: 'standalone'，适配Vercel Serverless
  experimental: {
    turbo: {
      enabled: false
    }
  }
};

module.exports = nextConfig;
