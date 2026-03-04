/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // 适配Vercel的Serverless环境
  experimental: {
    // 禁用所有实验性特性，避免冲突
    turbo: false
  }
};

module.exports = nextConfig;
