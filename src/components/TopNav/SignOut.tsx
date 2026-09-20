"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import styles from "./TopNav.module.css";

/**
 * Signs out and reloads, so every server-rendered page drops the session.
 *
 * The reload is a whole page load, so the last thing this button does is hand
 * over to a navigation it cannot see the end of. It says so rather than sitting
 * there unchanged, and it stops taking presses: signing out twice races two
 * navigations against each other.
 */
export function SignOut() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={`${styles.signOut} label`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch {
          // The cookie may or may not be gone. Sign-in is the right place to
          // be either way, and it is the page that can say so.
        }
        // A full navigation rather than a client-side push. Every page behind
        // this reads the session cookie on the server, and a client route
        // change would leave the signed-in pages cached in the router.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/sign-in";
      }}
    >
      <LogOut size={20} aria-hidden="true" />
      {busy ? "Signing out" : "Sign out"}
    </button>
  );
}
