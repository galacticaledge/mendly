import type { Metadata } from "next";
import { Chewy, Poppins, Public_Sans } from "next/font/google";
// bundle.css before tokens.css: both set font-family on single classes, and
// tokens.json is the source of truth for type, so its classes (.label on a
// button) must win the tie over .rs-btn.
import "@/styles/bundle.css";
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/profiles.css";
import { ProfileScope } from "@/components/ProfileScope/ProfileScope";
import { AppNav } from "@/components/TopNav/AppNav";
import { getSessionUser } from "@/lib/auth/session";
import { getPatient } from "@/lib/db/queries";

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

// Chewy is the brand face: the "Mendly." wordmark only, never headings or body.
const chewy = Chewy({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mendly",
  description: "Your stroke recovery and rehabilitation sessions.",
};

/**
 * The top navigation is rendered here and nowhere else, so every route shares
 * one bar that never re-mounts, shifts or changes width. Signed out there is
 * no bar: the landing page and sign-in draw their own headers.
 *
 * A patient's whole app, nav included, sits in their ProfileScope. Sign-in and
 * sign-out are full page loads, so this reads the session afresh each time.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const patient = user?.role === "patient" ? await getPatient(user.id) : null;

  const app = user ? (
    <>
      <AppNav role={user.role} icons={patient?.ui_profile === "aphasia"} />
      {children}
    </>
  ) : (
    children
  );

  return (
    <html lang="en">
      <body className={`${poppins.variable} ${publicSans.variable} ${chewy.variable}`}>
        {patient ? <ProfileScope profile={patient.ui_profile}>{app}</ProfileScope> : app}
      </body>
    </html>
  );
}
