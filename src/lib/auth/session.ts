/**
 * Passwords and sessions.
 *
 * Passwords are hashed with scrypt from node:crypto, so there is no native
 * dependency to build in the container. Sessions are a signed cookie rather
 * than a server-side store, which keeps the app stateless behind a load
 * balancer; the signature is HMAC-SHA256 over the payload.
 *
 * This is demo-grade authentication for a hackathon build. Before this handles
 * real patient data it needs, at minimum, rotation of the signing key, rate
 * limiting on login, and a revocation list so a session can be ended early.
 */

import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies } from "next/headers";
import { getPatient, getPractitioner } from "@/lib/db/queries";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const COOKIE_NAME = "mendly_session";
const SESSION_DAYS = 7;

export type Role = "patient" | "practitioner";

export type SessionUser = {
  id: string;
  role: Role;
  name: string;
};

/* ---------------------------------------------------------------- */
/* Passwords                                                         */
/* ---------------------------------------------------------------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  // Lengths must match before timingSafeEqual, which throws on a mismatch.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

/* ---------------------------------------------------------------- */
/* Session cookie                                                    */
/* ---------------------------------------------------------------- */

/** The placeholder in .env.example and in docker-compose.yml's fallback. */
const PLACEHOLDER_SECRET = "change-me-in-production";
let warnedAboutPlaceholderSecret = false;

function signingKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    // Shipped as-is, this is not a secret: it is a published string, and
    // anyone holding it can forge a cookie for any account. Compose falls back
    // to it so `docker compose up` works with no setup, which is right for a
    // laptop and wrong the moment the port faces anyone else.
    if (secret === PLACEHOLDER_SECRET && !warnedAboutPlaceholderSecret) {
      warnedAboutPlaceholderSecret = true;
      console.warn(
        "[mendly] SESSION_SECRET is still the published placeholder. Anyone " +
          "who knows it can sign in as anyone. Set it in .env before this " +
          "reaches an address other people can open.",
      );
    }
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  // A fixed development key, so sessions survive a dev-server restart.
  return "mendly-development-key-not-for-production";
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

let warnedAboutInsecureCookie = false;

/**
 * Whether the session cookie is marked `Secure`.
 *
 * On by default in production, and a browser will not store a `Secure` cookie
 * that arrived over plain HTTP. That is the right default and it has a sharp
 * edge: a production build served on a bare droplet IP answers the sign-in
 * with 200, sets a cookie the browser throws away, and bounces the person back
 * to the form — a login that looks broken rather than insecure.
 *
 * `SESSION_COOKIE_SECURE=false` is the deliberate way to run without TLS. It
 * is opt-in, and it is a real downgrade: the cookie then travels in clear text
 * and anyone on the network path can read it and sign in as that person. It is
 * a demo trade with invented data, never one to make with a real patient's.
 */
function cookieSecure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE === "false") {
    if (!warnedAboutInsecureCookie) {
      warnedAboutInsecureCookie = true;
      console.warn(
        "[mendly] SESSION_COOKIE_SECURE=false: session cookies are being sent " +
          "without the Secure flag, so they travel in clear text over HTTP. " +
          "Demo data only.",
      );
    }
    return false;
  }
  return process.env.NODE_ENV === "production";
}

type TokenBody = SessionUser & { exp: number };

export function createToken(user: SessionUser): string {
  const body: TokenBody = {
    ...user,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenBody;
    if (typeof body.exp !== "number" || body.exp < Date.now()) return null;
    if (body.role !== "patient" && body.role !== "practitioner") return null;
    return { id: body.id, role: body.role, name: body.name };
  } catch {
    return null;
  }
}

export async function startSession(user: SessionUser): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Drop a cookie naming an account that is not there any more.
 *
 * Next only allows a cookie to be written from a server action or a route
 * handler; from a page render this throws, and there is nothing to be done
 * about that there. It is a tidy-up, not the fix — the stale cookie is already
 * being ignored, so the only cost of failing here is one lookup next request.
 */
async function forgetStaleCookie(): Promise<void> {
  try {
    (await cookies()).delete(COOKIE_NAME);
  } catch {
    // Rendering a page rather than handling a request. Deliberately ignored.
  }
}

/**
 * The signed-in user, or null. Safe to call from any server component.
 *
 * A valid signature is not proof the account still exists, and the difference
 * is not theoretical: `./mendly reset` and `npm run db:seed` rebuild the tables
 * with fresh ids while the browser keeps the cookie it was handed before, so
 * the token verifies perfectly against a row that is gone. Every guard then
 * reads "signed in" while every page that needs the row reads "no such
 * patient", and `/` and `/sign-in` send the person back and forth between each
 * other until the browser gives up.
 *
 * So whether the account exists is part of the answer. A cookie naming an
 * account that is not there is reported as signed out, because that is what it
 * is: the person lands on the sign-in form and can sign in again, which is the
 * one thing the redirect loop never let them do.
 *
 * Cached for the length of one request, because the root layout and the page
 * both ask and the answer cannot change between them.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const user = readToken(store.get(COOKIE_NAME)?.value);
  if (!user) return null;

  const account =
    user.role === "practitioner"
      ? await getPractitioner(user.id)
      : await getPatient(user.id);
  if (account) return user;

  await forgetStaleCookie();
  return null;
});

/** The signed-in user, or a thrown error. For API routes that require one. */
export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError("Not signed in.");
  if (role && user.role !== role) throw new UnauthorizedError("Wrong account type for this page.");
  return user;
}

export class UnauthorizedError extends Error {}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
