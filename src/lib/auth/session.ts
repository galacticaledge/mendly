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
import { cookies } from "next/headers";

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

function signingKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  // A fixed development key, so sessions survive a dev-server restart.
  return "mendly-development-key-not-for-production";
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return readToken(store.get(COOKIE_NAME)?.value);
}

/** The signed-in user, or a thrown error. For API routes that require one. */
export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError("Not signed in.");
  if (role && user.role !== role) throw new UnauthorizedError("Wrong account type for this page.");
  return user;
}

export class UnauthorizedError extends Error {}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
