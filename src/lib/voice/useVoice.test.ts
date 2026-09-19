/**
 * The listening half of voice, against a stand-in recogniser.
 *
 * The browser's speech recognition is the part that actually broke this: it
 * hands the microphone to one recogniser, ends runs on its own, and hears the
 * app's own prompts. None of that is visible in a unit test unless the
 * recogniser is faked closely enough to behave badly the same ways, so the
 * fake below ends runs, refuses starts, and repeats a slot as interim and then
 * final the way Chrome does.
 */

import { strict as assert } from "node:assert";
import { after, before, mock, test } from "node:test";

type Handler<T> = ((event: T) => void) | null;

type ResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

class FakeRecognition {
  static latest: FakeRecognition | null = null;

  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;

  onresult: Handler<ResultEvent> = null;
  onerror: Handler<{ error?: string }> = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  running = false;
  starts = 0;
  stops = 0;

  constructor() {
    FakeRecognition.latest = this;
  }

  start() {
    this.starts += 1;
    // What Chrome throws when it is already listening.
    if (this.running) throw new Error("InvalidStateError");
    this.running = true;
    this.onstart?.();
  }

  stop() {
    this.stops += 1;
    if (!this.running) return;
    this.running = false;
    this.onend?.();
  }

  /** The browser giving up on its own: after silence, or after an error. */
  endRun() {
    this.running = false;
    this.onend?.();
  }

  /** One transcript in one result slot, interim or final. */
  say(slot: number, transcript: string) {
    const results: { transcript: string }[][] = [];
    for (let i = 0; i < slot; i += 1) results.push([{ transcript: "" }]);
    results.push([{ transcript }]);
    this.onresult?.({ resultIndex: slot, results });
  }
}

let voice: typeof import("@/lib/voice/useVoice");

before(async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const listeners = new Map<string, Set<() => void>>();
  Object.assign(globalThis, {
    window: { SpeechRecognition: FakeRecognition },
    document: {
      addEventListener(type: string, handler: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      },
      removeEventListener(type: string, handler: () => void) {
        listeners.get(type)?.delete(handler);
      },
    },
  });

  voice = await import("@/lib/voice/useVoice");
});

after(() => {
  mock.timers.reset();
});

/** The recogniser the module built, once something has asked to listen. */
function recogniser(): FakeRecognition {
  assert.ok(FakeRecognition.latest, "nothing asked for the microphone");
  return FakeRecognition.latest;
}

test("a command opens the microphone and is heard", () => {
  let ran = 0;
  const remove = voice.addVoiceCommand(() => ["im ready"], () => (ran += 1));

  assert.equal(voice.voiceInputStatus(), "listening");
  assert.equal(recogniser().continuous, true);
  // Without interim results a command waits on Chrome deciding the sentence is
  // over, which can be seconds.
  assert.equal(recogniser().interimResults, true);

  recogniser().say(0, "Okay, I'm ready then");
  assert.equal(ran, 1);

  remove();
});

test("the apostrophe, the capitals and the extra words do not matter", () => {
  const heard: string[] = [];
  const remove = voice.addVoiceCommand(() => ["im ready", "i am ready"], () => heard.push("go"));

  recogniser().say(1, "I’m ready!");
  recogniser().say(2, "well I am ready now");
  assert.equal(heard.length, 2);

  remove();
});

test("one utterance runs a command once, however many times it is revised", () => {
  let ran = 0;
  const remove = voice.addVoiceCommand(() => ["im ready"], () => (ran += 1));

  // Chrome sends a slot as interim, revises it, then sends it again as final.
  recogniser().say(3, "im ready");
  recogniser().say(3, "I'm ready");
  recogniser().say(3, "I'm ready to go");
  assert.equal(ran, 1);

  remove();
});

test("a phrase inside a refusal is not a command", () => {
  let ran = 0;
  // "ready" on its own used to be a phrase here. This is why it is not.
  const remove = voice.addVoiceCommand(() => ["im ready"], () => (ran += 1));

  recogniser().say(4, "I am not ready yet");
  assert.equal(ran, 0);

  remove();
});

test("the prompt coming back through the speakers is not an answer", () => {
  let ran = 0;
  const remove = voice.addVoiceCommand(() => ["im ready"], () => (ran += 1));

  voice.notePromptPlaying(true);
  recogniser().say(5, "when you are ready, say I'm ready");
  assert.equal(ran, 0, "the session answered itself");

  // And the screen says so, rather than claiming to be listening while every
  // answer is thrown away.
  assert.equal(voice.voiceInputStatus(), "waiting");

  // The final result for the same slot lands after the prompt has finished and
  // carries the same words. It is still the prompt.
  voice.notePromptPlaying(false);
  mock.timers.tick(600);
  assert.equal(voice.voiceInputStatus(), "listening");
  recogniser().say(5, "when you are ready, say I'm ready");
  assert.equal(ran, 0);

  // The person answering afterwards is a new slot, and does count.
  recogniser().say(6, "I'm ready");
  assert.equal(ran, 1);

  remove();
});

test("a run the browser ended on its own is reopened", () => {
  let ran = 0;
  const remove = voice.addVoiceCommand(() => ["im ready"], () => (ran += 1));
  const before = recogniser().starts;

  // Every browser ends recognition after a stretch of silence. Before this was
  // handled the command simply stopped working part way through a session.
  mock.timers.tick(9000);
  recogniser().endRun();
  assert.equal(voice.voiceInputStatus(), "idle");

  mock.timers.tick(300);
  assert.equal(recogniser().starts, before + 1);
  assert.equal(voice.voiceInputStatus(), "listening");

  // Slots are numbered from the start of each run, so slot 0 must be heard
  // again rather than treated as already handled.
  recogniser().say(0, "I'm ready");
  assert.equal(ran, 1);

  remove();
});

test("the newest command wins when two are registered", () => {
  const ran: string[] = [];
  const removeSession = voice.addVoiceCommand(() => ["im ready"], () => ran.push("session"));
  const removeExercise = voice.addVoiceCommand(() => ["im ready"], () => ran.push("exercise"));

  recogniser().say(1, "I'm ready");
  assert.deepEqual(ran, ["exercise"]);

  removeExercise();
  removeSession();
});

test("the last command out closes the microphone, and it stays closed", () => {
  const remove = voice.addVoiceCommand(() => ["im ready"], () => {});
  const stops = recogniser().stops;

  remove();
  assert.equal(recogniser().stops, stops + 1);
  assert.equal(voice.voiceInputStatus(), "idle");

  const starts = recogniser().starts;
  mock.timers.tick(2000);
  assert.equal(recogniser().starts, starts, "the microphone reopened with nothing listening");
});

test("a refused microphone is reported rather than retried into a wall", () => {
  const remove = voice.addVoiceCommand(() => ["im ready"], () => {});
  recogniser().onerror?.({ error: "not-allowed" });
  recogniser().endRun();

  assert.equal(voice.voiceInputStatus(), "blocked");

  const starts = recogniser().starts;
  mock.timers.tick(5000);
  assert.equal(recogniser().starts, starts);

  // The screen offers a button, which asks again inside a gesture.
  voice.startVoiceInput();
  assert.equal(voice.voiceInputStatus(), "listening");

  remove();
});

test("a prompt that never reports finishing does not leave the app deaf", () => {
  let ran = 0;
  const remove = voice.addVoiceCommand(() => ["im ready"], () => (ran += 1));

  // The audio element can fail to fire `ended`. Without a ceiling on that, the
  // microphone stays open and every answer is discarded for the rest of the
  // session.
  voice.notePromptPlaying(true);
  mock.timers.tick(21_000);
  assert.equal(voice.voiceInputStatus(), "listening");

  recogniser().say(20, "I'm ready");
  assert.equal(ran, 1);

  remove();
});

test("a recogniser that never works stops being offered", () => {
  const remove = voice.addVoiceCommand(() => ["im ready"], () => {});

  // What a browser with no speech service behind the microphone does: the run
  // opens, fails at once, and would otherwise be reopened forever while the
  // screen kept saying "listening".
  for (let attempt = 0; attempt < 3; attempt += 1) {
    recogniser().onerror?.({ error: "network" });
    recogniser().endRun();
    mock.timers.tick(1100);
  }

  assert.equal(voice.voiceInputStatus(), "failing");

  const starts = recogniser().starts;
  mock.timers.tick(10_000);
  assert.equal(recogniser().starts, starts, "it kept trying into a wall");

  remove();
});

test("an ordinary silence is not counted as a failure", () => {
  const remove = voice.addVoiceCommand(() => ["im ready"], () => {});
  voice.startVoiceInput();

  // Chrome raises "no-speech" after a stretch of quiet. It happens constantly
  // and says nothing about whether recognition works.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    mock.timers.tick(9000);
    recogniser().onerror?.({ error: "no-speech" });
    recogniser().endRun();
    mock.timers.tick(300);
  }

  assert.equal(voice.voiceInputStatus(), "listening");

  remove();
});
