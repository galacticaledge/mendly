"use client";

/**
 * Speaking and listening.
 *
 * Voice is an access route here, not a novelty. A patient working on arm
 * movement cannot reach the keyboard mid-exercise, and someone with hemiparesis
 * may not be able to use a mouse at all. So the session reads each instruction
 * aloud and can be advanced by saying "I'm ready" — the screen stays in charge,
 * and the voice is a second way to do the same things.
 *
 * Speech recognition is the browser's own (Chrome and Edge today). It is
 * treated as a shortcut, never as the only way forward: every spoken command
 * has a button beside it.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Speaking                                                            */
/* ------------------------------------------------------------------ */

export function useSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  /** Turned off from the session screen; remembered for the whole session. */
  const [enabled, setEnabled] = useState(true);

  const cancel = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!enabled || !text) return;
      cancel();
      setSpeaking(true);

      try {
        const response = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        // 204: no voice provider configured, so use the browser's own.
        if (response.status === 204 || !response.ok) {
          speakWithBrowser(text, () => setSpeaking(false));
          return;
        }

        const blob = await response.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => {
          speakWithBrowser(text, () => setSpeaking(false));
        };
        await audio.play();
      } catch {
        speakWithBrowser(text, () => setSpeaking(false));
      }
    },
    [cancel, enabled],
  );

  useEffect(() => cancel, [cancel]);

  return { speak, cancel, speaking, enabled, setEnabled };
}

function speakWithBrowser(text: string, done: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    done();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  // Slower than default. These prompts are instructions to follow, not prose.
  utterance.rate = 0.92;
  utterance.onend = done;
  utterance.onerror = done;
  window.speechSynthesis.speak(utterance);
}

/* ------------------------------------------------------------------ */
/* Listening                                                           */
/* ------------------------------------------------------------------ */

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

function createRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function isVoiceInputAvailable(): boolean {
  return createRecognition() !== null;
}

/**
 * Listen for any of `phrases` and call `onMatch` when one is heard.
 *
 * Matching is substring-based on a lowercased transcript, which is forgiving
 * of the extra words people put around a command ("ok, I'm ready then"). A
 * phrase should be distinctive enough that it is not said by accident.
 */
export function useVoiceCommand(
  phrases: string[],
  onMatch: () => void,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const [listening, setListening] = useState(false);

  // Both are read inside the recognition callbacks, which fire long after a
  // render, so they are mirrored into refs in an effect rather than written
  // during render. Keeping them out of the effect's dependencies is the point:
  // restarting recognition every time the parent re-renders would cut the
  // patient off mid-sentence.
  const onMatchRef = useRef(onMatch);
  const phrasesRef = useRef(phrases);
  useEffect(() => {
    onMatchRef.current = onMatch;
    phrasesRef.current = phrases;
  });

  useEffect(() => {
    if (!enabled) return;
    const recognition = createRecognition();
    if (!recognition) return;

    // Keep going through pauses: a patient may take a while to answer.
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    let stopped = false;

    recognition.onresult = (event) => {
      const results = Array.from({ length: event.results.length }, (_, i) => event.results[i]);
      const heard = results
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .toLowerCase();
      if (phrasesRef.current.some((phrase) => heard.includes(phrase.toLowerCase()))) {
        onMatchRef.current();
      }
    };

    // Listening state comes from the recognition API's own events rather than
    // being set alongside the calls, so it reflects what the browser is
    // actually doing — start() can be refused, and recognition can end on its
    // own after silence.
    recognition.onstart = () => setListening(true);
    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      // Browsers end recognition after a stretch of silence. Restart, or the
      // command quietly stops working part way through an exercise.
      if (stopped) return;
      try {
        recognition.start();
      } catch {
        // Already restarting; nothing to do.
      }
    };

    try {
      recognition.start();
    } catch {
      // Another recognition instance holds the microphone. `onstart` never
      // fires, so `listening` correctly stays false.
    }

    return () => {
      stopped = true;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.stop();
    };
  }, [enabled]);

  return { listening };
}
