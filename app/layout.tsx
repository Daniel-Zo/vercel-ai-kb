// app/layout.tsx - 最简根布局（无字体依赖，解决编译错误）
import type { Metadata } from "next";

// 基础页面元数据（可选，仅为规范）
export const metadata: Metadata = {
  title: "AI知识库 - PDF分类",
  description: "基于OpenAI的私有AI知识库",
};

// 根布局：仅提供最基础的HTML/Body结构，无任何额外依赖
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      {/* 直接渲染子组件（page.tsx），无字体类名、无CSS依赖 */}
      <body>{children}</body>
    </html>
  );
}
