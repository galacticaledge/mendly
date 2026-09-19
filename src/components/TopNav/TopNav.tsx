import Link from "next/link";
import { ClipboardList, History, House, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Wordmark } from "../Wordmark/Wordmark";
import { ActiveUnderline } from "./ActiveUnderline";
import { SignOut } from "./SignOut";
import styles from "./TopNav.module.css";

export type NavItem = {
  label: string;
  href: string;
};

/** A picture for each patient destination, shown beside its word when `icons` is on. */
const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/plan": ClipboardList,
  "/history": History,
  "/care-team": Users,
};

type TopNavProps = {
  /** At most five items. */
  items: NavItem[];
  activeHref: string;
  /** Draws an icon beside each label. Used by the aphasia-friendly profile. */
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
                    {item.label}
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
