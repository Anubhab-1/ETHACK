import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AETHER — Urban Air Quality Intelligence",
  description:
    "AI-powered urban air quality platform for Kolkata. Live AQI, hyperlocal forecasting, source attribution, and enforcement intelligence for city administrators.",
  keywords: "AQI, air quality, Kolkata, India, pollution, CPCB, smart city",
  openGraph: {
    title: "AETHER — Urban Air Quality Intelligence",
    description: "From measurement to intervention — intelligence that cleans the air.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body className={`${inter.className} bg-gray-950 text-gray-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
