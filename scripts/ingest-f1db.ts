#!/usr/bin/env npx tsx
/**
 * F1DB Historical Data Ingestion
 * Fetches F1DB data (YAML) from GitHub and upserts into Supabase.
 *
 * Usage:
 *   npx tsx scripts/ingest-f1db.ts --type circuits
 *   npx tsx scripts/ingest-f1db.ts --type drivers
 *   npx tsx scripts/ingest-f1db.ts --type constructors
 *   npx tsx scripts/ingest-f1db.ts --type all
 *
 * Requires:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY env vars
 *   npm install -D yaml   (for YAML parsing)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.\n" +
      "Copy scripts/.env.example → scripts/.env and fill in your values.",
  );
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

/** F1DB raw content base on GitHub (main branch, YAML sources). */
const F1DB_RAW =
  "https://raw.githubusercontent.com/f1db/f1db/main/src/data";

/** GitHub API base for listing directory contents. */
const F1DB_API = "https://api.github.com/repos/f1db/f1db/contents/src/data";

const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "f1-pulse-ingest/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "f1-pulse-ingest/1.0" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}: ${await res.text()}`);
  }
  return res.text();
}

/** List YAML file slugs in an F1DB data directory. */
async function listEntities(
  entityDir: string,
): Promise<string[]> {
  interface GhFile {
    name: string;
    type: string;
  }
  const entries = await fetchJson<GhFile[]>(`${F1DB_API}/${entityDir}`);
  return entries
    .filter((e) => e.type === "file" && e.name.endsWith(".yml"))
    .map((e) => e.name.replace(/\.yml$/, ""));
}

/** Fetch and parse a single YAML entity. */
async function fetchEntity<T = Record<string, unknown>>(
  entityDir: string,
  slug: string,
): Promise<T> {
  const text = await fetchText(`${F1DB_RAW}/${entityDir}/${slug}.yml`);
  return parseYaml(text) as T;
}

/** Sleep helper for rate-limit politeness. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Type interfaces for F1DB YAML data
// ---------------------------------------------------------------------------

interface F1DBCircuit {
  id: string;
  name: string;
  fullName: string;
  previousNames?: string[];
  type: string;
  direction?: string;
  placeName?: string;
  countryId: string;
  latitude?: number;
  longitude?: number;
  length?: number;
  turns?: number;
  layouts?: Array<{
    id: string;
    effective?: boolean;
    length?: number;
    turns?: number;
  }>;
}

interface F1DBDriver {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  abbreviation: string;
  permanentNumber?: number;
  gender: string;
  dateOfBirth: string;
  dateOfDeath?: string;
  placeOfBirth?: string;
  countryOfBirthCountryId?: string;
  nationalityCountryId: string;
}

interface F1DBConstructor {
  id: string;
  name: string;
  fullName: string;
  countryId: string;
  chronology?: Array<{
    constructorId: string;
    yearFrom: number;
    yearTo?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Ingestion: Circuits
// ---------------------------------------------------------------------------

async function ingestCircuits(): Promise<void> {
  console.log("\n--- Ingesting circuits ---");
  const slugs = await listEntities("circuits");
  console.log(`Found ${slugs.length} circuits in F1DB`);

  const rows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    try {
      const c = await fetchEntity<F1DBCircuit>("circuits", slug);
      const activeLayout = c.layouts?.find((l) => l.effective) ?? c.layouts?.[0];

      rows.push({
        f1db_id: c.id,
        name: c.name,
        full_name: c.fullName,
        country_id: c.countryId,
        place_name: c.placeName ?? null,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        length_km: activeLayout?.length ?? c.length ?? null,
        turns: activeLayout?.turns ?? c.turns ?? null,
        direction: c.direction ?? null,
        circuit_type: c.type,
      });
    } catch (err) {
      console.warn(`  [SKIP] ${slug}: ${(err as Error).message}`);
    }

    // Rate-limit: ~0.5 s between requests to be polite to GitHub
    if ((i + 1) % 10 === 0) {
      console.log(`  Fetched ${i + 1}/${slugs.length}...`);
      await sleep(500);
    }
  }

  // Upsert in batches
  console.log(`Upserting ${rows.length} circuits...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("circuits")
      .upsert(batch, { onConflict: "f1db_id" });
    if (error) {
      console.error(`  Batch upsert error (offset ${i}):`, error.message);
    }
  }
  console.log(`Circuits done: ${rows.length} upserted.`);
}

// ---------------------------------------------------------------------------
// Ingestion: Drivers
// ---------------------------------------------------------------------------

async function ingestDrivers(): Promise<void> {
  console.log("\n--- Ingesting drivers ---");
  const slugs = await listEntities("drivers");
  console.log(`Found ${slugs.length} drivers in F1DB`);

  const rows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    try {
      const d = await fetchEntity<F1DBDriver>("drivers", slug);
      rows.push({
        f1db_id: d.id,
        code: d.abbreviation ?? null,
        first_name: d.firstName,
        last_name: d.lastName,
        full_name: d.fullName ?? `${d.firstName} ${d.lastName}`,
        permanent_number: d.permanentNumber ?? null,
        date_of_birth: d.dateOfBirth ?? null,
        nationality_country_id: d.nationalityCountryId ?? null,
      });
    } catch (err) {
      console.warn(`  [SKIP] ${slug}: ${(err as Error).message}`);
    }

    if ((i + 1) % 20 === 0) {
      console.log(`  Fetched ${i + 1}/${slugs.length}...`);
      await sleep(500);
    }
  }

  console.log(`Upserting ${rows.length} drivers...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("drivers")
      .upsert(batch, { onConflict: "f1db_id" });
    if (error) {
      console.error(`  Batch upsert error (offset ${i}):`, error.message);
    }
  }
  console.log(`Drivers done: ${rows.length} upserted.`);
}

// ---------------------------------------------------------------------------
// Ingestion: Constructors
// ---------------------------------------------------------------------------

async function ingestConstructors(): Promise<void> {
  console.log("\n--- Ingesting constructors ---");
  const slugs = await listEntities("constructors");
  console.log(`Found ${slugs.length} constructors in F1DB`);

  const rows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    try {
      const c = await fetchEntity<F1DBConstructor>("constructors", slug);

      // Determine active years from chronology
      const activeEntry = c.chronology?.find((ch) => !ch.yearTo);
      const firstEntry = c.chronology?.[0];

      rows.push({
        f1db_id: c.id,
        name: c.name,
        full_name: c.fullName,
        country_id: c.countryId,
        year_from: firstEntry?.yearFrom ?? null,
        year_to: activeEntry ? null : c.chronology?.at(-1)?.yearTo ?? null,
      });
    } catch (err) {
      console.warn(`  [SKIP] ${slug}: ${(err as Error).message}`);
    }

    if ((i + 1) % 20 === 0) {
      console.log(`  Fetched ${i + 1}/${slugs.length}...`);
      await sleep(500);
    }
  }

  console.log(`Upserting ${rows.length} constructors...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("constructors")
      .upsert(batch, { onConflict: "f1db_id" });
    if (error) {
      console.error(`  Batch upsert error (offset ${i}):`, error.message);
    }
  }
  console.log(`Constructors done: ${rows.length} upserted.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const typeIdx = args.indexOf("--type");
  const type = typeIdx >= 0 ? args[typeIdx + 1] : "all";

  console.log(`F1DB Ingestion — type: ${type}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  const validTypes = ["circuits", "drivers", "constructors", "all"];
  if (!validTypes.includes(type)) {
    console.error(`Invalid type "${type}". Valid: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const start = Date.now();

  try {
    if (type === "circuits" || type === "all") await ingestCircuits();
    if (type === "drivers" || type === "all") await ingestDrivers();
    if (type === "constructors" || type === "all") await ingestConstructors();
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
}

main();
