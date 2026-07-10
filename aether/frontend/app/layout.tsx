import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#f97316" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        {process.env.NODE_ENV === "production" ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(
                      function(reg) { console.log('PWA ServiceWorker registered:', reg.scope); },
                      function(err) { console.log('PWA ServiceWorker failed:', err); }
                    );
                  });
                }
              `
            }}
          />
        ) : (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (let registration of registrations) {
                      registration.unregister().then(function(success) {
                        if (success) {
                          console.log('Development mode: active service worker cleared.');
                          window.location.reload();
                        }
                      });
                    }
                  });
                }
              `
            }}
          />
        )}
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-gray-950 text-gray-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
