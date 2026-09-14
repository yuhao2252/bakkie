# Bakkie

Project status, decisions, file map and commands live in PROJECT_NOTES.md, imported below.

@PROJECT_NOTES.md

## Working agreement

- The owner is a data engineer learning app development through this project. Ask clarifying questions before making decisions, and explain each technical choice and its trade-offs, relating it to data-engineering concepts where it helps.
- Keep PROJECT_NOTES.md current: update its status, decisions, next steps and file map whenever they change.

## Rules

- Migrations are append-only. Never edit an applied migration; add a new one with `supabase migration new <name>`.
- After any schema change: run `supabase test db` and regenerate `mobile/src/lib/database.types.ts`.
- Every user-owned table needs RLS and owner-scoped `(id, user_id)` foreign keys.
- Expo code targets SDK 57; check the versioned docs (see mobile/AGENTS.md) rather than relying on memory.
- This is an Intel Mac where Homebrew core formulae compile from source; prefer vendor prebuilt binaries.
