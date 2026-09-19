"use client";

import { useState } from "react";
import { OctagonAlert } from "lucide-react";
import { Button } from "@/components/Button/Button";
import { Input } from "@/components/Input/Input";
import styles from "./login.module.css";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        return;
      }
      // A full navigation, not router.push: every page behind this reads the
      // session cookie on the server, and they need a fresh request to see it.
      window.location.href = body.redirect;
    } catch {
      setError("Mendly could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
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

      {error && (
        <p className={`${styles.error} body`} role="alert">
          <OctagonAlert size={24} aria-hidden="true" />
          {error}
        </p>
      )}

      <Button variant="featured" type="submit" disabled={busy}>
        {busy ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
