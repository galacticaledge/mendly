/**
 * Text to speech, proxied through the server.
 *
 * The ElevenLabs key stays here and never reaches the browser. The response is
 * the audio itself, so the client can play it without knowing anything about
 * the provider.
 *
 * A 204 means no voice is configured. The client treats that as a signal to use
 * the browser's own speech synthesis, which is worse but always present — and
 * for a patient who is relying on the spoken prompts to use the app at all, a
 * plainer voice is a very different thing from silence.
 */

import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth/session";
import { serviceLog } from "@/lib/serviceLog";

/** A calm, unhurried preset. Rehabilitation instructions should not sound rushed. */
const VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.75,
  speed: 0.92,
};

const MAX_CHARS = 600;

/** The default voice, used when none is named. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/** Says whether the key is working, once per change. See serviceLog. */
const report = serviceLog("ElevenLabs");

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { text } = (await request.json()) as { text?: unknown };
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  // `||`, not `??`: docker compose passes this through as an empty string when
  // it is unset, and an empty voice id is a 404, not a default.
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  if (!apiKey) {
    report("absent", "prompts will be spoken by the browser instead");
    return new NextResponse(null, { status: 204 });
  }

  const startedAt = Date.now();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, MAX_CHARS),
        model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
        voice_settings: VOICE_SETTINGS,
      }),
    },
  );

  if (!response.ok) {
    // The provider's own message, once. A session asks for a prompt every few
    // seconds, so repeating the whole body per call would bury everything else
    // in the log — and the second 401 says nothing the first did not.
    const body = await response.text();
    if (report("failing", `HTTP ${response.status} for voice ${voiceId}`)) {
      console.error("[mendly] ElevenLabs returned", response.status, body);
    }
    // 204 again, so the client falls through to browser speech rather than
    // leaving a patient waiting for a prompt that is never spoken.
    return new NextResponse(null, { status: 204 });
  }

  report("working", `voice ${voiceId}, first prompt in ${Date.now() - startedAt}ms`);

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
