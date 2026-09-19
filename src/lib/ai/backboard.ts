/**
 * The Backboard call — the only LLM client in Mendly.
 *
 * Backboard is the LLM service in the architecture plan: one API in front of
 * many providers, with conversation threads and memory built in. Mendly asks
 * it for Gemini. We do not talk to Google directly, and we do not keep our own
 * store of what the planner has said before — that is the whole reason this
 * service is in the architecture. Backboard holds the planner's memory; our
 * database holds the clinical record.
 *
 * API shape (docs.backboard.io):
 *   POST https://app.backboard.io/api/threads/messages
 *   X-API-Key: <key>
 *   { content, thread_id?, system_prompt?, llm_provider?, model_name?,
 *     json_output?, memory?, ... }
 *   → { content, thread_id, status, input_tokens, output_tokens, ... }
 *
 * Threads are how that memory is addressed. Each patient has one long-running
 * thread, so the planner sees its own previous drafts for this patient and can
 * build on them instead of restarting cold every session. The thread id is the
 * one thing we persist, on the patient row — without it there is no way to
 * continue the right conversation.
 *
 * What we still send on every call, rather than trusting memory for, is the
 * current rules and the measured performance. Those are clinical facts a
 * practitioner audits, they change between sessions, and our database is their
 * source of truth. Memory carries continuity of reasoning; it does not carry
 * the numbers.
 */

import type { ExerciseSetProposal } from "@/lib/contracts";
import { serviceLog } from "@/lib/serviceLog";
import {
  buildPrompt,
  parseProposal,
  RESPONSE_SHAPE_INSTRUCTION,
  SYSTEM_INSTRUCTION,
  type PlanningContext,
} from "@/lib/ai/prompt";

const ENDPOINT = process.env.BACKBOARD_API_URL ?? "https://app.backboard.io/api/threads/messages";

/**
 * Which model Backboard routes to: Google's Gemini.
 *
 * Backboard's docs do not publish a fixed list of Gemini identifiers — the
 * catalogue moves — so the exact name is configurable and `npm run ai:models`
 * prints what this account can actually reach. If the name is wrong Backboard
 * answers with an error, this returns null, and the local rules engine drafts
 * the set instead so the patient still gets a session.
 */
const PROVIDER = process.env.BACKBOARD_LLM_PROVIDER ?? "google";
const MODEL = process.env.BACKBOARD_MODEL ?? "gemini-2.5-flash";

/**
 * Backboard's memory, on.
 *
 * "Auto" lets it extract and recall facts across the patient's thread, which
 * is what we are paying it for: the planner remembers how this patient has
 * been progressing without Mendly building a memory layer of its own.
 *
 * The trade this makes is worth stating plainly: the prompt contains a named
 * patient's history, goals and measured performance, so that content lives in
 * Backboard's store as well as ours. That is a data-residency decision for
 * whoever deploys this, not a technical detail — see the README.
 */
const MEMORY_MODE = process.env.BACKBOARD_MEMORY ?? "Auto";

/** How long to wait before giving up and letting the rules engine answer. */
const TIMEOUT_MS = Number(process.env.BACKBOARD_TIMEOUT_MS ?? 30_000);

/** Says whether the key is working, once per change. See serviceLog. */
const report = serviceLog("Backboard");

/**
 * Whether the planner is available at all.
 *
 * This is where the caller decides between Backboard and the rules engine, so
 * it is also where "no key" has to be said. Reporting it inside the call below
 * would never be reached: the caller does not make the call.
 */
export function isBackboardConfigured(): boolean {
  const configured = Boolean(process.env.BACKBOARD_API_KEY);
  if (!configured) report("absent", "the rules engine will draft every set");
  return configured;
}

/** What the planner routed through, for the practitioner's review screen. */
export function backboardModelLabel(): string {
  return `${MODEL} via Backboard`;
}

type BackboardResponse = {
  content?: string | null;
  status?: string | null;
  thread_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
};

export type BackboardResult = {
  proposal: ExerciseSetProposal;
  /**
   * The thread this ran in. On a patient's first call Backboard creates one
   * and returns its id; the caller stores it so the next call continues the
   * same conversation.
   */
  threadId: string | null;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Ask Backboard for a proposal, continuing this patient's thread.
 *
 * Returns null on any failure — a missing key, a network error, an unusable
 * answer — and the caller falls back to the rules engine. A planning assistant
 * being unavailable must never stop a patient from exercising.
 *
 * @param threadId the patient's existing thread, or null to start one
 */
export async function proposeWithBackboard(
  context: PlanningContext,
  threadId: string | null,
): Promise<BackboardResult | null> {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    report("absent", "the rules engine will draft every set");
    return null;
  }

  // Backboard cannot enforce a response schema: `json_output` guarantees valid
  // JSON, not a particular shape. So the shape is asked for in the system
  // prompt and checked by parseProposal on the way back.
  const systemPrompt = `${SYSTEM_INSTRUCTION}\n\n${RESPONSE_SHAPE_INSTRUCTION}`;

  // Temperature is not settable per message on this endpoint — it belongs to
  // an assistant. The default is fine here: the prompt is tightly constrained
  // and the guardrails clamp anything adventurous.
  const body = {
    // Omitted on the first call, which makes Backboard create the thread.
    ...(threadId ? { thread_id: threadId } : {}),
    content: buildPrompt(context),
    system_prompt: systemPrompt,
    llm_provider: PROVIDER,
    model_name: MODEL,
    stream: false,
    json_output: true,
    memory: MEMORY_MODE,
    web_search: "off",
  };

  // A hung request would leave a practitioner watching a spinner, so the call
  // is bounded and a timeout is treated like any other failure.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      report("failing", `HTTP ${response.status} from ${ENDPOINT}`);
      console.error(
        "[mendly] Backboard returned",
        response.status,
        (await response.text()).slice(0, 500),
      );
      return null;
    }

    const payload = (await response.json()) as BackboardResponse;

    if (payload.status === "FAILED") {
      report("failing", "Backboard accepted the key but the message failed");
      console.error("[mendly] Backboard reported a failed message:", payload);
      return null;
    }

    // An answered message is the proof: the key authenticated, the provider
    // and model names resolved, and something came back. Whether that content
    // parses is a separate question, and not one about the key.
    report(
      "working",
      `${MODEL} via ${PROVIDER}, ${payload.input_tokens ?? 0} tokens in / ${payload.output_tokens ?? 0} out`,
    );

    const proposal = parseProposal(payload.content, "backboard");
    if (!proposal) return null;

    return {
      proposal,
      threadId: payload.thread_id ?? threadId,
      inputTokens: payload.input_tokens ?? 0,
      outputTokens: payload.output_tokens ?? 0,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    if (timedOut) {
      report("failing", `no answer within ${TIMEOUT_MS}ms`);
      console.error(`[mendly] Backboard did not answer within ${TIMEOUT_MS}ms; falling back.`);
    } else {
      report("failing", "the request did not complete");
      console.error("[mendly] Backboard proposal failed, falling back:", error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
