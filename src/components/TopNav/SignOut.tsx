"use client";

import { LogOut } from "lucide-react";
import styles from "./TopNav.module.css";

/** Signs out and reloads, so every server-rendered page drops the session. */
export function SignOut() {
  return (
    <button
      type="button"
      className={`${styles.signOut} label`}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        // A full navigation rather than a client-side push. Every page behind
        // this reads the session cookie on the server, and a client route
        // change would leave the signed-in pages cached in the router.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/sign-in";
      }}
    >
      <LogOut size={20} aria-hidden="true" />
      Sign out
    </button>
  );
}
