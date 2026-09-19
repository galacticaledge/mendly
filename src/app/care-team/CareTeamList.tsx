"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import styles from "./careTeam.module.css";

export type CareTeamMember = {
  id: string;
  name: string;
  role: string;
  email: string;
};

/**
 * The care team as a searchable list: a search bar that filters by name, then
 * one card per person. Everything a card holds — name, role and, where there
 * is one, an email address — is on screen at all times. Nothing is hidden
 * behind a toggle, so nobody has to find a control to read who is looking
 * after them.
 */
export function CareTeamList({ members }: { members: CareTeamMember[] }) {
  const searchId = useId();
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle ? members.filter((m) => m.name.toLowerCase().includes(needle)) : members;

  return (
    <div className={styles.wrap}>
      <div className={styles.search}>
        <label htmlFor={searchId} className="label">
          Search your care team
        </label>
        <div className={styles.searchField}>
          <Search size={20} aria-hidden="true" className={styles.searchIcon} />
          <input
            id={searchId}
            type="search"
            className={`${styles.searchInput} body-lg`}
            placeholder="Search by name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="body-lg" role="status">
          No one on your care team matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <ul className={styles.list}>
          {shown.map((member) => (
            <li key={member.id} className={styles.item}>
              <h2 className={`${styles.name} h3`}>{member.name}</h2>
              <p className="body-lg">{member.role}</p>
              {member.email && (
                <p className="body-lg">
                  <a href={`mailto:${member.email}`} className={styles.email}>
                    {member.email}
                  </a>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
