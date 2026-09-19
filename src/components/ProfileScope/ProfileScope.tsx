import type { ReactNode } from "react";
import type { UiProfile } from "@/lib/contracts";
import styles from "./ProfileScope.module.css";

/**
 * Added so the patient interface can adapt to the person's recovery needs.
 *
 * Wraps a whole patient page, nav included, and marks it with the account's
 * interface profile. profiles.css and the component modules key their
 * adaptations off `data-profile`, so one set of components serves all three
 * versions and they cannot drift apart. It draws nothing itself.
 */
export function ProfileScope({ profile, children }: { profile: UiProfile; children: ReactNode }) {
  return (
    <div data-profile={profile} className={styles.scope}>
      {children}
    </div>
  );
}

/** How each profile is named to a practitioner. */
export const UI_PROFILE_LABELS: Record<UiProfile, string> = {
  standard: "Standard",
  aphasia: "Aphasia-friendly",
  motor_visual: "Motor and visual-friendly",
};
