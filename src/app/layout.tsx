import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://n38worth.com"),
  title: "n38worth",
  description: "The city trading simulation — hire, overclock and trade buildings inside the mainframe.",
  keywords: ["trading", "game", "social", "MMO", "multiplayer", "simulation", "matrix"],
  openGraph: {
    title: "n38worth",
    description: "The city trading simulation — hire, overclock and trade buildings inside the mainframe.",
    siteName: "n38worth",
    type: "website",
    url: "https://n38worth.com",
    // images generated dynamically by src/app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "n38worth",
    description: "The city trading simulation — hire, overclock and trade buildings inside the mainframe.",
    // images generated dynamically by src/app/twitter-image.tsx
  },
  icons: {
    icon: "/VW_Icon.png",
    shortcut: "/VW_Icon.png",
    apple: "/VW_Icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="green">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
          <Toaster
            theme="dark"
            position="top-center"
            richColors
            closeButton={false}
            offset={144}
            visibleToasts={10}
            expand={true}
            gap={0}
            toastOptions={{
              unstyled: true,
              classNames: {
                toast: "sonner-toast-stacked flex items-center gap-2 px-4 py-1.5 font-bold text-gray-100 bg-gray-950/85 backdrop-blur-xl border-b border-gray-800/40 w-full max-w-full rounded-none",
                success: "text-green-400",
                error: "text-red-400",
                info: "text-t1-400",
                warning: "text-yellow-400",
              },
            }}
            style={{ width: "100%" }}
          />
        </Providers>
      </body>
    </html>
  );
}
