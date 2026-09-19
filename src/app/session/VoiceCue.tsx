"use client";

/**
 * What the microphone is doing, said plainly.
 *
 * The session tells people they can answer out loud, so it owes them the other
 * half: whether anything is listening right now. A prompt that says "say I'm
 * ready" while the microphone is shut is worse than no prompt, because the
 * person keeps answering and concludes the fault is theirs.
 *
 * It is a piece of the session screen rather than a design-system component:
 * nothing outside a session has a microphone to report on.
 */

import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/Button/Button";
import { startVoiceInput, type VoiceStatus } from "@/lib/voice/useVoice";
import styles from "./session.module.css";

export type VoiceCueProps = {
  status: VoiceStatus;
  /** What to say, written the way it is spoken. */
  phrase: string;
};

export function VoiceCue({ status, phrase }: VoiceCueProps) {
  // Nothing to offer and nothing to apologise for: the button is right there.
  if (status === "unsupported") return null;

  if (status === "blocked" || status === "failing") {
    return (
      <div className={styles.voiceCue}>
        <MicOff size={24} aria-hidden="true" />
        <div className={styles.voiceCueBody}>
          <p className="body">
            {status === "blocked"
              ? "Your microphone is off, so speaking will not work yet. The button does the same thing."
              : // Not the person's fault and not worth explaining further on a
                // session screen: some browsers have no speech service behind
                // the microphone, and it fails the same way as being offline.
                "Speaking is not working in this browser. The button does the same thing."}
          </p>
          <Button variant="ghost" onClick={startVoiceInput}>
            {status === "blocked" ? "Turn the microphone on" : "Try speaking again"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.voiceCue} aria-live="polite">
      <Mic size={24} aria-hidden="true" />
      <p className="body">
        {status === "listening" && (
          <>Listening. Say &ldquo;{phrase}&rdquo;, or press the button.</>
        )}
        {/* The microphone is open, but a prompt is playing and anything heard
            now would be that prompt. Saying so is better than saying nothing
            and ignoring the person. */}
        {status === "waiting" && <>Listening as soon as the prompt finishes.</>}
        {(status === "idle" || status === "starting") && <>Getting the microphone ready.</>}
      </p>
    </div>
  );
}
