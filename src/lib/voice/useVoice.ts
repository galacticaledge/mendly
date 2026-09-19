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
 * Speech recognition is the browser's own (Chrome, Edge and Safari today). It
 * is treated as a shortcut, never as the only way forward: every spoken command
 * has a button beside it.
 *
 * Three things below exist because of how browsers actually behave, and all
 * three are why spoken answers used to go nowhere:
 *
 *   One microphone.  The browser hands recognition to one recogniser at a time.
 *                    A hook per stage, each building and starting its own, spent
 *                    the session taking the microphone off the last one. There
 *                    is now a single recogniser for the page and the hooks
 *                    subscribe to it.
 *   It stops itself.  Recognition ends on its own after a pause, and after most
 *                    errors. Restarting has to happen on a timer, never inside
 *                    the `end` handler, where `start()` throws.
 *   It hears us.      The prompt plays through the speakers and comes back in
 *                    through the microphone. The intro ends with "say I'm
 *                    ready", so the session used to answer itself.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/* Not answering ourselves                                             */
/* ------------------------------------------------------------------ */

/** How long after a prompt ends the speakers can still be heard. */
const ECHO_TAIL_MS = 500;
/** A ceiling on a prompt that never reports finishing, so the ear reopens. */
const MAX_PROMPT_MS = 20_000;

let promptPlaying = false;
let promptTimer: ReturnType<typeof setTimeout> | null = null;

function endPrompt() {
  promptTimer = null;
  if (!promptPlaying) return;
  promptPlaying = false;
  statusWatchers.forEach((watch) => watch());
}

/**
 * The seam between the two halves: speaking tells listening to discount what
 * it hears, because the prompt is coming out of the speakers and going back in
 * through the microphone.
 *
 * It stays discounted for a moment after the prompt ends, and is released by a
 * timer rather than by reading the clock, so the screen can be told when the
 * ear reopens.
 */
export function notePromptPlaying(active: boolean) {
  if (promptTimer !== null) clearTimeout(promptTimer);

  if (active) {
    // A prompt that never reports finishing must not leave the app deaf.
    promptTimer = setTimeout(endPrompt, MAX_PROMPT_MS);
    if (promptPlaying) return;
    promptPlaying = true;
    statusWatchers.forEach((watch) => watch());
    return;
  }

  promptTimer = setTimeout(endPrompt, ECHO_TAIL_MS);
}

/** True while what the microphone hears is most likely our own prompt. */
function hearingOurselves(): boolean {
  return promptPlaying;
}

/* ------------------------------------------------------------------ */
/* Speaking                                                            */
/* ------------------------------------------------------------------ */

/**
 * The prompt being spoken, at module scope rather than in the hook.
 *
 * Speaking is one-at-a-time for the same reason listening is: there is one set
 * of speakers, and a prompt that outlives the screen that asked for it is not
 * a stale render, it is a voice talking over the next page. Holding it here is
 * what lets it be stopped from anywhere, including after the component that
 * started it has gone.
 */
type Prompt = {
  /** Set once this prompt has been called off. Checked after every await. */
  cancelled: boolean;
  audio: HTMLAudioElement | null;
  /** The object URL behind `audio`, revoked when the prompt is done with. */
  url: string | null;
};

let current: Prompt | null = null;

/**
 * Stop talking, now.
 *
 * Pausing the audio is the easy half. The half that actually broke this is
 * that `speak` is asynchronous: fetching a prompt from ElevenLabs takes a few
 * hundred milliseconds, and leaving the page inside that window used to let
 * the request finish afterwards, build an `Audio` the cleanup had already run
 * past, and play it to the end over whatever the person had navigated to. So
 * the prompt is marked cancelled as well as paused, and every step after an
 * await checks that mark before carrying on.
 */
export function stopSpeaking(): void {
  const prompt = current;
  current = null;

  if (prompt) {
    prompt.cancelled = true;
    prompt.audio?.pause();
    releaseUrl(prompt);
  }

  // The browser's own voice is global and outlives any component, so it has to
  // be silenced whether or not we were the ones who started it.
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  notePromptPlaying(false);
}

function releaseUrl(prompt: Prompt): void {
  if (prompt.url === null) return;
  URL.revokeObjectURL(prompt.url);
  prompt.url = null;
}

/**
 * Say one line, replacing anything already being said.
 *
 * `done` runs when the line finishes on its own. A line that is cancelled is
 * not finished, so it does not run — the caller asked for silence and gets it.
 */
export async function speakAloud(text: string, done: () => void): Promise<void> {
  stopSpeaking();

  const prompt: Prompt = { cancelled: false, audio: null, url: null };
  current = prompt;
  notePromptPlaying(true);

  const finish = () => {
    if (prompt.cancelled) return;
    releaseUrl(prompt);
    if (current === prompt) current = null;
    notePromptPlaying(false);
    done();
  };

  try {
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (prompt.cancelled) return;

    // 204: no voice provider configured, so use the browser's own.
    if (response.status === 204 || !response.ok) {
      speakWithBrowser(text, prompt, finish);
      return;
    }

    const blob = await response.blob();
    if (prompt.cancelled) return;

    prompt.url = URL.createObjectURL(blob);
    const audio = new Audio(prompt.url);
    prompt.audio = audio;
    audio.onended = finish;
    audio.onerror = () => speakWithBrowser(text, prompt, finish);

    await audio.play();
    // `play()` resolves once playback has actually begun, which is another
    // window to have left in.
    if (prompt.cancelled) audio.pause();
  } catch {
    if (prompt.cancelled) return;
    speakWithBrowser(text, prompt, finish);
  }
}

function speakWithBrowser(text: string, prompt: Prompt, done: () => void) {
  if (prompt.cancelled) return;
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

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  /** Turned off from the session screen; remembered for the whole session. */
  const [enabled, setEnabled] = useState(true);

  const finished = useCallback(() => setSpeaking(false), []);

  const cancel = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!enabled || !text) return;
      setSpeaking(true);
      await speakAloud(text, finished);
    },
    [enabled, finished],
  );

  // Leaving the page stops the prompt. `stopSpeaking` rather than `cancel`,
  // because there is no state left to set once this runs, and an empty
  // dependency list so a re-render cannot silence a prompt mid-sentence.
  useEffect(() => stopSpeaking, []);

  return { speak, cancel, speaking, enabled, setEnabled };
}

/* ------------------------------------------------------------------ */
/* Listening                                                           */
/* ------------------------------------------------------------------ */

export type VoiceStatus =
  /** Nothing is asking to listen, or the microphone has not started yet. */
  | "idle"
  /** Asked for the microphone; waiting for the browser. */
  | "starting"
  /** The microphone is open and a command would be heard. */
  | "listening"
  /** Open, but discounting what it hears until the prompt stops playing. */
  | "waiting"
  /** Permission was refused, or the browser wants a tap first. */
  | "blocked"
  /** The recogniser is there but does not work: no backend, or no network. */
  | "failing"
  /** This browser has no speech recognition. */
  | "unsupported";

type RecognitionAlternative = { transcript: string };

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<RecognitionAlternative>>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
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

/**
 * Compare on words alone.
 *
 * Transcripts arrive with punctuation, capitals and a typographic apostrophe,
 * and the same answer comes back as "I'm ready", "im ready" or "I am ready"
 * depending on the browser and the day. Dropping apostrophes rather than
 * replacing them means one written phrase covers the lot.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/['‘’ʼ′`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Both sides are read through a function rather than held as values, so a
 * phrase list rebuilt on every render does not re-register the command and
 * take the microphone away mid-sentence.
 */
type Command = { phrases: () => string[]; run: () => void };

/** Newest last: a command from the exercise wins over one from the session. */
const commands: Command[] = [];
const statusWatchers = new Set<() => void>();

let recognition: SpeechRecognitionLike | null = null;
let status: VoiceStatus = "idle";
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let gestureRetryPending = false;
/** Result slots already acted on, and slots that were our own prompt. */
let handledSlots = new Set<number>();
let ourOwnSlots = new Set<number>();

/** Recognition stops after a pause; this is how long before it is reopened. */
const RESTART_MS = 250;
/** Longer, for a start that was refused: retrying hard would just fail faster. */
const RETRY_MS = 1_000;
/** Shorter than this and the run was failing rather than waiting for speech. */
const MIN_RUN_MS = 400;
/** Failures in a row before the screen stops promising something that works. */
const MAX_FAILURES = 3;

/**
 * Errors that mean the recogniser exists but cannot do the job. Chrome sends
 * the audio to a Google service, and a browser built without that service —
 * or a laptop that is offline — reports `network` forever while looking
 * exactly like a microphone that is listening.
 */
const SERVICE_ERRORS = new Set(["network", "language-not-supported", "bad-grammar"]);

let startedAt = 0;
let failures = 0;
/** Whether this run has produced any transcript at all. */
let sawResult = false;

/**
 * A run that achieved nothing. A few in a row and the offer to speak is
 * withdrawn rather than left on screen failing quietly, which is the whole
 * complaint: the person keeps answering and decides the fault is theirs.
 */
function noteFailure() {
  failures += 1;
  if (failures < MAX_FAILURES) return;
  clearRestart();
  setStatus("failing");
}

function setStatus(next: VoiceStatus) {
  if (status === next) return;
  status = next;
  statusWatchers.forEach((watch) => watch());
}

/* The microphone is one thing shared by the whole page, so its state is read
   as an external store rather than mirrored into each hook's own state. */

function watchStatus(onChange: () => void) {
  statusWatchers.add(onChange);
  return () => {
    statusWatchers.delete(onChange);
  };
}

function readStatus(): VoiceStatus {
  // A prompt is playing, so a command said now would be discounted as our own
  // voice. That is worth saying rather than claiming to be listening.
  if (status === "listening" && promptPlaying) return "waiting";
  return status;
}

/** Rendered on the server before any of this exists. */
function readStatusOnServer(): VoiceStatus {
  return "idle";
}

function heard(event: RecognitionEvent) {
  // Interim results are matched as well as final ones, so a command lands as
  // the person finishes saying it. Chrome can sit on a final result for
  // seconds when it is waiting to see whether a sentence continues, and a
  // pause that long reads as the app ignoring them.
  sawResult = true;
  failures = 0;

  const ourVoice = hearingOurselves();

  for (let slot = event.resultIndex; slot < event.results.length; slot += 1) {
    if (handledSlots.has(slot)) continue;

    // A slot first heard while a prompt was playing stays discounted even once
    // the prompt has finished: the final result for it arrives afterwards and
    // carries the same words.
    if (ourVoice) {
      ourOwnSlots.add(slot);
      continue;
    }
    if (ourOwnSlots.has(slot)) continue;

    const words = normalise(event.results[slot]?.[0]?.transcript ?? "");
    if (!words) continue;

    for (let i = commands.length - 1; i >= 0; i -= 1) {
      const command = commands[i];
      if (!command.phrases().some((phrase) => words.includes(normalise(phrase)))) continue;
      handledSlots.add(slot);
      command.run();
      return;
    }
  }
}

function clearRestart() {
  if (restartTimer === null) return;
  clearTimeout(restartTimer);
  restartTimer = null;
}

function scheduleStart(delayMs: number) {
  clearRestart();
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startListening();
  }, delayMs);
}

/**
 * Safari will not open the microphone outside a tap or a key press, and Chrome
 * refuses once permission has been dismissed. Rather than retry into a wall,
 * wait for the person to touch the page — they are about to press the button
 * beside the prompt anyway — and take that as the gesture.
 */
function retryOnGesture() {
  if (gestureRetryPending || typeof document === "undefined") return;
  gestureRetryPending = true;

  const retry = () => {
    document.removeEventListener("pointerdown", retry, true);
    document.removeEventListener("keydown", retry, true);
    gestureRetryPending = false;
    if (commands.length > 0) startListening();
  };

  document.addEventListener("pointerdown", retry, true);
  document.addEventListener("keydown", retry, true);
}

function startListening() {
  if (commands.length === 0) return;
  if (status === "listening" || status === "starting") return;

  if (recognition === null) {
    recognition = createRecognition();
    if (recognition === null) {
      setStatus("unsupported");
      return;
    }

    // Keep going through pauses: a patient may take a while to answer.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = heard;

    // Listening state comes from the recognition API's own events rather than
    // being set alongside the calls, so it reflects what the browser is
    // actually doing — start() can be refused, and recognition can end on its
    // own after silence.
    recognition.onstart = () => {
      // Slots are numbered from the start of each run, so what was already
      // acted on in the last run must not block a slot in this one.
      handledSlots = new Set();
      ourOwnSlots = new Set();
      sawResult = false;
      setStatus("listening");
    };

    recognition.onerror = (event) => {
      const code = event?.error;
      // Refused, or there is no microphone to open. Both are worth saying on
      // screen, and neither is fixed by asking again a quarter of a second
      // later.
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        setStatus("blocked");
        retryOnGesture();
        return;
      }
      if (code !== undefined && SERVICE_ERRORS.has(code)) {
        noteFailure();
        return;
      }
      // "no-speech" and "aborted" are ordinary: the person was quiet, or we
      // stopped it. `onend` follows and reopens the run.
      setStatus("idle");
    };

    recognition.onend = () => {
      // A run that ended as soon as it began, having heard nothing, is a
      // recogniser that is not working rather than one waiting for speech.
      const wasteOfTime = Date.now() - startedAt < MIN_RUN_MS && !sawResult;
      if (wasteOfTime) noteFailure();

      if (status === "blocked" || status === "failing") return;
      setStatus("idle");
      if (commands.length === 0) return;
      // Browsers end recognition after a stretch of silence. Reopen it, or the
      // command quietly stops working part way through an exercise. On a timer
      // rather than here: start() inside this handler throws.
      scheduleStart(wasteOfTime ? RETRY_MS : RESTART_MS);
    };
  }

  // Set before asking rather than after: `onstart` can land first, and a
  // recogniser that is already listening must not be reported as starting.
  setStatus("starting");
  try {
    startedAt = Date.now();
    recognition.start();
  } catch {
    // Already running, or the browser wants a gesture first.
    setStatus("idle");
    retryOnGesture();
    scheduleStart(RETRY_MS);
  }
}

function stopListening() {
  clearRestart();
  if (recognition === null) return;
  setStatus("idle");
  try {
    recognition.stop();
  } catch {
    // Not running; nothing to stop.
  }
}

/** Open the microphone from a button, after it was refused or gave up. */
export function startVoiceInput() {
  failures = 0;
  if (status === "blocked" || status === "failing") setStatus("idle");
  startListening();
}

/** What the microphone is doing, for a caller outside React. */
export function voiceInputStatus(): VoiceStatus {
  return readStatus();
}

/**
 * Register a spoken command, and open the microphone if it is not already.
 * Returns the function that removes it again; the last one out closes the
 * microphone. `useVoiceCommand` is a thin wrapper around this.
 */
export function addVoiceCommand(phrases: () => string[], run: () => void): () => void {
  const command: Command = { phrases, run };
  commands.push(command);
  startListening();

  return () => {
    const at = commands.indexOf(command);
    if (at >= 0) commands.splice(at, 1);
    if (commands.length === 0) stopListening();
  };
}

/**
 * Listen for any of `phrases` and call `onMatch` when one is heard.
 *
 * Matching is on words, and forgiving of what people put around a command
 * ("ok, I'm ready then"), so a phrase should be distinctive enough that it is
 * not said by accident. "ready" on its own is not: it matches "I'm not ready".
 *
 * Returns the microphone's state, which the screen is expected to show. A
 * prompt that says "you can say I'm ready" while nothing is listening is worse
 * than no prompt at all.
 */
export function useVoiceCommand(
  phrases: string[],
  onMatch: () => void,
  options: { enabled?: boolean } = {},
): { status: VoiceStatus; listening: boolean } {
  const { enabled = true } = options;
  const current = useSyncExternalStore(watchStatus, readStatus, readStatusOnServer);

  // Both are read inside the recognition callbacks, which fire long after a
  // render, so they are mirrored into refs in an effect rather than written
  // during render. Keeping them out of the effect's dependencies is the point:
  // re-registering every time the parent re-renders would cut the patient off
  // mid-sentence.
  const onMatchRef = useRef(onMatch);
  const phrasesRef = useRef(phrases);
  useEffect(() => {
    onMatchRef.current = onMatch;
    phrasesRef.current = phrases;
  });

  useEffect(() => {
    if (!enabled) return;
    return addVoiceCommand(
      () => phrasesRef.current,
      () => onMatchRef.current(),
    );
  }, [enabled]);

  return { status: current, listening: current === "listening" };
}
