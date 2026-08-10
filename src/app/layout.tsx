import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import AuroraBg from "@/components/AuroraBg";

// Premium modern UI typeface (display + body).
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

// Data font — coordinates, IDs, ETA, stats, timestamps. Per the design system,
// CargoTrace uses DM Mono for all data, "no substitutions".
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

export const metadata: Metadata = {
  title: "CargoTrace — Live Delivery Tracking",
  description: "Track deliveries from A to B in real time.",
};

// Applies the saved theme before paint (default = light) to avoid a flash.
const themeInit = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans">
        <AuroraBg />
        {children}
      </body>
    </html>
  );
}
