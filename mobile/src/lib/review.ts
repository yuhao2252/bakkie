// Maps between the three shapes an import passes through:
//   Extraction      what Claude returned (import_jobs.extracted, the silver layer)
//   ReviewForm      what the user edits (plain strings for text inputs)
//   ReviewedImport  what confirm_import() accepts (typed values, the gold input)
//
// The app validates for friendly messages; the database constraints remain the guarantee.

import type { Database } from './database.types';

export type RoastLevel = Database['public']['Enums']['roast_level'];

export const ROAST_LEVELS: { value: RoastLevel; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'medium_light', label: 'Medium light' },
  { value: 'medium', label: 'Medium' },
  { value: 'medium_dark', label: 'Medium dark' },
  { value: 'dark', label: 'Dark' },
];

// Found values below this confidence are highlighted for the user to check.
export const LOW_CONFIDENCE = 0.8;

export interface ExtractedField<T> {
  value: T | null;
  confidence: number;
}

export interface Variety {
  name: string;
  percentage: number | null;
}

// Mirrors extractionSchema in supabase/functions/extract-import/schema.ts.
export interface Extraction {
  coffee: {
    name: ExtractedField<string>;
    roaster: ExtractedField<string>;
    description: ExtractedField<string>;
    country: ExtractedField<string>;
    region: ExtractedField<string>;
    producer: ExtractedField<string>;
    altitude_masl: ExtractedField<number>;
    process: ExtractedField<string>;
    roast_level: ExtractedField<RoastLevel>;
    varieties: ExtractedField<Variety[]>;
    tasting_notes: ExtractedField<string[]>;
    is_decaf: ExtractedField<boolean>;
  };
  bag: {
    roast_date: ExtractedField<string>;
    initial_grams: ExtractedField<number>;
    price: ExtractedField<number>;
    currency: ExtractedField<string>;
    vendor: ExtractedField<string>;
  };
  other_attributes: { key: string; value: string }[];
  warnings: string[];
}

export interface ReviewForm {
  coffee: {
    name: string;
    roaster: string;
    description: string;
    country: string;
    region: string;
    producer: string;
    altitude_masl: string;
    process: string;
    roast_level: RoastLevel | null;
    varieties: string;
    tasting_notes: string;
    is_decaf: boolean;
  };
  bag: {
    roast_date: string;
    initial_grams: string;
    price: string;
    currency: string;
    vendor: string;
  };
}

export interface ReviewedImport {
  coffee_id: string | null;
  coffee: {
    name: string;
    roaster: string | null;
    description: string | null;
    country: string | null;
    region: string | null;
    producer: string | null;
    altitude_masl: number | null;
    process: string | null;
    roast_level: RoastLevel | null;
    varieties: Variety[];
    tasting_notes: string[];
    is_decaf: boolean;
    source_url: string | null;
  };
  bag: {
    roast_date: string | null;
    purchased_at: string | null;
    initial_grams: number;
    price: number | null;
    currency: string | null;
    vendor: string | null;
  };
}

const asText = (field: ExtractedField<string | number>) => (field.value === null ? '' : String(field.value));

export function formatVarieties(varieties: Variety[]): string {
  return varieties
    .map((v) => (v.percentage === null ? v.name : `${v.name} ${v.percentage}%`))
    .join(', ');
}

// "Geisha 70%, Pink Bourbon 30%" -> [{ name: "Geisha", percentage: 70 }, ...]
export function parseVarieties(input: string): Variety[] {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*%$/);
      return match
        ? { name: match[1].trim(), percentage: Number(match[2].replace(',', '.')) }
        : { name: part, percentage: null };
    });
}

export function formFromExtraction(e: Extraction): ReviewForm {
  return {
    coffee: {
      name: asText(e.coffee.name),
      roaster: asText(e.coffee.roaster),
      description: asText(e.coffee.description),
      country: asText(e.coffee.country),
      region: asText(e.coffee.region),
      producer: asText(e.coffee.producer),
      altitude_masl: asText(e.coffee.altitude_masl),
      process: asText(e.coffee.process),
      roast_level: e.coffee.roast_level.value,
      varieties: formatVarieties(e.coffee.varieties.value ?? []),
      tasting_notes: (e.coffee.tasting_notes.value ?? []).join(', '),
      is_decaf: e.coffee.is_decaf.value ?? false,
    },
    bag: {
      roast_date: asText(e.bag.roast_date),
      initial_grams: asText(e.bag.initial_grams),
      price: asText(e.bag.price),
      currency: asText(e.bag.currency),
      vendor: asText(e.bag.vendor),
    },
  };
}

// True when Claude found a value but was not sure about it.
export function isUncertain(field: ExtractedField<unknown>): boolean {
  const found = field.value !== null && !(Array.isArray(field.value) && field.value.length === 0);
  return found && field.confidence < LOW_CONFIDENCE;
}

const optionalText = (s: string) => (s.trim() === '' ? null : s.trim());

function optionalNumber(s: string, label: string): number | null {
  const normalised = s.trim().replace(',', '.');
  if (normalised === '') return null;
  const n = Number(normalised);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
  return n;
}

export function reviewedFromForm(form: ReviewForm, existingCoffeeId: string | null): ReviewedImport {
  if (!existingCoffeeId && form.coffee.name.trim() === '') {
    throw new Error('The coffee needs a name.');
  }

  const grams = optionalNumber(form.bag.initial_grams, 'Weight');
  if (grams === null || grams <= 0) {
    throw new Error('Enter the bag weight in grams.');
  }

  const roastDate = optionalText(form.bag.roast_date);
  if (roastDate && !/^\d{4}-\d{2}-\d{2}$/.test(roastDate)) {
    throw new Error('Roast date must look like 2026-09-01.');
  }

  const altitude = optionalNumber(form.coffee.altitude_masl, 'Altitude');

  return {
    coffee_id: existingCoffeeId,
    coffee: {
      name: form.coffee.name.trim(),
      roaster: optionalText(form.coffee.roaster),
      description: optionalText(form.coffee.description),
      country: optionalText(form.coffee.country),
      region: optionalText(form.coffee.region),
      producer: optionalText(form.coffee.producer),
      altitude_masl: altitude === null ? null : Math.round(altitude),
      process: optionalText(form.coffee.process),
      roast_level: form.coffee.roast_level,
      varieties: parseVarieties(form.coffee.varieties),
      tasting_notes: form.coffee.tasting_notes
        .split(',')
        .map((note) => note.trim().toLowerCase())
        .filter(Boolean),
      is_decaf: form.coffee.is_decaf,
      // null lets confirm_import fall back to the URL the import came from.
      source_url: null,
    },
    bag: {
      roast_date: roastDate,
      purchased_at: null,
      initial_grams: grams,
      price: optionalNumber(form.bag.price, 'Price'),
      currency: optionalText(form.bag.currency)?.toUpperCase() ?? null,
      vendor: optionalText(form.bag.vendor),
    },
  };
}
