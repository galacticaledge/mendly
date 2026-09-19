/**
 * Whether an outside service is actually answering.
 *
 * Both API keys are optional, and both absences are deliberately invisible to
 * the person using the app: without ElevenLabs the browser speaks the prompts,
 * without Backboard the rules engine drafts the set. That is the right
 * behaviour for a patient and a poor one for whoever is setting the keys up,
 * because a key with a typo in it and no key at all and a key that works all
 * produce the same working app. The only place the difference shows is here.
 *
 * So each service reports which of three states it is in — answering,
 * configured but failing, or not configured — and reports it only when that
 * changes. One line per change rather than one per call: a session speaks a
 * prompt every few seconds, and a log that scrolls is a log nobody reads.
 *
 * State lives for the life of the server process, so a restart says it all
 * again, which is what you want when you have just edited an env file.
 */

export type ServiceState = "absent" | "working" | "failing";

/**
 * Reports a state, and says nothing when it has not moved. Returns whether it
 * did report, so a caller with a bulkier diagnostic of its own can print that
 * on the change and stay quiet for the repeats.
 */
export type ServiceLog = (state: ServiceState, detail?: string) => boolean;

const HEADLINE: Record<ServiceState, string> = {
  absent: "no API key set",
  working: "API key works",
  failing: "API key set, but the call failed",
};

export function serviceLog(service: string): ServiceLog {
  let reported: ServiceState | null = null;

  return (state, detail) => {
    if (state === reported) return false;
    reported = state;

    const line = `[mendly] ${service}: ${HEADLINE[state]}${detail ? ` — ${detail}` : ""}`;
    // A missing key is a supported way to run, so it is not a warning. A key
    // that is set and does not work is the one worth raising your voice about.
    if (state === "failing") console.warn(line);
    else console.log(line);
    return true;
  };
}
