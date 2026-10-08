import type { Metadata, Viewport } from "next";
import "./globals.css";
import AudioPlayerProvider from "@/components/AudioPlayerProvider";

export const metadata: Metadata = {
  title: "AMU RECORDS",
  description: "Music for Everyone",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased font-sans">
        <AudioPlayerProvider>
          {children}
        </AudioPlayerProvider>
      </body>
    </html>
  );
}
