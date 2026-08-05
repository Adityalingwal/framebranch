import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "FrameBranch",
  description: "Version control for video edits.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
