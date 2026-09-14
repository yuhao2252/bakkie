# Bakkie — project notes

Handoff notes for continuing work in a new session. Last updated: 2026-09-14.

## 1. What Bakkie is

A multi-user React Native app that works as a personal coffee bean repository:

- Each user has a **private** collection (no sharing between users).
- Add a coffee from a **product web page URL** or from **photos of the bag** (front and back).
- Claude reads the source and extracts coffee and bag details; the user reviews and confirms.
- The app shows the bags on hand, grams left and roast age.

The project is also a learning vehicle: the owner is a data engineer new to app development, so
technical choices are explained, and data-design ideas are built in on purpose (see section 5).

**Working agreement:** ask clarifying questions before making decisions, and explain every
technical choice and its trade-offs.

## 2. Current status

| Area | State |
|---|---|
| Database schema (8 migrations) | Done, applied locally |
| Database tests (pgTAP, 30 tests) | Done, all passing |
| Extraction edge function `extract-import` | Written; auth check verified; **never run against Claude** (no API key yet) |
| Mobile app (sign-in, Beans, Add, Review, Settings) | Written; TypeScript check and iOS bundle pass; **not yet opened on a phone** |
| End-to-end import (URL or photo -> confirmed bag) | **Not yet tested** |
| Photo retention job (delete after 30 days) | Not built |
| Supabase cloud (prod) project | Not created |
| Push to GitHub | Not done (see section 8) |

## 3. Next steps, in order

1. Create `supabase/functions/.env` containing `ANTHROPIC_API_KEY=sk-ant-...` (the file is git-ignored),
   then restart `supabase functions serve` so the function picks up the key.
2. Run a real URL import and a real photo import; check the extraction quality and the review screen.
3. Open the app on the iPhone through Expo Go (section 7) and walk through sign-up, import, review and confirm.
4. Type-check the edge function with Deno (not done yet).
5. Build the 30-day photo retention job (a daily scheduled cleanup of photos from confirmed or rejected imports).
6. Sort out the Git branches and push (section 8).
7. Later: create the Supabase cloud project (prod) and deploy migrations and the function.
8. Phase 2: brew logging, ratings and freshness in the app (the schema already supports them).

## 4. Decisions made (and why)

### Product and scope
| Decision | Reason |
|---|---|
| Separate private collections per user | Simplest model; every row has `user_id` and RLS isolates users. Sharing can be layered on later. |
| MVP = beans + URL/photo import only | Small enough to learn from; brews and ratings come in phase 2. |
| Several photos per import | The front has name and roaster; the back has origin, process and roast date. |
| Confirming creates **coffee + bag** | Labels carry purchase facts too (roast date, weight), so the bag shows up in stock right away. |
| Duplicate coffee (same roaster + name): suggest the match, user decides | Entity resolution with a human in the loop; a silent merge would join different harvests. |
| Flag uncertain fields on the review screen | Claude returns a confidence per field; fields found with confidence below 0.8 are highlighted. |
| Import photos are temporary; delete 30 days after confirm or reject | Keeps a window to re-run extraction. The job row and its extracted JSON are kept. **Not built yet.** |

### Architecture and tooling
| Decision | Reason |
|---|---|
| Supabase backend (Postgres, Auth, Storage, Realtime, Edge Functions) | The database is the security boundary through RLS; no custom API server to write. |
| Local Supabase for dev + Supabase cloud for prod | Dev and prod environments, with migrations as the contract between them. |
| OrbStack as the container runtime | Lighter than Docker Desktop on this Mac. |
| Local analytics (Logflare/Vector) disabled | Saves RAM and disk; Studio's Logs pages don't work locally. |
| Extraction with Claude API, model `claude-opus-5` | Best at small, stylised and non-English label text. Roughly $0.10–0.15 per 2-photo import (estimate). |
| Edge function fetches URLs itself (not Claude's web fetch tool) | The raw page is stored (bronze), so extraction can be re-run without re-fetching. |
| Extraction runs as a background job | The function replies immediately and updates `import_jobs.status`; the app follows via Realtime, so it survives a locked phone or leaving the screen. |
| Confirm = one Postgres function `confirm_import` | A single transaction: all or nothing, never a coffee without its bag. |
| Status transitions enforced by a database trigger | The lifecycle is a constraint; `confirmed` is only reachable through `confirm_import`. |
| Owner-scoped composite foreign keys `(id, user_id)` on every child table | Foreign-key checks bypass RLS; this makes cross-user links structurally impossible. |
| Email + password sign-in | Simplest; works in Expo Go and locally. Apple/Google sign-in maybe later. |
| Repo layout: `supabase/` + `mobile/` side by side | Mirrors the architecture; room for more clients or an `analytics/` folder. |
| Expo (SDK 57), Expo Router, TypeScript | File-based navigation; `supabase gen types` gives compile-time schema checks. |
| Session storage: expo-sqlite localStorage | Expo's official Supabase guide. |
| Test device: iPhone via Expo Go | No Xcode or Apple developer account needed to start. |
| `expo-image-picker` + `expo-image-manipulator` | System camera and library picker; photos resized to a 1600 px long edge and re-encoded as JPEG (iPhone HEIC is rejected by the bucket). |
| TanStack Query for data | Caching, loading and error states, and refetch after changes. |
| Navigation: bottom tabs Beans / Add; review and settings open on top; sign-in before tabs | |
| Styling: plain React Native `StyleSheet` + `src/lib/theme.ts` | Learn Flexbox layout directly; no extra library. Light mode only for now. |
| Database behaviour tests as pgTAP | Like dbt tests: they re-check the invariants after every schema change. |

## 5. Data-design concepts built into the project

- **Grain:** a `coffee` is the product (stable facts); a `bag` is one purchase of it (roast date, price, weight).
- **Closed vs open domains:** Postgres enums for fixed sets (`roast_level`, `bag_status`); per-user lookup tables for sets users extend (roasters, processes, varieties).
- **Ledger instead of a stored balance:** stock = `SUM(grams_delta)` over the append-only `inventory_transactions`; triggers write the entries for bags and brews.
- **Schema-on-read graduating to schema-on-write:** a `jsonb attributes` column holds extra facts until one proves worth its own column.
- **Medallion layers for imports:** `raw_payload` (bronze: fetched page text or photo list) -> `extracted` (silver: fields with confidence) -> `coffees` + `bags` (gold, after human review).
- **State machine as a constraint:** allowed status transitions are enforced by a trigger.
- **Transactional load:** `confirm_import` writes roaster, coffee, varieties and bag atomically, with row locking against double taps.
- **Lineage:** every extraction stores `schema_version`, `prompt_version`, requested and served model, and token usage.
- **Data contract:** the extraction JSON schema (`schema.ts`) and TypeScript types generated from the database.
- **Change data capture style UI:** Realtime events only signal "this row changed"; the app refetches the row.
- **Append-only migrations:** applied migrations are never edited; fixes go in a new migration (for example `..._fix_blend_error_message.sql`).
- **Views for derived state:** `v_bag_stock`, `v_bag_freshness`, `v_coffee_varieties`, `v_bag_overview`, all with `security_invoker = on` so RLS still applies.

## 6. What's in the repo

### `supabase/migrations/`
| File | Contents |
|---|---|
| `20260914200000_initial_schema.sql` | Tables: profiles, roasters, processes, varieties, brew_methods, rating_criteria, coffees, coffee_varieties (blend % check), bags, brews, brew_ratings, inventory_transactions, photos, import_jobs. From an earlier, lost session. |
| `20260914200001_triggers_and_views.sql` | New-user bootstrap (profile + seeded lookups), ledger triggers, the four views. |
| `20260914200002_rls_policies.sql` | RLS on every table: users touch only their own rows. |
| `20260914200003_multi_photo_imports.sql` | `import_job_photos` child table, `created_bag_id`, a "photo import needs photos" rule, private `import-photos` bucket (10 MB, JPEG/PNG/WebP, path `<user_id>/<job_id>/<n>.jpg`) and its storage policies. |
| `20260914200004_owner_scoped_foreign_keys.sql` | Composite `(id, user_id)` foreign keys everywhere. |
| `20260914200005_import_pipeline.sql` | `import_jobs` added to Realtime; `confirm_import(p_job_id, p_reviewed jsonb)`. |
| `20260914200006_import_status_transitions.sql` | Status state-machine trigger. |
| `20260914200007_fix_blend_error_message.sql` | Fixes the "total %120.00" message formatting. |

Allowed import status moves: `pending -> extracting | rejected`, `extracting -> extracted | failed`,
`failed -> extracting | rejected`, `extracted -> extracting | rejected | confirmed` (confirmed only via `confirm_import`).
`confirmed` and `rejected` are final.

### `supabase/tests/database/`
`01_security.test.sql`, `02_inventory.test.sql`, `03_import_pipeline.test.sql` — 30 tests, all passing.

### `supabase/functions/extract-import/`
| File | Role |
|---|---|
| `index.ts` | Requires a signed-in user (`withSupabase({ auth: 'user' })`, `verify_jwt = true`). Claims the job (moves it to `extracting`), replies 202, then runs extraction with `EdgeRuntime.waitUntil`. Calls Claude through `anthropic.beta.messages.create` with `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) and a JSON schema in `output_config.format`. Checks `stop_reason` for refusal or truncation. Writes `extracted`, `confidence`, `raw_payload` and lineage, or marks the job `failed` with a message. |
| `schema.ts` | The extraction contract (`SCHEMA_VERSION = 1`): per-field `{ value, confidence }` for coffee and bag, plus `other_attributes` and `warnings`. |
| `prompt.ts` | System prompt (`PROMPT_VERSION = "2026-09-14.1"`). |
| `sources.ts` | URL loading with a guard against internal addresses, manual redirects, size limits, and HTML -> text plus JSON-LD and meta tags. Photo loading from Storage as base64. |
| `deno.json` | Pinned: `@anthropic-ai/sdk@0.125.0`, `@supabase/server@1.6.0`, `@supabase/supabase-js@2.116.0`. |

Local background tasks need `[edge_runtime] policy = "per_worker"` in `config.toml` (already set).

### `mobile/` (Expo SDK 57, React Native 0.86, React 19.2)
| Path | Role |
|---|---|
| `src/app/_layout.tsx` | Query client, session provider, splash handling; `Stack.Protected` switches between sign-in and the app. |
| `src/app/sign-in.tsx` | Email + password sign-in and sign-up. |
| `src/app/(app)/_layout.tsx` | Stack over the tabs; `import/[id]` and `settings` (modal). |
| `src/app/(app)/(tabs)/_layout.tsx` | Native tabs Beans / Add (icons reuse the template's images). |
| `src/app/(app)/(tabs)/index.tsx` | Beans: bags on hand from `v_bag_overview`, grams-left bar, roast age. |
| `src/app/(app)/(tabs)/add.tsx` | URL import, camera/library photos (max 10), recent imports with live status. |
| `src/app/(app)/import/[id].tsx` | Import status screen: waiting, failed (retry or discard), review form with flagged fields and the existing-coffee match, confirmed or discarded. |
| `src/app/(app)/settings.tsx` | Signed-in email, sign out (clears the query cache). |
| `src/lib/supabase.ts` | Typed Supabase client; token refresh only in the foreground. |
| `src/lib/database.types.ts` | Generated by `supabase gen types` — regenerate after schema changes. |
| `src/lib/imports.ts` | Create URL and photo imports, start extraction, Realtime-backed job hooks, match lookup, confirm, reject, retry. |
| `src/lib/review.ts` | Mapping: Extraction -> editable form -> `confirm_import` payload, with validation. |
| `src/lib/photos.ts`, `bags.ts`, `auth.tsx`, `query-client.ts`, `theme.ts` | Photo pick and resize, bag list query, session context, TanStack Query setup, colours and spacing. |
| `src/components/ui.tsx` | Screen, Card, Message, Button, TextField. |
| `.env.local` (git-ignored) | `EXPO_PUBLIC_SUPABASE_URL=http://192.168.200.46:54321` (the Mac's Wi-Fi IP, so the phone can reach local Supabase) and the local publishable key. Update the IP if it changes. |
| `example/` (git-ignored) | The Expo template's example screens, kept for reference. |

`mobile/src/app/index.tsx` was deleted on purpose; the home screen is now `src/app/(app)/(tabs)/index.tsx`.
`mobile/CLAUDE.md` / `AGENTS.md` come from the template: read the Expo v57 docs before writing Expo code.

## 7. Development environment and commands

**Machine:** Intel Mac (x86_64), macOS 15, 16 GB RAM, about 11 GB free disk (tight), no Xcode.
Homebrew core formulae have no prebuilt Intel packages here and compile from source (very slow), so prefer vendor binaries.

| Tool | Where / how installed |
|---|---|
| Node 24 LTS (24.21.0) | Prebuilt from nodejs.org in `~/.local/node` (symlink); on PATH via `~/.bash_profile` and `~/.zshrc` |
| GitHub CLI `gh` 2.100.0 | Prebuilt binary in `~/.local/bin`; on PATH the same way; **not logged in** |
| Supabase CLI 2.117.0 | `brew install supabase/tap/supabase` |
| OrbStack (Docker) | `brew install --cask orbstack`; `docker` at `~/.orbstack/bin/docker` |

**Local Supabase:** API `http://127.0.0.1:54321`, Postgres port `54322`, Studio `http://127.0.0.1:54323`,
Mailpit (captured emails) `http://127.0.0.1:54324`. Keys: run `supabase status`.
Local test user: `test@bakkie.local` / `local-dev-only-1234` (lost after `supabase db reset`).

```bash
# Backend (from the repo root)
supabase start                      # start the local stack (OrbStack must be running)
supabase functions serve            # run edge functions locally (reads supabase/functions/.env)
supabase test db                    # run the pgTAP tests
supabase migration new <name>       # create a new migration file
supabase migration up --local       # apply new migrations to the local database
supabase db reset                   # rebuild the local database from all migrations (wipes data)
supabase gen types typescript --local > mobile/src/lib/database.types.ts

# App
cd mobile && npx expo start         # scan the QR code with the iPhone camera (Expo Go, same Wi-Fi)
cd mobile && npx tsc --noEmit       # type-check
```

## 8. Git and GitHub

- Remote: `origin = https://github.com/yuhao2252/bakkie.git`.
- Current branch **`develop`** at `89518f7`, **7 commits ahead of `origin/develop`** (not pushed).
- Local `main` is at `c19bafc` (the initial schema commit). **`origin/main` is a different commit** (`0e70f99 "Initial commit"`, created on GitHub), so local and remote `main` have unrelated histories — decide how to reconcile before merging or pushing `main`.
- Pushing needs authentication: run `gh auth login` in your own terminal. HTTPS pushes then use it.
- Unresolved: `~/.ssh/known_hosts` has a GitHub host key that does not match what GitHub presents. Verify it against GitHub's published fingerprints before using SSH; it was deliberately not edited.

## 9. Known limitations and open questions

- The URL guard blocks internal IPs and hostnames, but not public hostnames that resolve to private IPs.
- The existing-coffee match is exact (case-insensitive name + roaster); near-duplicates ("Lot 12" vs "Lot #12") are not caught.
- `confirm_import` rejects a duplicate coffee instead of merging; the review screen explains this.
- No bag detail screen and no way to edit or finish a bag in the app yet.
- `npm audit` reports 14 moderate vulnerabilities from the Expo template dependencies (not reviewed).
- The Mac's Wi-Fi IP in `mobile/.env.local` changes between networks.
- Extraction quality and cost have not been measured on real coffees yet; consider collecting a few imports as an evaluation set.
