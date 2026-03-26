# F1 Pulse Data Ingestion Pipeline

Python scripts to populate the F1 Pulse Supabase database from FastF1, Jolpica (Ergast successor), and OpenF1 APIs.

## Data Sources

| Source | Data | Coverage |
|--------|------|----------|
| [Jolpica/Ergast](https://api.jolpi.ca/ergast/f1/) | Race calendar, results, standings | 1950-present |
| [FastF1](https://docs.fastf1.dev/) | Lap times, sectors, tyre data | 2018+ (best 2023+) |
| [OpenF1](https://openf1.org/) | Stints, weather, positions, intervals | 2023+ |

## Setup

```bash
cd scripts

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure Supabase credentials
cp .env.example .env
# Edit .env and add your SUPABASE_SERVICE_KEY (service role key from Supabase dashboard)
```

Get the service role key from: https://supabase.com/dashboard/project/ohntpviowjdlqjozdani/settings/api

## Usage

```bash
# Ingest all data types for a specific year
python ingest.py --year 2025

# Ingest only a specific data type
python ingest.py --year 2025 --type laps
python ingest.py --year 2025 --type standings
python ingest.py --year 2025 --type races

# Ingest all years (2023-2026)
python ingest.py --all

# Preview without writing to database
python ingest.py --year 2025 --dry-run

# Combine options
python ingest.py --all --type results --dry-run
```

### Available data types

| Type | Table(s) | Source | Description |
|------|----------|--------|-------------|
| `races` | `races` | Jolpica | Race calendar with circuit info |
| `results` | `results` | Jolpica | Race results with positions, times, points |
| `standings` | `driver_standings`, `constructor_standings` | Jolpica | Championship standings |
| `laps` | `laps` | FastF1 | Lap times, sectors, tyre compound, speed trap |
| `stints` | `stints` | OpenF1 | Tyre stint data per driver |
| `weather` | `weather` | OpenF1 | Track and air conditions during sessions |
| `positions` | `positions` | OpenF1 | Live position data during sessions |
| `all` | All above | All | Run every ingestion type |

## How It Works

1. **Connects to Supabase** using the service role key (bypasses RLS)
2. **Fetches data** from the appropriate API for the requested year(s) and type(s)
3. **Transforms** raw API responses into table-compatible rows (handling NaN, timedeltas, etc.)
4. **Upserts** in batches of 500 rows with conflict resolution on unique keys
5. **Retries** failed API calls up to 3 times with exponential backoff

### FastF1 caching

FastF1 data is cached to `/tmp/fastf1_cache` to avoid re-downloading large session files. The first run for a year will be slow (downloads ~50-200MB per race), subsequent runs are fast.

## Recommended Ingestion Order

For a fresh database:

```bash
# Step 1: Calendar and results (fast, API-based)
python ingest.py --all --type races
python ingest.py --all --type results
python ingest.py --all --type standings

# Step 2: OpenF1 data (medium speed)
python ingest.py --all --type stints
python ingest.py --all --type weather
python ingest.py --all --type positions

# Step 3: FastF1 lap data (slow — downloads session files)
python ingest.py --all --type laps
```

## Troubleshooting

- **"SUPABASE_SERVICE_KEY not set"** — Copy `.env.example` to `.env` and fill in the key
- **FastF1 timeout/slow** — First run downloads large files. Check `/tmp/fastf1_cache` for cached data
- **"Failed after 3 retries"** — API may be rate-limited or down. Wait and retry
- **Upsert errors** — Ensure Supabase tables exist with the expected schema (see migration files)
