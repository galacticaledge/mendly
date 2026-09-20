import Link from "next/link";
import { Bell, ClipboardCheck, ClipboardList, History, House, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Wordmark } from "../Wordmark/Wordmark";
import { ActiveUnderline } from "./ActiveUnderline";
import { SignOut } from "./SignOut";
import styles from "./TopNav.module.css";

export type NavItem = {
  label: string;
  href: string;
};

/**
 * A picture for each destination, shown beside its word when `icons` is on.
 *
 * Both navigations are covered. A missing entry is not an error — the label
 * still stands on its own — but a half-iconned row reads as a mistake, so the
 * rule is that a nav list is either wholly in here or wholly absent from it.
 */
const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/plan": ClipboardList,
  "/history": History,
  "/care-team": Users,
  "/practitioner": Users,
  "/practitioner/review": ClipboardCheck,
  "/practitioner/alerts": Bell,
};

type TopNavProps = {
  /** At most five items. */
  items: NavItem[];
  activeHref: string;
  /**
   * Draws an icon beside each label. On for the aphasia-friendly profile, and
   * for the practitioner, whose three destinations otherwise read as a thin
   * row of words against the patient app's four.
   */
  icons?: boolean;
};

export function TopNav({ items, activeHref, icons = false }: TopNavProps) {
  if (process.env.NODE_ENV !== "production" && items.length > 5) {
    console.warn("TopNav takes at most five items.");
  }

  return (
    <header className={`rs-topnav ${styles.bar}`}>
      <div className={styles.inner}>
        <Link href="/" className={`rs-topnav-mark ${styles.target}`}>
          <Wordmark />
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <ul className={styles.list}>
            {items.map((item) => {
              const active = item.href === activeHref;
              const Icon = icons ? ICONS[item.href] : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`rs-topnav-link ${styles.target} ${styles.link} label`}
                    aria-current={active ? "page" : undefined}
                  >
                    {Icon && <Icon size={24} aria-hidden="true" />}
                    {/* data-text reserves the bold width, so hovering does not shift the row. */}
                    <span className={styles.text} data-text={item.label}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <ActiveUnderline activeHref={activeHref} />
        </nav>
        <SignOut />
      </div>
    </header>
  );
}
