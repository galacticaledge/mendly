import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

/**
 * The practitioner this request belongs to.
 *
 * The layout runs the same check, but a layout does not gate its page: Next
 * renders both at once, so a page that trusted the layout to have vetted the
 * session read null and threw while the redirect was still in flight. The
 * redirect won the response, so the only trace was a stack trace in the log —
 * which is why it went unnoticed until a stale cookie started taking that path
 * on every request.
 *
 * `getSessionUser` is cached per request, so asking twice costs nothing.
 */
export async function requirePractitioner(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "practitioner") redirect("/");
  return user;
}
