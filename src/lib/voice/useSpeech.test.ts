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
