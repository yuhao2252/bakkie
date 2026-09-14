// The extraction contract: the shape of import_jobs.extracted (the silver layer).
// Bump SCHEMA_VERSION on any breaking change so stored extractions stay interpretable.
export const SCHEMA_VERSION = 1;

export const ROAST_LEVELS = ["light", "medium_light", "medium", "medium_dark", "dark"] as const;

type JsonSchema = Record<string, unknown>;

const text: JsonSchema = { type: "string" };

const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });

// Structured outputs require every object to list all properties as required and
// forbid extra keys. "Not found" is expressed as value: null, never as a missing key.
const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

// Every fact carries its own confidence, so the review screen can flag guesses.
const field = (value: JsonSchema): JsonSchema =>
  object({ value: nullable(value), confidence: { type: "number" } });

export const extractionSchema = object({
  coffee: object({
    name: field(text),
    roaster: field(text),
    description: field(text),
    country: field(text),
    region: field(text),
    producer: field(text),
    altitude_masl: field({ type: "integer" }),
    process: field(text),
    roast_level: field({ type: "string", enum: [...ROAST_LEVELS] }),
    varieties: field({
      type: "array",
      items: object({ name: text, percentage: nullable({ type: "number" }) }),
    }),
    tasting_notes: field({ type: "array", items: text }),
    is_decaf: field({ type: "boolean" }),
  }),
  bag: object({
    roast_date: field({ type: "string", format: "date" }),
    initial_grams: field({ type: "number" }),
    price: field({ type: "number" }),
    currency: field(text),
    vendor: field(text),
  }),
  // Facts without a column yet. They can later land in coffees.attributes (jsonb).
  other_attributes: { type: "array", items: object({ key: text, value: text }) },
  warnings: { type: "array", items: text },
});

export interface Field<T = unknown> {
  value: T | null;
  confidence: number;
}

export interface Extraction {
  coffee: Record<string, Field>;
  bag: Record<string, Field>;
  other_attributes: { key: string; value: string }[];
  warnings: string[];
}

// The schema cannot express numeric ranges, so confidence bounds are enforced here.
export function normalise(extraction: Extraction): Extraction {
  for (const group of [extraction.coffee, extraction.bag]) {
    for (const f of Object.values(group)) {
      f.confidence = Number.isFinite(f.confidence) ? Math.min(1, Math.max(0, f.confidence)) : 0;
    }
  }
  return extraction;
}

const isFound = (f: Field) => f.value !== null && !(Array.isArray(f.value) && f.value.length === 0);

// One number per job for sorting and triage: mean confidence of the fields that were found.
export function overallConfidence(extraction: Extraction): number {
  const found = [...Object.values(extraction.coffee), ...Object.values(extraction.bag)].filter(isFound);
  if (found.length === 0) return 0;
  const mean = found.reduce((sum, f) => sum + f.confidence, 0) / found.length;
  return Math.round(mean * 100) / 100;
}
