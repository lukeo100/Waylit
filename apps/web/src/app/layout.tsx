import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { color } from "@waylit/ui-tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "Waylit",
  description: "Open source 3D navigation for electric scooters and bicycles.",
  applicationName: "Waylit",
};

export const viewport: Viewport = {
  themeColor: color.night950,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-night-950 text-text antialiased">{children}</body>
    </html>
  );
}
