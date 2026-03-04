/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true, // 启用App Router
  },
  // 解决Vercel部署的静态资源路径问题
  output: 'standalone',
}

module.exports = nextConfig
