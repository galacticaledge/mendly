import type { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";
import "@/styles/tokens.css";

// Declares --font-sans on <body>, overriding the fallback stack in tokens.css.
// It sits on <body>, not <html>: the font class and tokens.css's :root tie on
// specificity, and Next emits the font CSS first, so :root would win on <html>.
const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mendly",
  description: "Your stroke recovery and rehabilitation sessions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={libreFranklin.variable}>{children}</body>
    </html>
  );
}
