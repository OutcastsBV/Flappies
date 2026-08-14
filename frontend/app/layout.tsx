import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionMonitor } from "../components/SessionMonitor";
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
  title: "Flappies",
  description: "A cash register that flaps for non-profits.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionMonitor />
        {children}
      </body>
    </html>
  );
}
