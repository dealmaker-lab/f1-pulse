"""
GET /api/fastf1/telemetry?year=2025&round=10&session=Q&drivers=VER,NOR&lap=fastest

Returns distance-aligned telemetry for up to 4 drivers on a chosen lap.

Response shape:
{
  "drivers": [
    {
      "code": "VER",
      "team": "Red Bull",
      "lap_time": 78.234,
      "compound": "SOFT",
      "lap_number": 18,
      "telemetry": [
        { "distance": 0.0, "speed": 320, "throttle": 100, "brake": 0, "gear": 8, "drs": 1 },
        ...
      ]
    },
    ...
  ],
  "circuit": "Silverstone",
  "session": "Qualifying",
  "event": "British Grand Prix",
  "year": 2025,
  "round": 10,
  "n_samples": 500
}

Errors:
  400 — bad/missing query parameter
  404 — session/driver/lap not found
  500 — FastF1 internal failure
  504 — upstream archive timeout
"""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import traceback
from urllib.parse import urlparse, parse_qs

import numpy as np

# FastF1 cache must live under /tmp on Vercel (read-only fs everywhere else)
CACHE_DIR = "/tmp/fastf1-cache"
os.makedirs(CACHE_DIR, exist_ok=True)

import fastf1
from fastf1 import logger as ff1_logger

fastf1.Cache.enable_cache(CACHE_DIR)
# Quiet the noisy FastF1 logger inside serverless logs
try:
    ff1_logger.set_log_level("WARNING")
except Exception:
    pass

# Allowed session identifiers (FastF1 nomenclature)
ALLOWED_SESSIONS = {"FP1", "FP2", "FP3", "Q", "SQ", "S", "R"}

# Number of evenly spaced samples we resample telemetry to before sending
N_SAMPLES = 500

# Hard cap on drivers per request (page is designed for up to 4 lines)
MAX_DRIVERS = 4


def _send_json(handler, status: int, body: dict) -> None:
    payload = json.dumps(body, allow_nan=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    # Cache for 1h on the edge — historical telemetry never changes
    handler.send_header(
        "Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400"
    )
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(payload)


def _err(handler, status: int, message: str, **extra) -> None:
    body = {"error": message, **extra}
    _send_json(handler, status, body)


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


def _resample_distance(distance: np.ndarray, *series: np.ndarray, n: int = N_SAMPLES):
    """
    Resample each `series` onto `n` evenly spaced distance points.

    `distance` must be monotonically non-decreasing. We drop duplicates first
    because numpy.interp wants strictly increasing x values.
    """
    if distance.size == 0:
        empty = np.zeros(0, dtype=float)
        return empty, [empty for _ in series]

    # Drop trailing duplicate distances (FastF1 sometimes emits these on stops)
    keep = np.concatenate(([True], np.diff(distance) > 1e-6))
    distance = distance[keep]
    series = [s[keep] for s in series]

    if distance.size < 2:
        # Not enough variance to resample — return raw single sample
        return distance, list(series)

    grid = np.linspace(distance[0], distance[-1], n)
    resampled = [np.interp(grid, distance, s) for s in series]
    return grid, resampled


def _build_driver_payload(session, code: str, lap_spec: str | int) -> dict:
    """
    Pull the requested lap for one driver and produce a JSON-safe dict.
    Raises ValueError for soft errors (driver/lap missing).
    """
    try:
        laps_for_driver = session.laps.pick_drivers(code)
    except Exception as exc:
        raise ValueError(f"driver {code!r} not found in session: {exc}") from exc

    if laps_for_driver is None or len(laps_for_driver) == 0:
        raise ValueError(f"driver {code!r} has no laps in session")

    if lap_spec == "fastest":
        lap = laps_for_driver.pick_fastest()
        if lap is None or (hasattr(lap, "empty") and lap.empty):
            raise ValueError(f"driver {code!r} has no fastest lap (no clean lap?)")
    else:
        # numeric lap number
        try:
            lap_num = int(lap_spec)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"lap must be 'fastest' or an integer") from exc
        match = laps_for_driver[laps_for_driver["LapNumber"] == lap_num]
        if len(match) == 0:
            raise ValueError(f"driver {code!r} has no lap #{lap_num}")
        lap = match.iloc[0]

    # Telemetry: car_data + position merged, with cumulative distance
    try:
        tel = lap.get_car_data().add_distance()
    except Exception as exc:
        raise ValueError(
            f"telemetry unavailable for {code!r} on this lap: {exc}"
        ) from exc

    if tel is None or len(tel) == 0:
        raise ValueError(f"empty telemetry for {code!r}")

    # Pull the columns we need; tolerate missing optional fields
    distance = tel["Distance"].to_numpy(dtype=float)
    speed = tel["Speed"].to_numpy(dtype=float)
    throttle = tel["Throttle"].to_numpy(dtype=float)
    brake = tel["Brake"].astype(float).to_numpy()  # bool -> 0/1
    gear = tel["nGear"].to_numpy(dtype=float)
    drs = tel["DRS"].to_numpy(dtype=float) if "DRS" in tel.columns else np.zeros_like(speed)

    grid, (s_speed, s_throttle, s_brake, s_gear, s_drs) = _resample_distance(
        distance, speed, throttle, brake, gear, drs
    )

    telemetry_points = [
        {
            "distance": round(float(grid[i]), 1),
            "speed": round(float(s_speed[i]), 1),
            "throttle": round(float(s_throttle[i]), 1),
            "brake": int(round(float(s_brake[i]))),
            "gear": int(round(float(s_gear[i]))),
            # FastF1 DRS codes: 10/12/14 = active. Treat anything >= 10 as on.
            "drs": 1 if float(s_drs[i]) >= 10 else 0,
        }
        for i in range(len(grid))
    ]

    # Lap metadata
    lap_time_td = lap.get("LapTime")
    lap_time_s = (
        float(lap_time_td.total_seconds()) if lap_time_td is not None and hasattr(lap_time_td, "total_seconds") else None
    )

    compound = lap.get("Compound") or "UNKNOWN"
    team = lap.get("Team") or ""
    lap_number = lap.get("LapNumber")
    lap_number_int = int(lap_number) if lap_number is not None else None

    return {
        "code": code,
        "team": str(team),
        "lap_time": lap_time_s,
        "compound": str(compound).upper() if compound else "UNKNOWN",
        "lap_number": lap_number_int,
        "telemetry": telemetry_points,
    }


class handler(BaseHTTPRequestHandler):
    # Silence default access logs — they bloat Vercel logs
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003 (override)
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

            session_code = (qs.get("session") or ["Q"])[0].upper()
            if session_code not in ALLOWED_SESSIONS:
                _err(
                    self,
                    400,
                    f"session must be one of {sorted(ALLOWED_SESSIONS)}",
                )
                return

            drivers_raw = (qs.get("drivers") or [""])[0]
            drivers = [d.strip().upper() for d in drivers_raw.split(",") if d.strip()]
            if not drivers:
                _err(self, 400, "at least one driver code is required")
                return
            if len(drivers) > MAX_DRIVERS:
                _err(
                    self,
                    400,
                    f"at most {MAX_DRIVERS} drivers per request (got {len(drivers)})",
                )
                return

            lap_raw = (qs.get("lap") or ["fastest"])[0]
            lap_spec: str | int
            if lap_raw.lower() == "fastest":
                lap_spec = "fastest"
            else:
                try:
                    lap_spec = _parse_int("lap", lap_raw, 1, 200)
                except ValueError as ve:
                    _err(self, 400, str(ve))
                    return

            # ── Load session ──
            try:
                session = fastf1.get_session(year, rnd, session_code)
                # Telemetry needs laps + telemetry; weather/messages off for speed
                session.load(laps=True, telemetry=True, weather=False, messages=False)
            except Exception as exc:
                msg = str(exc).lower()
                if "timeout" in msg or "timed out" in msg:
                    _err(self, 504, f"upstream timeout loading session: {exc}")
                    return
                if "not found" in msg or "does not exist" in msg or "no event" in msg:
                    _err(self, 404, f"session not found: {exc}")
                    return
                _err(self, 500, f"failed to load session: {exc}")
                return

            # ── Build driver payloads ──
            driver_payloads = []
            soft_errors: list[str] = []
            for code in drivers:
                try:
                    driver_payloads.append(_build_driver_payload(session, code, lap_spec))
                except ValueError as ve:
                    soft_errors.append(str(ve))
                    continue

            if not driver_payloads:
                _err(
                    self,
                    404,
                    "no telemetry available for any requested driver",
                    details=soft_errors,
                )
                return

            # ── Build response ──
            event = getattr(session, "event", None)
            event_name = (event.get("EventName") if event is not None else "") or ""
            circuit = (event.get("Location") if event is not None else "") or ""

            body = {
                "drivers": driver_payloads,
                "circuit": str(circuit),
                "event": str(event_name),
                "session": session.name if hasattr(session, "name") else session_code,
                "year": year,
                "round": rnd,
                "n_samples": N_SAMPLES,
                "warnings": soft_errors or None,
            }
            _send_json(self, 200, body)

        except Exception as exc:  # noqa: BLE001 — last-resort guard
            tb = traceback.format_exc()
            print(f"[fastf1/telemetry] unhandled error: {exc}\n{tb}", file=sys.stderr)
            _err(self, 500, f"internal error: {exc}")
