import type { Metadata } from "next";
import { Instrument_Serif, Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import LenisProvider from "@/components/LenisProvider";
import Nav from "@/components/Nav";

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const space = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lab.adedamola.work"),
  title: "Lab — James Adedamola",
  description: "WebGL experiments, shaders and interactive toys.",
  openGraph: {
    title: "Lab — James Adedamola",
    description: "WebGL experiments, shaders and interactive toys.",
    url: "https://lab.adedamola.work",
    siteName: "Lab — James Adedamola",
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${space.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LenisProvider>
          <Nav />
          <main className="flex-1">{children}</main>
        </LenisProvider>
      </body>
    </html>
  );
}
