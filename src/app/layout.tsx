import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "ConvoAI Playground | 对话式 AI 引擎测试平台",
  description: "声网对话式 AI 引擎体验测试平台 - 支持多语种、多 TTS、Prompt 编辑和电话绑定",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
