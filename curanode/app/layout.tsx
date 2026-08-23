import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter, DM_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CuraNode — Intelligent Emergency Response & Healthcare Telemetry",
  description: "CuraNode emergency healthcare network providing AI medical triage, real-time hospital dispatch, and emergency response coordination.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${plusJakartaSans.variable} ${inter.variable} ${dmSans.variable}`}
    >
      <body className="min-h-full flex flex-col bg-[#F8FFFD] text-[#112F35] selection:bg-[#19B5B1] selection:text-white font-body">
        {children}
      </body>
    </html>
  );
}
