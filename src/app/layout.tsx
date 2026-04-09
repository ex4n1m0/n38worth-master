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
  description: "Your network is your n38worth",
  keywords: ["trading", "game", "social", "MMO", "multiplayer"],
  openGraph: {
    title: "n38worth",
    description: "Your network is your n38worth",
    siteName: "n38worth",
    type: "website",
    url: "https://n38worth.com",
    images: [
      {
        url: "/POSTER_3.PNG",
        width: 1024,
        height: 1024,
        alt: "n38worth Game Cover",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "n38worth",
    description: "Your network is your n38worth",
    images: ["/POSTER_3.PNG"],
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
    <html lang="en" data-theme="blue">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            richColors
            closeButton
          />
        </Providers>
      </body>
    </html>
  );
}
