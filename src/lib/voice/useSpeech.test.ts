/**
 * The speaking half, and what happens when the person leaves.
 *
 * Stopping audio that is already playing was never the hard part. The hard
 * part is that fetching a prompt takes a few hundred milliseconds, and a
 * session screen can be navigated away from inside that window. What used to
 * happen then was that the request finished, built an `Audio` the component's
 * cleanup had already run past, and played a rehabilitation instruction over
 * whatever page the person had gone to. Nothing was left holding a reference
 * to it, so nothing could stop it.
 *
 * Every test here leaves at a different moment: while fetching, while reading
 * the body, and after playback has begun.
 */

import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";

/** An `Audio` that records what was asked of it. */
class FakeAudio {
  static built: FakeAudio[] = [];

  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playing = false;
  pauses = 0;
  /** Defaults to 1, as a real HTMLAudioElement does. */
  playbackRate = 1;

  constructor(readonly src: string) {
    FakeAudio.built.push(this);
  }

  async play() {
    this.playing = true;
  }

  pause() {
    this.pauses += 1;
    this.playing = false;
  }
}

class FakeUtterance {
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

const synth = { spoken: [] as FakeUtterance[], cancels: 0 };
const urls = { created: [] as string[], revoked: [] as string[] };

/** Resolves the next fetch by hand, so a test can leave mid-request. */
let pending: ((value: unknown) => void) | null = null;

let voice: typeof import("@/lib/voice/useVoice");

before(async () => {
  Object.assign(globalThis, {
    window: {
      localStorage: {
        store: new Map<string, string>(),
        writes: 0,
        getItem(key: string) {
          return this.store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          this.writes += 1;
          this.store.set(key, value);
        },
      },
      speechSynthesis: {
        cancel() {
          synth.cancels += 1;
        },
        speak(utterance: FakeUtterance) {
          synth.spoken.push(utterance);
        },
      },
    },
    document: { addEventListener() {}, removeEventListener() {} },
    Audio: FakeAudio,
    SpeechSynthesisUtterance: FakeUtterance,
    fetch: () => new Promise((resolve) => (pending = resolve)),
  });

  // Added to the real URL rather than replacing it: tsx resolves modules with
  // `new URL(...)`, so a stand-in constructor breaks the test run itself.
  Object.assign(URL, {
    createObjectURL(): string {
      const url = `blob:${urls.created.length}`;
      urls.created.push(url);
      return url;
    },
    revokeObjectURL(url: string) {
      urls.revoked.push(url);
    },
  });

  voice = await import("@/lib/voice/useVoice");
});

after(() => {
  voice.stopSpeaking();
});

type FakeStorage = { getItem(key: string): string | null; writes: number };

/** The fake storage the module writes the chosen speed to. */
function storage(): FakeStorage {
  return (globalThis as unknown as { window: { localStorage: FakeStorage } }).window.localStorage;
}

function storageWrites(): number {
  return storage().writes;
}

/** A response carrying audio, the way the route answers with a key set. */
function audioResponse() {
  return { status: 200, ok: true, blob: async () => ({}) };
}

function reset() {
  FakeAudio.built = [];
  synth.spoken = [];
  synth.cancels = 0;
  urls.created = [];
  urls.revoked = [];
  pending = null;
}

test("leaving while the prompt is still being fetched plays nothing", async () => {
  reset();
  let finished = 0;
  const speaking = voice.speakAloud("Lift your arm.", () => (finished += 1));

  // The page changes: the session screen unmounts and its cleanup runs.
  voice.stopSpeaking();

  // Only now does ElevenLabs answer.
  pending?.(audioResponse());
  await speaking;

  assert.equal(FakeAudio.built.length, 0, "a prompt was built after leaving");
  assert.equal(synth.spoken.length, 0, "the browser was asked to speak after leaving");
  assert.equal(finished, 0, "a cancelled prompt never finished");
});

test("leaving while the audio body is being read plays nothing", async () => {
  reset();
  // Held on an object: assigning to a bare local inside the executor leaves
  // TypeScript believing it is still null at the call below.
  const body: { release: (() => void) | null } = { release: null };
  const speaking = voice.speakAloud("Hold it there.", () => {});

  pending?.({
    status: 200,
    ok: true,
    // The body arrives only once the test says so.
    blob: () =>
      new Promise((resolve) => {
        body.release = () => resolve({});
      }),
  });
  await Promise.resolve();

  voice.stopSpeaking();
  body.release?.();
  await speaking;

  assert.equal(FakeAudio.built.length, 0, "a prompt was built after leaving");
});

test("leaving once the prompt is playing stops it", async () => {
  reset();
  const speaking = voice.speakAloud("Come back down slowly.", () => {});
  pending?.(audioResponse());
  await speaking;

  const audio = FakeAudio.built[0];
  assert.ok(audio, "the prompt should have started");
  assert.equal(audio.playing, true);

  voice.stopSpeaking();

  assert.equal(audio.pauses, 1, "the prompt kept playing after the page changed");
  assert.equal(audio.playing, false);
});

test("leaving silences the browser's own voice too", async () => {
  reset();
  const speaking = voice.speakAloud("Start when you are ready.", () => {});
  // 204 is the no-API-key answer, which falls back to browser speech.
  pending?.({ status: 204, ok: true, blob: async () => ({}) });
  await speaking;

  assert.equal(synth.spoken.length, 1, "the browser should have spoken");

  const before = synth.cancels;
  voice.stopSpeaking();
  assert.ok(synth.cancels > before, "speechSynthesis was left talking");
});

test("the audio's object URL is released, whether it finishes or is cut off", async () => {
  reset();
  const speaking = voice.speakAloud("One.", () => {});
  pending?.(audioResponse());
  await speaking;
  FakeAudio.built[0].onended?.();
  assert.deepEqual(urls.revoked, urls.created, "a finished prompt leaked its URL");

  reset();
  const second = voice.speakAloud("Two.", () => {});
  pending?.(audioResponse());
  await second;
  voice.stopSpeaking();
  assert.deepEqual(urls.revoked, urls.created, "a cancelled prompt leaked its URL");
});

test("a new prompt replaces the one before it rather than talking over it", async () => {
  reset();
  const first = voice.speakAloud("First line.", () => {});
  pending?.(audioResponse());
  await first;

  const second = voice.speakAloud("Second line.", () => {});
  pending?.(audioResponse());
  await second;

  assert.equal(FakeAudio.built.length, 2);
  assert.equal(FakeAudio.built[0].playing, false, "the first prompt was talked over");
  assert.equal(FakeAudio.built[1].playing, true);
});

test("a prompt that finishes on its own reports back", async () => {
  reset();
  let finished = 0;
  const speaking = voice.speakAloud("All done.", () => (finished += 1));
  pending?.(audioResponse());
  await speaking;

  FakeAudio.built[0].onended?.();
  assert.equal(finished, 1);
});


/* ------------------------------------------------------------------ */
/* How fast it speaks                                                  */
/* ------------------------------------------------------------------ */

/**
 * The pace is a quarter-step multiplier with ends to it.
 *
 * The ends matter more than they look. Below half the recorded voice slurs
 * into something harder to follow than the speed it was set to fix, and above
 * double an instruction stops being an instruction. Both are reachable by
 * holding a button, so both are clamped rather than trusted.
 */

test("a quarter step at a time, in both directions", () => {
  voice.setVoiceSpeed(1);
  voice.nudgeVoiceSpeed(1);
  assert.equal(voice.voiceSpeed(), 1.25);
  voice.nudgeVoiceSpeed(1);
  assert.equal(voice.voiceSpeed(), 1.5);
  voice.nudgeVoiceSpeed(-1);
  assert.equal(voice.voiceSpeed(), 1.25);
  voice.nudgeVoiceSpeed(-1);
  assert.equal(voice.voiceSpeed(), 1);
});

test("it stops at both ends rather than running past them", () => {
  const { slowest, fastest } = voice.VOICE_SPEED_RANGE;

  voice.setVoiceSpeed(1);
  for (let i = 0; i < 20; i += 1) voice.nudgeVoiceSpeed(-1);
  assert.equal(voice.voiceSpeed(), slowest);

  for (let i = 0; i < 40; i += 1) voice.nudgeVoiceSpeed(1);
  assert.equal(voice.voiceSpeed(), fastest);

  voice.setVoiceSpeed(1);
});

test("anything off the step lands on one, and nonsense is ignored", () => {
  voice.setVoiceSpeed(1.3);
  assert.equal(voice.voiceSpeed(), 1.25);
  voice.setVoiceSpeed(0.9);
  assert.equal(voice.voiceSpeed(), 1);
  voice.setVoiceSpeed(Number.NaN);
  assert.equal(voice.voiceSpeed(), 1, "NaN is not a speed");
  voice.setVoiceSpeed(1);
});

test("changing the speed reaches the sentence already playing", async () => {
  reset();
  voice.setVoiceSpeed(1);
  const speaking = voice.speakAloud("Lift your arm slowly.", () => {});
  pending?.(audioResponse());
  await speaking;

  const audio = FakeAudio.built[0];
  assert.equal(audio.playbackRate, 1, "a prompt starts at the set speed");

  voice.nudgeVoiceSpeed(-1);
  assert.equal(audio.playbackRate, 0.75, "the sentence being listened to did not change pace");

  voice.stopSpeaking();
  voice.setVoiceSpeed(1);
});

test("a prompt starts at whatever the speed already is", async () => {
  reset();
  voice.setVoiceSpeed(1.5);
  const speaking = voice.speakAloud("Hold it there.", () => {});
  pending?.(audioResponse());
  await speaking;

  assert.equal(FakeAudio.built[0].playbackRate, 1.5);
  voice.stopSpeaking();
  voice.setVoiceSpeed(1);
});

test("the browser voice is set against the unhurried baseline, not raw speed", async () => {
  reset();
  voice.setVoiceSpeed(2);
  // 204 is the no-API-key answer, which falls back to browser speech.
  const speaking = voice.speakAloud("Start when you are ready.", () => {});
  pending?.({ status: 204, ok: true, blob: async () => ({}) });
  await speaking;

  const utterance = synth.spoken[0];
  assert.ok(utterance, "the browser should have spoken");
  // 0.92 is the written pace; double that, not double the browser default.
  assert.ok(Math.abs(utterance.rate - 1.84) < 1e-9, `rate was ${utterance.rate}`);

  voice.setVoiceSpeed(1);
});

test("the speed is remembered for the next session", () => {
  voice.setVoiceSpeed(0.75);
  assert.equal(storage().getItem("mendly.voice.speed"), "0.75");
  voice.setVoiceSpeed(1);
});

test("setting the speed it already is does nothing at all", () => {
  voice.setVoiceSpeed(1);
  const writes = storageWrites();

  voice.setVoiceSpeed(1);
  assert.equal(storageWrites(), writes, "an unchanged speed was written anyway");

  // 1.1 rounds to 1, so this is the same speed arriving by a different route.
  voice.setVoiceSpeed(1.1);
  assert.equal(storageWrites(), writes, "a value that rounds to the current speed still wrote");

  voice.nudgeVoiceSpeed(1);
  assert.equal(storageWrites(), writes + 1, "a real change should be written");

  voice.setVoiceSpeed(1);
});
