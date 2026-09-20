"use client";

import { useState } from "react";
import { OctagonAlert } from "lucide-react";
import { Button } from "@/components/Button/Button";
import { Input } from "@/components/Input/Input";
import { Working } from "@/components/Working/Working";
import styles from "./signIn.module.css";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "That did not work. Please try again.");
        setBusy(false);
        return;
      }
      // A full navigation, not router.push: every page behind this reads the
      // session cookie on the server, and they need a fresh request to see it.
      //
      // `busy` is deliberately left on. The navigation outlives this function,
      // and clearing it here put the form back to "Sign in", enabled, for the
      // whole of a load the person is still waiting on.
      window.location.href = body.redirect;
    } catch {
      setError("Mendly could not be reached. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      {/* Above the fields, so the reason is the first thing read on a retry. */}
      <div aria-live="assertive" className={styles.live}>
        {error && (
          <p className={`rs-alert rs-alert-attention ${styles.error} body`} role="alert">
            <OctagonAlert size={24} aria-hidden="true" className="rs-alert-icon" />
            {error}
          </p>
        )}
      </div>

      <Input
        label="Email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {/* The button reads "Signing in" for the request, but the success path is
          a whole page load after it, and that is the part with nothing on
          screen to explain itself. */}
      {busy && <Working steps={["Checking your details, then opening your account"]} step={0} />}

      <div className={styles.actions}>
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Signing in" : "Sign in"}
        </Button>
        {/* There is no self-service reset: accounts are set up by the care
            team, so this says who to ask rather than starting a flow. */}
        <Button variant="text" aria-expanded={showReset} onClick={() => setShowReset((open) => !open)}>
          Forgot password
        </Button>
      </div>
      {showReset && (
        <p className={`${styles.reset} body`}>
          Ask whoever set up your account to reset it. For patients, that is your care team.
        </p>
      )}
    </form>
  );
}
