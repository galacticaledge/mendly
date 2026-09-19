/** Navigation, one list per kind of user. At most five items each (TopNav). */

export const PATIENT_NAV = [
  { label: "Today", href: "/" },
  { label: "My plan", href: "/plan" },
  { label: "History", href: "/history" },
  { label: "Care team", href: "/care-team" },
];

export const PRACTITIONER_NAV = [
  { label: "Caseload", href: "/practitioner" },
  { label: "To review", href: "/practitioner/review" },
  { label: "Alerts", href: "/practitioner/alerts" },
];
