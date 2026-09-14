import "@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "@anthropic-ai/sdk";
import { withSupabase } from "@supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt.ts";
import { type Extraction, extractionSchema, normalise, overallConfidence, SCHEMA_VERSION } from "./schema.ts";
import { loadPage, loadPhotos, type SourceInput } from "./sources.ts";

const MODEL = "claude-opus-5";

interface ClaimedJob {
  id: string;
  source: "url" | "photo";
  source_url: string | null;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Use POST." }, { status: 405 });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return Response.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const jobId = body?.job_id;
    if (typeof jobId !== "string") {
      return Response.json({ error: "job_id is required." }, { status: 400 });
    }

    // Claiming the job means moving it to 'extracting'. The status filter makes a
    // second call for a job that is already extracting match no row, instead of
    // starting a duplicate run. ctx.supabase acts as the signed-in user, so RLS
    // hides other users' jobs, and the database triggers reject invalid moves
    // (for example a photo import without photos).
    const { data: job, error } = await ctx.supabase
      .from("import_jobs")
      .update({ status: "extracting", error_message: null })
      .eq("id", jobId)
      .in("source", ["url", "photo"])
      .in("status", ["pending", "failed", "extracted"])
      .select("id, source, source_url")
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (!job) {
      return Response.json({ error: "Import not found, or not ready for extraction." }, { status: 409 });
    }

    // Respond now and keep working; the app follows progress on the job row via Realtime.
    EdgeRuntime.waitUntil(extract(ctx.supabase, new Anthropic({ apiKey }), job as ClaimedJob));
    return Response.json({ job_id: job.id, status: "extracting" }, { status: 202 });
  }),
};

async function extract(db: SupabaseClient, anthropic: Anthropic, job: ClaimedJob) {
  let rawPayload: SourceInput["rawPayload"] | null = null;

  try {
    const source = job.source === "url" ? await loadPage(job.source_url!) : await loadPhotos(db, job.id);
    rawPayload = source.rawPayload;

    const { extraction, meta } = await callClaude(anthropic, source);
    if (rawPayload.truncated) {
      extraction.warnings.push("The page was very long, so only its first part was read.");
    }

    const { error } = await db
      .from("import_jobs")
      .update({
        status: "extracted",
        extracted: { ...extraction, meta },
        confidence: overallConfidence(extraction),
        raw_payload: rawPayload,
        processed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) throw new Error(`Saving the extraction failed: ${error.message}`);
  } catch (err) {
    console.error(`extract-import ${job.id} failed`, err);
    // Keep whatever raw input was captured, so a failed run can be inspected or retried.
    const { error } = await db
      .from("import_jobs")
      .update({
        status: "failed",
        error_message: describe(err),
        raw_payload: rawPayload,
        processed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) console.error(`extract-import ${job.id}: could not record the failure`, error);
  }
}

async function callClaude(anthropic: Anthropic, source: SourceInput) {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // If Opus 5's safety classifier declines, the API re-runs the request on a suitable fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        ...source.content,
        { type: "text", text: `Today's date: ${new Date().toISOString().slice(0, 10)}` },
      ],
    }],
    // Constrained decoding: the reply is guaranteed to match the schema unless it
    // was refused or cut off, which the stop_reason checks below catch.
    output_config: { format: { type: "json_schema", schema: extractionSchema } },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to read this import.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The extraction was cut off before it finished.");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no extraction.");
  }

  return {
    extraction: normalise(JSON.parse(block.text) as Extraction),
    // Lineage: which contract, prompt and model produced this row, and what it cost in tokens.
    meta: {
      schema_version: SCHEMA_VERSION,
      prompt_version: PROMPT_VERSION,
      requested_model: MODEL,
      served_model: response.model,
      usage: response.usage,
      extracted_at: new Date().toISOString(),
    },
  };
}

function describe(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected.";
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
