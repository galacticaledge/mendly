// Mock data for the dashboard. Replaced by real data once there is a backend.

export type ExerciseStatus = "pending" | "complete";

export type Exercise = {
  id: string;
  name: string;
  /** How much and which side, in the person's terms. */
  detail: string;
  status: ExerciseStatus;
};

export type DayStatus = "done" | "none" | "today" | "planned" | "rest";

export type WeekDay = {
  day: string;
  status: DayStatus;
};

export const person = {
  firstName: "Sam",
};

export const today = {
  dateLabel: "Friday 18 September",
  session: {
    title: "Arm and hand",
    minutesLeft: 12,
    exercises: [
      { id: "shoulder-shrugs", name: "Shoulder shrugs", detail: "10 times, both shoulders", status: "complete" },
      { id: "elbow-bends", name: "Elbow bends", detail: "10 times, right arm", status: "complete" },
      { id: "wrist-turns", name: "Wrist turns", detail: "8 times, right hand", status: "pending" },
      { id: "finger-taps", name: "Finger taps", detail: "30 seconds, right hand", status: "pending" },
      { id: "reach-and-hold", name: "Reach and hold", detail: "5 times, right arm", status: "pending" },
    ] satisfies Exercise[],
  },
};

export const week = {
  sessionsDone: 3,
  sessionsPlanned: 5,
  days: [
    { day: "Monday", status: "done" },
    { day: "Tuesday", status: "done" },
    { day: "Wednesday", status: "none" },
    { day: "Thursday", status: "done" },
    { day: "Friday", status: "today" },
  ] satisfies WeekDay[],
};

export const nextSession = {
  dateLabel: "Monday 21 September",
  title: "Walking and balance",
};

export const navItems = [
  { label: "Today", href: "/" },
  { label: "My plan", href: "/plan" },
  { label: "History", href: "/history" },
  { label: "Care team", href: "/care-team" },
];
