"use client";

import { usePathname } from "next/navigation";
import { TopNav } from "@/components/TopNav/TopNav";
import { PRACTITIONER_NAV } from "@/lib/nav";

/**
 * The practitioner bar, with the current section marked.
 *
 * The patient pages each pass their own `activeHref`, but these pages share one
 * layout, so the active item has to come from the path. A patient page under
 * /practitioner/patients/… keeps Caseload marked, since that is where it was
 * reached from.
 */
export function PractitionerNav() {
  const pathname = usePathname();

  const active =
    PRACTITIONER_NAV.find((item) => item.href !== "/practitioner" && pathname.startsWith(item.href))
      ?.href ?? "/practitioner";

  return <TopNav items={PRACTITIONER_NAV} activeHref={active} wide />;
}
