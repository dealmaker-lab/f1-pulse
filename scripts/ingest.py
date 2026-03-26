#!/usr/bin/env python3
"""
F1 Pulse Data Ingestion Pipeline

Populates Supabase PostgreSQL tables from FastF1, Jolpica (Ergast), and OpenF1 APIs.

Data sources:
  - FastF1: Lap times, telemetry, stints, weather (2023+)
  - Jolpica/Ergast API: Standings, results, race calendar (1950-present)
  - OpenF1 API: Sessions, positions, intervals, car data (2023+)

Usage:
  python scripts/ingest.py --year 2025
  python scripts/ingest.py --year 2025 --type laps
  python scripts/ingest.py --all
  python scripts/ingest.py --all --dry-run
"""

import argparse
import math
import os
import sys
import time
from datetime import timedelta
from typing import Any, Optional

import fastf1
import pandas as pd
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ohntpviowjdlqjozdani.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"
OPENF1_BASE = "https://api.openf1.org/v1"

FASTF1_CACHE_DIR = "/tmp/fastf1_cache"

# Year range for --all mode
DEFAULT_YEARS = list(range(2023, 2027))  # 2023-2026 inclusive

BATCH_SIZE = 500
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # seconds, doubles each retry

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_supabase() -> Client:
    """Create and return a Supabase client using service role key."""
    if not SUPABASE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY not set. Copy scripts/.env.example to scripts/.env and fill in your key.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def api_get(url: str, params: Optional[dict] = None) -> Any:
    """HTTP GET with retry logic (3 retries, exponential backoff)."""
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            wait = RETRY_BACKOFF * (2 ** attempt)
            print(f"  Retry {attempt + 1}/{MAX_RETRIES} for {url} (waiting {wait}s): {exc}")
            time.sleep(wait)
    raise RuntimeError(f"Failed after {MAX_RETRIES} retries: {url} — {last_error}")


def td_to_seconds(val) -> Optional[float]:
    """Convert a timedelta or pandas Timedelta to seconds, returning None for NaT/NaN."""
    if val is None:
        return None
    if isinstance(val, timedelta):
        return val.total_seconds()
    if isinstance(val, pd.Timedelta):
        if pd.isna(val):
            return None
        return val.total_seconds()
    if isinstance(val, (int, float)):
        if math.isnan(val):
            return None
        return float(val)
    return None


def safe_float(val) -> Optional[float]:
    """Convert a value to float, returning None for NaN/None."""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f):
            return None
        return f
    except (ValueError, TypeError):
        return None


def safe_int(val) -> Optional[int]:
    """Convert a value to int, returning None for NaN/None."""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f):
            return None
        return int(f)
    except (ValueError, TypeError):
        return None


def safe_str(val) -> Optional[str]:
    """Convert to string, returning None for NaN/None/empty."""
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    s = str(val).strip()
    return s if s else None


def batch_upsert(supabase: Client, table: str, rows: list[dict], conflict_columns: str, dry_run: bool = False) -> int:
    """Upsert rows in batches of BATCH_SIZE. Returns total rows upserted."""
    if not rows:
        return 0
    if dry_run:
        print(f"  [DRY RUN] Would upsert {len(rows)} rows into {table}")
        return len(rows)

    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        try:
            supabase.table(table).upsert(chunk, on_conflict=conflict_columns).execute()
            total += len(chunk)
        except Exception as exc:
            print(f"  ERROR upserting batch {i // BATCH_SIZE + 1} into {table}: {exc}")
            # Continue with remaining batches
    return total


# ---------------------------------------------------------------------------
# OpenF1 session key lookup
# ---------------------------------------------------------------------------

def get_session_keys(year: int) -> list[dict]:
    """
    Get all race session keys for a year from OpenF1.
    Returns list of dicts with session_key, circuit_short_name, date_start, etc.
    """
    data = api_get(f"{OPENF1_BASE}/sessions", params={
        "year": year,
        "session_name": "Race",
    })
    if not isinstance(data, list):
        print(f"  WARNING: Unexpected response from OpenF1 sessions for {year}")
        return []
    return data


# ---------------------------------------------------------------------------
# Ingestion functions
# ---------------------------------------------------------------------------

def ingest_races(year: int, supabase: Client, dry_run: bool = False) -> int:
    """Fetch race calendar from Jolpica and upsert into races table."""
    print(f"\n--- Ingesting races for {year} ---")
    data = api_get(f"{JOLPICA_BASE}/{year}.json")
    races_raw = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])

    if not races_raw:
        print(f"  No races found for {year}")
        return 0

    rows = []
    for race in races_raw:
        circuit = race.get("Circuit", {})
        location = circuit.get("Location", {})
        rows.append({
            "year": year,
            "round": int(race.get("round", 0)),
            "race_name": race.get("raceName", ""),
            "circuit_id": circuit.get("circuitId", ""),
            "circuit_name": circuit.get("circuitName", ""),
            "country": location.get("country", ""),
            "locality": location.get("locality", ""),
            "latitude": safe_float(location.get("lat")),
            "longitude": safe_float(location.get("long")),
            "date": race.get("date"),
            "time": race.get("time", "").replace("Z", "+00:00") if race.get("time") else None,
            "url": race.get("url", ""),
        })

    count = batch_upsert(supabase, "races", rows, "year,round", dry_run)
    print(f"  Upserted {count} races for {year}")
    return count


def ingest_results(year: int, supabase: Client, dry_run: bool = False) -> int:
    """Fetch race results from Jolpica for all rounds in a year."""
    print(f"\n--- Ingesting results for {year} ---")
    data = api_get(f"{JOLPICA_BASE}/{year}/results.json", params={"limit": "500"})
    races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])

    if not races:
        print(f"  No results found for {year}")
        return 0

    rows = []
    for race in races:
        round_num = int(race.get("round", 0))
        for result in race.get("Results", []):
            driver = result.get("Driver", {})
            constructor = result.get("Constructor", {})
            fastest_lap = result.get("FastestLap", {})
            fl_time = fastest_lap.get("Time", {}).get("time") if fastest_lap else None
            fl_avg_speed = safe_float(fastest_lap.get("AverageSpeed", {}).get("speed")) if fastest_lap else None

            # Parse race time — format is either "1:30:45.123" or "+5.432" or "DNF" etc.
            time_str = result.get("Time", {}).get("time") if isinstance(result.get("Time"), dict) else None

            rows.append({
                "year": year,
                "round": round_num,
                "position": safe_int(result.get("position")),
                "position_text": result.get("positionText", ""),
                "driver_id": driver.get("driverId", ""),
                "driver_code": driver.get("code", ""),
                "driver_name": f"{driver.get('givenName', '')} {driver.get('familyName', '')}".strip(),
                "constructor_id": constructor.get("constructorId", ""),
                "constructor_name": constructor.get("name", ""),
                "grid": safe_int(result.get("grid")),
                "laps": safe_int(result.get("laps")),
                "status": result.get("status", ""),
                "points": safe_float(result.get("points")),
                "time_text": time_str,
                "fastest_lap_time": fl_time,
                "fastest_lap_speed": fl_avg_speed,
                "fastest_lap_rank": safe_int(fastest_lap.get("rank")) if fastest_lap else None,
            })

    count = batch_upsert(supabase, "results", rows, "year,round,driver_id", dry_run)
    print(f"  Upserted {count} results for {year}")
    return count


def ingest_standings(year: int, supabase: Client, dry_run: bool = False) -> int:
    """Fetch driver + constructor standings from Jolpica."""
    print(f"\n--- Ingesting standings for {year} ---")
    total = 0

    # Driver standings
    try:
        data = api_get(f"{JOLPICA_BASE}/{year}/driverStandings.json")
        standings_lists = data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])
        driver_rows = []
        for sl in standings_lists:
            round_num = int(sl.get("round", 0))
            for ds in sl.get("DriverStandings", []):
                driver = ds.get("Driver", {})
                constructors = ds.get("Constructors", [])
                constructor_id = constructors[0].get("constructorId", "") if constructors else ""
                constructor_name = constructors[0].get("name", "") if constructors else ""
                driver_rows.append({
                    "year": year,
                    "round": round_num,
                    "position": safe_int(ds.get("position")),
                    "driver_id": driver.get("driverId", ""),
                    "driver_code": driver.get("code", ""),
                    "driver_name": f"{driver.get('givenName', '')} {driver.get('familyName', '')}".strip(),
                    "constructor_id": constructor_id,
                    "constructor_name": constructor_name,
                    "points": safe_float(ds.get("points")),
                    "wins": safe_int(ds.get("wins")),
                })
        count = batch_upsert(supabase, "driver_standings", driver_rows, "year,round,driver_id", dry_run)
        print(f"  Upserted {count} driver standings for {year}")
        total += count
    except Exception as exc:
        print(f"  ERROR fetching driver standings for {year}: {exc}")

    # Constructor standings
    try:
        data = api_get(f"{JOLPICA_BASE}/{year}/constructorStandings.json")
        standings_lists = data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])
        constructor_rows = []
        for sl in standings_lists:
            round_num = int(sl.get("round", 0))
            for cs in sl.get("ConstructorStandings", []):
                constructor = cs.get("Constructor", {})
                constructor_rows.append({
                    "year": year,
                    "round": round_num,
                    "position": safe_int(cs.get("position")),
                    "constructor_id": constructor.get("constructorId", ""),
                    "constructor_name": constructor.get("name", ""),
                    "nationality": constructor.get("nationality", ""),
                    "points": safe_float(cs.get("points")),
                    "wins": safe_int(cs.get("wins")),
                })
        count = batch_upsert(supabase, "constructor_standings", constructor_rows, "year,round,constructor_id", dry_run)
        print(f"  Upserted {count} constructor standings for {year}")
        total += count
    except Exception as exc:
        print(f"  ERROR fetching constructor standings for {year}: {exc}")

    return total


def ingest_laps(year: int, supabase: Client, dry_run: bool = False) -> int:
    """Fetch lap times using FastF1 for each race session."""
    print(f"\n--- Ingesting laps for {year} (FastF1) ---")

    # Get the race schedule from FastF1
    try:
        schedule = fastf1.get_event_schedule(year, include_testing=False)
    except Exception as exc:
        print(f"  ERROR getting schedule for {year}: {exc}")
        return 0

    total = 0
    race_events = schedule[schedule["EventFormat"] != "testing"]

    for _, event in race_events.iterrows():
        round_num = int(event["RoundNumber"])
        event_name = event["EventName"]
        print(f"  Loading laps: Round {round_num} — {event_name}")

        try:
            session = fastf1.get_session(year, round_num, "R")
            session.load(laps=True, telemetry=False, weather=False, messages=False)
        except Exception as exc:
            print(f"    SKIP: Could not load session — {exc}")
            continue

        if session.laps is None or session.laps.empty:
            print(f"    SKIP: No lap data available")
            continue

        laps_df = session.laps
        rows = []
        for _, lap in laps_df.iterrows():
            pit_in = lap.get("PitInTime")
            pit_out = lap.get("PitOutTime")
            is_pit = bool(
                (pit_in is not None and not pd.isna(pit_in))
                or (pit_out is not None and not pd.isna(pit_out))
            )

            rows.append({
                "year": year,
                "round": round_num,
                "driver_code": safe_str(lap.get("Driver")),
                "lap_number": safe_int(lap.get("LapNumber")),
                "lap_time_seconds": td_to_seconds(lap.get("LapTime")),
                "sector1_seconds": td_to_seconds(lap.get("Sector1Time")),
                "sector2_seconds": td_to_seconds(lap.get("Sector2Time")),
                "sector3_seconds": td_to_seconds(lap.get("Sector3Time")),
                "compound": safe_str(lap.get("Compound")),
                "tyre_life": safe_int(lap.get("TyreLife")),
                "position": safe_int(lap.get("Position")),
                "is_pit_lap": is_pit,
                "speed_trap": safe_float(lap.get("SpeedST")),
            })

        count = batch_upsert(supabase, "laps", rows, "year,round,driver_code,lap_number", dry_run)
        print(f"    Upserted {count} laps for round {round_num}")
        total += count

    print(f"  Total laps upserted for {year}: {total}")
    return total


def ingest_stints(year: int, supabase: Client, dry_run: bool = False) -> int:
    """Fetch stint/pit data from OpenF1."""
    print(f"\n--- Ingesting stints for {year} (OpenF1) ---")
    sessions = get_session_keys(year)

    if not sessions:
        print(f"  No race sessions found for {year} on OpenF1")
        return 0

    total = 0
    for sess in sessions:
        session_key = sess.get("session_key")
        circuit = sess.get("circuit_short_name", "unknown")
        print(f"  Loading stints: {circuit} (session_key={session_key})")

        try:
            data = api_get(f"{OPENF1_BASE}/stints", params={"session_key": session_key})
        except Exception as exc:
            print(f"    SKIP: {exc}")
            continue

        if not isinstance(data, list) or not data:
            print(f"    SKIP: No stint data")
            continue

        # Determine round number from session date
        round_num = sess.get("meeting_key")

        rows = []
        for stint in data:
            rows.append({
                "year": year,
                "session_key": session_key,
                "meeting_key": safe_int(sess.get("meeting_key")),
                "circuit_short_name": circuit,
                "driver_number": safe_int(stint.get("driver_number")),
                "stint_number": safe_int(stint.get("stint_number")),
                "compound": safe_str(stint.get("compound")),
                "tyre_age_at_start": safe_int(stint.get("tyre_age_at_start")),
                "lap_start": safe_int(stint.get("lap_start")),
                "lap_end": safe_int(stint.get("lap_end")),
            })

        count = batch_upsert(supabase, "stints", rows, "session_key,driver_number,stint_number", dry_run)
        print(f"    Upserted {count} stints")
        total += count

    print(f"  Total stints upserted for {year}: {total}")
    return total


def ingest_weather(year: int, supabase: Client, dry_run: bool = False) -> int:
    """Fetch weather data from OpenF1."""
    print(f"\n--- Ingesting weather for {year} (OpenF1) ---")
    sessions = get_session_keys(year)

    if not sessions:
        print(f"  No race sessions found for {year} on OpenF1")
        return 0

    total = 0
    for sess in sessions:
        session_key = sess.get("session_key")
        circuit = sess.get("circuit_short_name", "unknown")
        print(f"  Loading weather: {circuit} (session_key={session_key})")

        try:
            data = api_get(f"{OPENF1_BASE}/weather", params={"session_key": session_key})
        except Exception as exc:
            print(f"    SKIP: {exc}")
            continue

        if not isinstance(data, list) or not data:
            print(f"    SKIP: No weather data")
            continue

        rows = []
        for entry in data:
            rows.append({
                "year": year,
                "session_key": session_key,
                "meeting_key": safe_int(sess.get("meeting_key")),
                "circuit_short_name": circuit,
                "date": entry.get("date"),
                "air_temperature": safe_float(entry.get("air_temperature")),
                "humidity": safe_float(entry.get("humidity")),
                "pressure": safe_float(entry.get("pressure")),
                "rainfall": entry.get("rainfall") in (True, 1, "1", "true"),
                "track_temperature": safe_float(entry.get("track_temperature")),
                "wind_direction": safe_int(entry.get("wind_direction")),
                "wind_speed": safe_float(entry.get("wind_speed")),
            })

        count = batch_upsert(supabase, "weather", rows, "session_key,date", dry_run)
        print(f"    Upserted {count} weather entries")
        total += count

    print(f"  Total weather entries upserted for {year}: {total}")
    return total


def ingest_positions(year: int, supabase: Client, dry_run: bool = False) -> int:
    """Fetch position data from OpenF1."""
    print(f"\n--- Ingesting positions for {year} (OpenF1) ---")
    sessions = get_session_keys(year)

    if not sessions:
        print(f"  No race sessions found for {year} on OpenF1")
        return 0

    total = 0
    for sess in sessions:
        session_key = sess.get("session_key")
        circuit = sess.get("circuit_short_name", "unknown")
        print(f"  Loading positions: {circuit} (session_key={session_key})")

        try:
            data = api_get(f"{OPENF1_BASE}/position", params={"session_key": session_key})
        except Exception as exc:
            print(f"    SKIP: {exc}")
            continue

        if not isinstance(data, list) or not data:
            print(f"    SKIP: No position data")
            continue

        rows = []
        for entry in data:
            rows.append({
                "year": year,
                "session_key": session_key,
                "meeting_key": safe_int(sess.get("meeting_key")),
                "circuit_short_name": circuit,
                "driver_number": safe_int(entry.get("driver_number")),
                "position": safe_int(entry.get("position")),
                "date": entry.get("date"),
            })

        count = batch_upsert(supabase, "positions", rows, "session_key,driver_number,date", dry_run)
        print(f"    Upserted {count} position entries")
        total += count

    print(f"  Total position entries upserted for {year}: {total}")
    return total


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

INGEST_TYPES = {
    "races": ingest_races,
    "results": ingest_results,
    "standings": ingest_standings,
    "laps": ingest_laps,
    "stints": ingest_stints,
    "weather": ingest_weather,
    "positions": ingest_positions,
}


def main():
    parser = argparse.ArgumentParser(
        description="F1 Pulse — Ingest F1 data into Supabase from FastF1, Jolpica, and OpenF1",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/ingest.py --year 2025                    # All data types for 2025
  python scripts/ingest.py --year 2025 --type laps        # Only laps for 2025
  python scripts/ingest.py --year 2025 --type standings   # Only standings for 2025
  python scripts/ingest.py --all                           # All data for 2023-2026
  python scripts/ingest.py --all --dry-run                 # Preview without writing
        """,
    )
    parser.add_argument("--year", type=int, help="Year to ingest (e.g. 2025)")
    parser.add_argument("--all", action="store_true", help="Ingest all years (2023-2026)")
    parser.add_argument(
        "--type",
        choices=list(INGEST_TYPES.keys()) + ["all"],
        default="all",
        help="Data type to ingest (default: all)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to database")

    args = parser.parse_args()

    if not args.year and not args.all:
        parser.error("Specify --year YYYY or --all")

    # Determine years to process
    years = DEFAULT_YEARS if args.all else [args.year]

    # Determine which ingestion types to run
    types_to_run = list(INGEST_TYPES.keys()) if args.type == "all" else [args.type]

    # Enable FastF1 cache
    os.makedirs(FASTF1_CACHE_DIR, exist_ok=True)
    fastf1.Cache.enable_cache(FASTF1_CACHE_DIR)

    # Connect to Supabase
    supabase = get_supabase()

    if args.dry_run:
        print("=== DRY RUN MODE — no data will be written ===\n")

    # Track totals for summary
    summary: dict[str, int] = {}
    start_time = time.time()

    for year in years:
        print(f"\n{'='*60}")
        print(f"  Processing year: {year}")
        print(f"{'='*60}")

        for dtype in types_to_run:
            fn = INGEST_TYPES[dtype]
            try:
                count = fn(year, supabase, dry_run=args.dry_run)
                summary[dtype] = summary.get(dtype, 0) + count
            except Exception as exc:
                print(f"\n  FATAL ERROR in {dtype} for {year}: {exc}")
                summary[dtype] = summary.get(dtype, 0)

    # Print summary
    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"  INGESTION COMPLETE {'(DRY RUN)' if args.dry_run else ''}")
    print(f"{'='*60}")
    print(f"  Years: {', '.join(str(y) for y in years)}")
    print(f"  Types: {', '.join(types_to_run)}")
    print(f"  Duration: {elapsed:.1f}s")
    print()
    for dtype, count in summary.items():
        print(f"  {dtype:20s}: {count:>6,} rows")
    print(f"  {'TOTAL':20s}: {sum(summary.values()):>6,} rows")
    print()


if __name__ == "__main__":
    main()
