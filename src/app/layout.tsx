import type { Metadata } from "next";
import { Poppins, Public_Sans } from "next/font/google";
// bundle.css before tokens.css: both set font-family on single classes, and
// tokens.json is the source of truth for type, so its classes (.label on a
// button) must win the tie over .rs-btn.
import "@/styles/bundle.css";
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/profiles.css";

// Each declares its family's variable on <body>, overriding the stacks in
// tokens.css. They sit on <body>, not <html>: the font class and tokens.css's
// :root tie on specificity, and Next emits the font CSS first, so :root would
// win on <html>. Times New Roman (h1) is a system font and is not loaded.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-poppins",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
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
      <body className={`${poppins.variable} ${publicSans.variable}`}>{children}</body>
    </html>
  );
}
