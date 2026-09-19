import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Everything under /practitioner needs a practitioner account, so the check
 * lives here rather than being repeated on each page.
 *
 * This side of the product is a working tool rather than a calm surface: a
 * practitioner is scanning a caseload between appointments, so the layout is
 * wider and denser than the patient app. It uses the same tokens throughout —
 * the palette and the type scale are the product, not a patient-only skin.
 * The nav is drawn by the root layout, as on every other route.
 */
export default async function PractitionerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "practitioner") redirect("/");

  return children;
}
