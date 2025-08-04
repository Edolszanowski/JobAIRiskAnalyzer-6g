import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

export const metadata: Metadata = {
  title: 'v0 App',
  description: 'Created with v0',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      {/* suppressHydrationWarning prevents React from emitting warnings if the
          server-rendered markup differs slightly from the client. The additional
          data attribute is useful for debugging and tooling that needs to know
          this is the root of the client application. */}
      <body suppressHydrationWarning data-app-root="true">
        {children}
        {/* Global toaster for toast notifications */}
        <Toaster />
      </body>
    </html>
  )
}
