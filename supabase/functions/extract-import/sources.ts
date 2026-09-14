import type Anthropic from "@anthropic-ai/sdk";
import { encodeBase64 } from "@std/encoding/base64";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SourceInput {
  content: Exclude<Anthropic.Beta.BetaMessageParam["content"], string>;
  // Everything we captured from the source (the bronze layer), saved on the job.
  rawPayload: Record<string, unknown> & { truncated?: boolean };
}

const MAX_HTML_BYTES = 3_000_000;
const MAX_PROMPT_CHARS = 150_000;
const MAX_PHOTO_BYTES = 20_000_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

// ---------------------------------------------------------------------------
// URL imports
// ---------------------------------------------------------------------------

// Fetching a user-supplied link from our server is a server-side request forgery
// risk: without this check a caller could make the function request internal
// addresses. Hostnames that merely resolve to private IPs are not caught here.
function assertPublicHttpUrl(raw: string, base?: URL): URL {
  const url = new URL(raw, base);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https links can be imported.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const privateIpv4 = isIpv4 &&
    /^(0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host);
  const privateIpv6 = host.includes(":") && (host === "::1" || /^(fc|fd|fe80)/.test(host));
  const internalName = host === "localhost" ||
    /\.(localhost|local|internal)$/.test(host) ||
    (!host.includes(".") && !host.includes(":"));

  if (privateIpv4 || privateIpv6 || internalName) {
    throw new Error("That link does not point to a public web page.");
  }
  return url;
}

async function readLimited(res: Response, maxBytes: number) {
  if (!res.body) return { html: "", truncated: false };

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= maxBytes) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { html: new TextDecoder().decode(bytes.subarray(0, Math.min(size, maxBytes))), truncated };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function htmlToText(html: string): string {
  const withoutNoise = html.replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const withBreaks = withoutNoise.replace(
    /<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi,
    "\n",
  );
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// Shop pages often carry exact product data (price, weight) in meta tags and JSON-LD.
function metaTags(html: string): [string, string][] {
  const tags: [string, string][] = [];
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/gi)) {
    const attrs: Record<string, string> = Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1].toLowerCase(), m[2]]),
    );
    const key = attrs.property ?? attrs.name;
    if (key && attrs.content && /^(og:|product:|twitter:|description$)/i.test(key)) {
      tags.push([key, decodeEntities(attrs.content)]);
    }
  }
  return tags;
}

export async function loadPage(sourceUrl: string): Promise<SourceInput> {
  let url = assertPublicHttpUrl(sourceUrl);
  let res: Response | undefined;

  // Redirects are followed by hand so every hop passes the public-address check.
  for (let hop = 0; hop <= 3; hop++) {
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; BakkieImporter/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = assertPublicHttpUrl(location, url);
      res = undefined;
      continue;
    }
    break;
  }

  if (!res) throw new Error("The link redirected too many times.");
  if (!res.ok) throw new Error(`The page answered with HTTP ${res.status}.`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    throw new Error(`The link is not a web page (${contentType || "unknown content type"}).`);
  }

  const { html, truncated: htmlTruncated } = await readLimited(res, MAX_HTML_BYTES);
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  const jsonLd = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  const meta = metaTags(html);
  const text = htmlToText(html);

  let document = [
    `URL: ${url}`,
    `Title: ${title}`,
    "",
    "Structured data (JSON-LD):",
    jsonLd.join("\n\n") || "(none)",
    "",
    "Meta tags:",
    meta.map(([k, v]) => `${k}: ${v}`).join("\n") || "(none)",
    "",
    "Page text:",
    text,
  ].join("\n");

  const promptTruncated = document.length > MAX_PROMPT_CHARS;
  if (promptTruncated) document = document.slice(0, MAX_PROMPT_CHARS);

  return {
    content: [{ type: "text", text: `Extract the coffee and bag details from this product page.\n\n${document}` }],
    rawPayload: {
      kind: "url",
      requested_url: sourceUrl,
      final_url: url.toString(),
      http_status: res.status,
      content_type: contentType,
      fetched_at: new Date().toISOString(),
      title,
      json_ld: jsonLd,
      meta: Object.fromEntries(meta),
      text,
      truncated: htmlTruncated || promptTruncated,
    },
  };
}

// ---------------------------------------------------------------------------
// Photo imports
// ---------------------------------------------------------------------------

export async function loadPhotos(db: SupabaseClient, jobId: string): Promise<SourceInput> {
  const { data: photos, error } = await db
    .from("import_job_photos")
    .select("storage_path, position")
    .eq("import_job_id", jobId)
    .order("position");

  if (error) throw new Error(`Could not list the photos: ${error.message}`);
  if (!photos?.length) throw new Error("This import has no photos.");

  const content: SourceInput["content"] = [];
  const stored: { storage_path: string; media_type: string; bytes: number }[] = [];
  let totalBytes = 0;

  for (const photo of photos) {
    const { data: blob, error: downloadError } = await db.storage
      .from("import-photos")
      .download(photo.storage_path);
    if (downloadError || !blob) {
      throw new Error(`Could not read photo ${photo.position + 1}: ${downloadError?.message ?? "empty file"}`);
    }

    if (!(IMAGE_TYPES as readonly string[]).includes(blob.type)) {
      throw new Error(`Photo ${photo.position + 1} has unsupported type "${blob.type}".`);
    }

    totalBytes += blob.size;
    if (totalBytes > MAX_PHOTO_BYTES) {
      throw new Error("The photos are too large together. They should be resized before upload.");
    }

    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: blob.type as ImageType,
        data: encodeBase64(new Uint8Array(await blob.arrayBuffer())),
      },
    });
    stored.push({ storage_path: photo.storage_path, media_type: blob.type, bytes: blob.size });
  }

  content.push({
    type: "text",
    text: `These ${photos.length} photo(s) show one coffee bag, possibly from several sides. Extract the coffee and bag details.`,
  });

  // The image files stay in Storage; the payload records exactly which ones were read.
  return { content, rawPayload: { kind: "photos", photos: stored } };
}
