"use client";

import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/session";
import { PATIENT_NAV, PRACTITIONER_NAV } from "@/lib/nav";
import { TopNav } from "./TopNav";

/** Full-screen flows with no bar: signing in, and the session itself. */
const BARE = ["/sign-in", "/login", "/session"];

/**
 * The one TopNav, rendered by the root layout.
 *
 * It lives in the layout so it stays mounted across every route: the same
 * element, the same width, only the active item changes. The active item has
 * to come from the path, since a layout does not re-render on navigation. A
 * page under a section (/practitioner/patients/…) keeps that section marked.
 */
export function AppNav({ role, icons }: { role: Role; icons: boolean }) {
  const pathname = usePathname();
  if (BARE.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  const items = role === "practitioner" ? PRACTITIONER_NAV : PATIENT_NAV;
  const home = items[0].href;
  const active =
    items.find((item) => item.href !== home && pathname.startsWith(item.href))?.href ?? home;

  return <TopNav items={items} activeHref={active} icons={icons} />;
}
