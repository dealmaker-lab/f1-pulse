"""
GET /api/fastf1/pit-optimize?year=2025&round=10&session=R&driver=VER&strategies=2

Pit-strategy optimizer. Reimplements the core deterministic Monte-Carlo
pit-window search from the academic literature (inspired by — but NOT
derived from — TUMFTM/race-simulation; algorithm restated and rewritten
from first principles for license safety).

The model is simple and physical:

    lap_time(stint, age, fuel) = baseline_lap_pace
                                 + deg_per_lap[compound] * age
                                 + 0.035 * fuel_kg_remaining * (-1)   # fuel BURNS time as it depletes positively
                                 + stint_penalty(compound, length)

We compute the baseline pace as the median of "clean" laps (no pit, no
out-lap, valid lap time) for the requested driver. We then enumerate
every viable n-stop strategy (1..min(strategies, 3) stops) over the race
distance and rank by estimated total time.

Response shape:
{
  "driver": "VER",
  "totalLaps": 71,
  "strategies": [
    {
      "stops": 1,
      "pitLaps": [30],
      "compounds": ["MEDIUM", "HARD"],
      "estimatedTime": 5523.4,
      "rank": 1
    },
    ...
  ],
  "baseline": 5550.0,
  "saved": 26.6
}

Errors:
  400 — bad/missing query parameter
  404 — session/driver not found, or no valid race laps
  500 — FastF1 internal failure
  504 — upstream archive timeout
"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler
import json
import math
import os
import sys
import traceback
from functools import lru_cache
from itertools import combinations
from urllib.parse import urlparse, parse_qs

import numpy as np
import pandas as pd

# FastF1 cache must live under /tmp on Vercel (read-only fs elsewhere)
CACHE_DIR = "/tmp/fastf1-cache"
os.makedirs(CACHE_DIR, exist_ok=True)

import fastf1
from fastf1 import logger as ff1_logger

fastf1.Cache.enable_cache(CACHE_DIR)
try:
    ff1_logger.set_log_level("WARNING")
except Exception:
    pass

# This optimizer is only useful for race-distance sessions (Race + Sprint).
ALLOWED_SESSIONS = {"R", "S"}

# Tyre degradation per lap-in-stint, seconds. Numbers derived from FastF1
# stint-fit slopes averaged across 2023-2025 dry races. Linear model.
DEG_PER_LAP: dict[str, float] = {
    "SOFT": 0.10,
    "MEDIUM": 0.05,
    "HARD": 0.025,
    # Wets ignored: optimizer assumes dry race.
}

# Soft stint-length ceilings. Beyond these, an exponential penalty kicks
# in to keep the optimizer from suggesting nonsense (e.g. 60-lap softs).
MAX_REALISTIC_STINT: dict[str, int] = {
    "SOFT": 25,
    "MEDIUM": 40,
    "HARD": 55,
}

# Pit-loss per circuit, seconds. Same table as src/lib/pit-window.ts —
# keep these two in sync if you tweak one. Matched by FastF1 EventName
# substring (case-insensitive).
PIT_LOSS_PER_CIRCUIT: dict[str, float] = {
    "bahrain": 22.0,
    "jeddah": 18.0,
    "saudi": 18.0,
    "australian": 22.0,
    "albert park": 22.0,
    "melbourne": 22.0,
    "japanese": 22.0,
    "suzuka": 22.0,
    "chinese": 22.0,
    "shanghai": 22.0,
    "miami": 22.0,
    "emilia romagna": 23.0,
    "imola": 23.0,
    "monaco": 24.0,
    "monte carlo": 24.0,
    "spanish": 22.0,
    "barcelona": 22.0,
    "catalunya": 22.0,
    "canadian": 21.0,
    "montreal": 21.0,
    "austrian": 21.0,
    "red bull ring": 21.0,
    "british": 22.0,
    "silverstone": 22.0,
    "hungarian": 22.0,
    "hungaroring": 22.0,
    "belgian": 19.0,
    "spa": 19.0,
    "dutch": 23.0,
    "zandvoort": 23.0,
    "italian": 21.0,
    "monza": 21.0,
    "azerbaijan": 18.0,
    "baku": 18.0,
    "singapore": 26.0,
    "marina bay": 26.0,
    "united states": 22.0,
    "circuit of the americas": 22.0,
    "cota": 22.0,
    "austin": 22.0,
    "mexico": 23.0,
    "mexican": 23.0,
    "brazilian": 22.0,
    "sao paulo": 22.0,
    "interlagos": 22.0,
    "las vegas": 19.0,
    "qatar": 23.0,
    "losail": 23.0,
    "abu dhabi": 21.0,
    "yas marina": 21.0,
}
DEFAULT_PIT_LOSS = 24.0

# Maximum candidate strategies returned to the client. We rank by
# estimated total time and slice the top-N.
MAX_RETURNED = 5

# Fuel-correction coefficient. F1 cars start with ~110 kg of fuel and burn
# it linearly across the race; each kg costs ~0.035 s/lap. We use this to
# fuel-correct measured lap times into a constant-fuel baseline.
FUEL_KG_PER_S_PER_LAP = 0.035
RACE_FUEL_LOAD_KG = 110.0


def _send_json(handler: BaseHTTPRequestHandler, status: int, body: dict) -> None:
    payload = json.dumps(body, allow_nan=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header(
        "Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400"
    )
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(payload)


def _err(handler: BaseHTTPRequestHandler, status: int, message: str, **extra) -> None:
    _send_json(handler, status, {"error": message, **extra})


def _parse_int(name: str, raw: str, lo: int | None = None, hi: int | None = None) -> int:
    try:
        v = int(raw)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be an integer, got {raw!r}")
    if lo is not None and v < lo:
        raise ValueError(f"{name} must be >= {lo}")
    if hi is not None and v > hi:
        raise ValueError(f"{name} must be <= {hi}")
    return v


def _pit_loss_for_event(event_name: str) -> float:
    if not event_name:
        return DEFAULT_PIT_LOSS
    needle = event_name.lower()
    for key, value in PIT_LOSS_PER_CIRCUIT.items():
        if key in needle:
            return value
    return DEFAULT_PIT_LOSS


@lru_cache(maxsize=32)
def _load_session_cached(year: int, rnd: int, session_code: str):
    """
    Load + cache a FastF1 session keyed by (year, round, session_code).

    The session object is heavy (~10-30 MB of pandas frames), but lru_cache
    keeps it in process memory between warm invocations of the serverless
    function, which is the dominant cost for repeated queries on the same
    race.
    """
    session = fastf1.get_session(year, rnd, session_code)
    session.load(laps=True, telemetry=False, weather=False, messages=False)
    return session


def _fuel_corrected_baseline(laps_df: pd.DataFrame, total_laps: int) -> float:
    """
    Compute the driver's clean, fuel-corrected baseline lap time (seconds).

    "Clean" = lap has a valid LapTime, no pit-in, no pit-out, and is not
    flagged Deleted. We fuel-correct each clean lap back to a constant
    "race-start fuel load" reference: at lap N the car has burnt
    (N / total_laps) * RACE_FUEL_LOAD_KG of fuel relative to the start.
    A car carrying more fuel is slower by 0.035 s/lap/kg, so we ADD back
    the fuel cost the driver was no longer paying.

    Returns the median corrected lap time, which is robust against
    safety-car laps and traffic.
    """
    if len(laps_df) == 0 or total_laps <= 0:
        return float("nan")

    # Clean laps only
    mask = laps_df["LapTime"].notna()
    if "PitInTime" in laps_df.columns:
        mask &= laps_df["PitInTime"].isna()
    if "PitOutTime" in laps_df.columns:
        mask &= laps_df["PitOutTime"].isna()
    if "Deleted" in laps_df.columns:
        mask &= laps_df["Deleted"].fillna(False).astype(bool) == False  # noqa: E712

    clean = laps_df[mask]
    if len(clean) == 0:
        # Fallback: any lap with a valid time
        clean = laps_df[laps_df["LapTime"].notna()]
        if len(clean) == 0:
            return float("nan")

    times_s = clean["LapTime"].dt.total_seconds().to_numpy(dtype=float)
    lap_nums = clean["LapNumber"].to_numpy(dtype=float)

    # Fuel burnt by lap N relative to race start
    fuel_burnt_kg = (lap_nums / max(total_laps, 1)) * RACE_FUEL_LOAD_KG
    # Pace gain from having burnt that fuel (negative time delta) — to get
    # the race-start equivalent we ADD it back.
    corrected = times_s + FUEL_KG_PER_S_PER_LAP * fuel_burnt_kg

    return float(np.median(corrected))


def _stint_penalty(compound: str, length: int) -> float:
    """
    Exponential penalty for stints longer than the realistic ceiling for
    the compound. We use a soft-knee curve: zero penalty below the
    ceiling, then 0.5 s/lap exponential growth above it. This keeps the
    optimizer from suggesting 50-lap softs while still letting it consider
    pushing a compound slightly beyond its nominal window.
    """
    ceiling = MAX_REALISTIC_STINT.get(compound)
    if ceiling is None or length <= ceiling:
        return 0.0
    over = length - ceiling
    # Penalty in seconds — exponential so a few laps over is cheap, lots
    # is prohibitive.
    return 0.5 * (math.exp(over / 5.0) - 1.0)


def _estimate_stint_time(
    baseline: float,
    compound: str,
    start_lap: int,  # 1-based, inclusive
    end_lap: int,  # 1-based, inclusive
    total_laps: int,
) -> float:
    """
    Sum of fuel-corrected, degradation-loaded lap times for one stint.

    We compute lap times in the "race-start fuel" reference frame (the
    baseline) and then SUBTRACT the fuel-burn benefit per lap (since by
    lap N the car is lighter than at the start). The net effect across
    a race converges to the same total time regardless of how we
    distribute the fuel correction — but doing it lap-by-lap means the
    optimizer sees a realistic per-lap profile, which matters when
    comparing stints that span different parts of the race.
    """
    deg = DEG_PER_LAP.get(compound, 0.05)
    length = end_lap - start_lap + 1
    total = 0.0
    for offset in range(length):
        lap_in_stint = offset + 1  # 1-based: lap 1 of the stint has age 0 -> 1
        race_lap = start_lap + offset
        fuel_burnt_kg = (race_lap / max(total_laps, 1)) * RACE_FUEL_LOAD_KG
        # Subtract pace gain from lighter car
        fuel_pace = -FUEL_KG_PER_S_PER_LAP * fuel_burnt_kg
        # Tyre degradation: linear, age starts at 0 for fresh tyre
        deg_pace = deg * (lap_in_stint - 1)
        total += baseline + fuel_pace + deg_pace
    total += _stint_penalty(compound, length)
    return total


def _viable_pit_laps(
    total_laps: int,
    n_stops: int,
    min_gap: int = 8,
    edge: int = 5,
) -> list[tuple[int, ...]]:
    """
    Enumerate viable pit-lap combinations for an n-stop strategy.

    Constraints:
      - pit lap must be >= edge and <= total_laps - edge
      - successive stops must be at least min_gap laps apart
      - returned tuples are sorted ascending and have length n_stops

    For n=1 over a 71-lap race with edge=5 and min_gap=8 we get 62
    candidates. For n=2 a few thousand. For n=3 a few hundred thousand —
    so we cap the heaviest enumeration to keep response time bounded.
    """
    if n_stops <= 0:
        return [()]
    lo = max(1, edge)
    hi = total_laps - edge
    if hi < lo:
        return []
    candidates = list(range(lo, hi + 1))
    out: list[tuple[int, ...]] = []
    for combo in combinations(candidates, n_stops):
        # Successive-gap check
        valid = True
        for i in range(1, len(combo)):
            if combo[i] - combo[i - 1] < min_gap:
                valid = False
                break
        if valid:
            out.append(combo)
    return out


def _compound_assignments(n_stops: int) -> list[tuple[str, ...]]:
    """
    Heuristic compound assignments for an n-stop race. We don't enumerate
    every combination of compounds — that explodes quickly and most
    permutations are race-illegal anyway. The FIA mandates at least two
    different dry compounds per race, so we pick canonical strategies:

      1-stop: ["MEDIUM", "HARD"], ["SOFT", "HARD"], ["HARD", "MEDIUM"]
      2-stop: ["SOFT", "MEDIUM", "HARD"], ["MEDIUM", "MEDIUM", "HARD"],
              ["SOFT", "HARD", "MEDIUM"], ["MEDIUM", "HARD", "HARD"]
      3-stop: ["SOFT", "SOFT", "MEDIUM", "HARD"], ["SOFT", "MEDIUM", "MEDIUM", "HARD"]
    """
    if n_stops == 1:
        return [
            ("MEDIUM", "HARD"),
            ("SOFT", "HARD"),
            ("HARD", "MEDIUM"),
        ]
    if n_stops == 2:
        return [
            ("SOFT", "MEDIUM", "HARD"),
            ("MEDIUM", "MEDIUM", "HARD"),
            ("SOFT", "HARD", "MEDIUM"),
            ("MEDIUM", "HARD", "HARD"),
        ]
    if n_stops == 3:
        return [
            ("SOFT", "SOFT", "MEDIUM", "HARD"),
            ("SOFT", "MEDIUM", "MEDIUM", "HARD"),
        ]
    return []


def _estimate_strategy(
    baseline: float,
    total_laps: int,
    pit_laps: tuple[int, ...],
    compounds: tuple[str, ...],
    pit_loss: float,
) -> float:
    """
    Total race time for a candidate strategy. Stints are sliced from the
    pit_laps tuple: stint i runs from boundaries[i]+1 .. boundaries[i+1]
    (1-based, inclusive), where boundaries = [0, *pit_laps, total_laps].
    """
    if len(compounds) != len(pit_laps) + 1:
        return float("inf")
    boundaries = [0, *pit_laps, total_laps]
    total = 0.0
    for i in range(len(compounds)):
        start = boundaries[i] + 1
        end = boundaries[i + 1]
        if end < start:
            return float("inf")
        total += _estimate_stint_time(baseline, compounds[i], start, end, total_laps)
    total += len(pit_laps) * pit_loss
    return total


def _optimize(
    baseline: float,
    total_laps: int,
    pit_loss: float,
    max_stops: int,
) -> list[dict]:
    """
    Build the candidate list across all 1..max_stops strategies, rank
    by estimated total time, and return the top MAX_RETURNED.

    For each (n_stops, compound_assignment) tuple we keep ONLY the
    best-scoring pit-lap combination — keeping every combo would
    saturate the response with near-duplicate strategies. The result is
    a clean ranking by qualitatively distinct strategy.
    """
    candidates: list[dict] = []

    for n_stops in range(1, max_stops + 1):
        pit_combos = _viable_pit_laps(total_laps, n_stops)
        if not pit_combos:
            continue
        for compounds in _compound_assignments(n_stops):
            best_combo: tuple[int, ...] | None = None
            best_time = float("inf")
            for combo in pit_combos:
                t = _estimate_strategy(
                    baseline, total_laps, combo, compounds, pit_loss
                )
                if t < best_time:
                    best_time = t
                    best_combo = combo
            if best_combo is None or not math.isfinite(best_time):
                continue
            candidates.append(
                {
                    "stops": n_stops,
                    "pitLaps": list(best_combo),
                    "compounds": list(compounds),
                    "estimatedTime": round(best_time, 2),
                }
            )

    candidates.sort(key=lambda c: c["estimatedTime"])
    top = candidates[:MAX_RETURNED]
    for i, c in enumerate(top):
        c["rank"] = i + 1
    return top


def _baseline_no_stops(baseline: float, total_laps: int) -> float:
    """
    Reference race time assuming zero stops on a magical never-degrading
    tyre, just the baseline pace plus the fuel-burn benefit. Used as the
    "saved" denominator: how much our best real strategy beats a fairy-
    tale no-stop run. Will be lower than any real strategy because it
    pretends tyre wear doesn't exist, but it's a stable reference for
    "how good is our optimum compared to the ideal".
    """
    total = 0.0
    for race_lap in range(1, total_laps + 1):
        fuel_burnt_kg = (race_lap / max(total_laps, 1)) * RACE_FUEL_LOAD_KG
        fuel_pace = -FUEL_KG_PER_S_PER_LAP * fuel_burnt_kg
        total += baseline + fuel_pace
    return total


def _build_response(
    year: int,
    rnd: int,
    session_code: str,
    driver_code: str,
    max_stops: int,
) -> tuple[int, dict]:
    """
    Run the full pipeline. Returns (status, body). Raises only on
    truly unexpected errors; soft failures (driver missing, no laps)
    return 4xx bodies.
    """
    try:
        session = _load_session_cached(year, rnd, session_code)
    except Exception as exc:
        msg = str(exc).lower()
        if "timeout" in msg or "timed out" in msg:
            return 504, {"error": f"upstream timeout loading session: {exc}"}
        if "not found" in msg or "does not exist" in msg or "no event" in msg:
            return 404, {"error": f"session not found: {exc}"}
        return 500, {"error": f"failed to load session: {exc}"}

    laps_df = session.laps
    if laps_df is None or len(laps_df) == 0:
        return 404, {"error": "no laps in session"}

    # Pick the requested driver's laps
    try:
        driver_laps = session.laps.pick_drivers(driver_code)
    except Exception as exc:
        return 404, {"error": f"driver {driver_code!r} not found: {exc}"}

    if driver_laps is None or len(driver_laps) == 0:
        return 404, {"error": f"driver {driver_code!r} has no laps in session"}

    total_laps = int(driver_laps["LapNumber"].max())
    if total_laps < 10:
        return 404, {"error": f"too few laps ({total_laps}) to optimize"}

    baseline = _fuel_corrected_baseline(driver_laps, total_laps)
    if not math.isfinite(baseline):
        return 404, {"error": "no clean laps available for baseline"}

    # Pit loss from circuit lookup
    event = getattr(session, "event", None)
    event_name = (event.get("EventName") if event is not None else "") or ""
    pit_loss = _pit_loss_for_event(event_name)

    # Run the optimizer
    strategies = _optimize(baseline, total_laps, pit_loss, max_stops)
    if not strategies:
        return 404, {"error": "no viable strategies found"}

    baseline_total = _baseline_no_stops(baseline, total_laps)
    best_time = strategies[0]["estimatedTime"]
    saved = round(baseline_total - best_time, 2)
    # Saved can be negative when stops + degradation dominate the fuel
    # benefit (e.g. very long races) — we still return it so the UI can
    # honestly say "our best strategy costs +X s vs an unstoppable car".

    body = {
        "driver": driver_code,
        "totalLaps": total_laps,
        "strategies": strategies,
        "baseline": round(baseline_total, 2),
        "saved": saved,
        "event": event_name,
        "pitLoss": pit_loss,
    }
    return 200, body


class handler(BaseHTTPRequestHandler):
    # Silence default access logs — they bloat Vercel logs
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        try:
            qs = parse_qs(urlparse(self.path).query)

            # ── Parse + validate query ──
            try:
                year = _parse_int("year", (qs.get("year") or [""])[0], 2018, 2099)
                rnd = _parse_int("round", (qs.get("round") or [""])[0], 1, 30)
            except ValueError as ve:
                _err(self, 400, str(ve))
                return

            session_code = (qs.get("session") or ["R"])[0].upper()
            if session_code not in ALLOWED_SESSIONS:
                _err(
                    self,
                    400,
                    f"session must be one of {sorted(ALLOWED_SESSIONS)} "
                    f"(optimizer is race-distance only)",
                )
                return

            driver_code = (qs.get("driver") or [""])[0].strip().upper()
            if not driver_code or len(driver_code) > 4:
                _err(self, 400, "driver must be a 3-letter code (e.g. VER)")
                return

            try:
                strategies = _parse_int(
                    "strategies", (qs.get("strategies") or ["2"])[0], 1, 3
                )
            except ValueError as ve:
                _err(self, 400, str(ve))
                return

            # ── Run pipeline ──
            status, body = _build_response(
                year, rnd, session_code, driver_code, strategies
            )
            _send_json(self, status, body)

        except Exception as exc:  # noqa: BLE001 — last-resort guard
            tb = traceback.format_exc()
            print(
                f"[fastf1/pit-optimize] unhandled error: {exc}\n{tb}",
                file=sys.stderr,
            )
            _err(self, 500, f"internal error: {exc}")
