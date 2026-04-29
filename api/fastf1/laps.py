"""
GET /api/fastf1/laps?year=2025&round=10&session=R

Returns enriched lap data for a session: lap times, positions, sectors,
compound, stint number, pit info — denormalized rows from the FastF1 laps
DataFrame as JSON.

Response shape:
{
  "year": 2025,
  "round": 10,
  "event": "British Grand Prix",
  "circuit": "Silverstone",
  "session": "Race",
  "drivers": [
    { "code": "VER", "team": "Red Bull", "number": 1 },
    ...
  ],
  "laps": [
    {
      "driver": "VER",
      "lap_number": 1,
      "lap_time": 92.345,
      "sector_1": 28.123,
      "sector_2": 31.901,
      "sector_3": 32.321,
      "compound": "MEDIUM",
      "tyre_life": 1,
      "fresh_tyre": true,
      "stint": 1,
      "position": 1,
      "is_pit_in": false,
      "is_pit_out": false,
      "pit_in_time": null,
      "pit_out_time": null,
      "track_status": "1",
      "is_personal_best": false
    },
    ...
  ]
}
"""
from http.server import BaseHTTPRequestHandler
import json
import math
import os
import sys
import traceback
from urllib.parse import urlparse, parse_qs

import pandas as pd

CACHE_DIR = "/tmp/fastf1-cache"
os.makedirs(CACHE_DIR, exist_ok=True)

import fastf1
from fastf1 import logger as ff1_logger

fastf1.Cache.enable_cache(CACHE_DIR)
try:
    ff1_logger.set_log_level("WARNING")
except Exception:
    pass

ALLOWED_SESSIONS = {"FP1", "FP2", "FP3", "Q", "SQ", "S", "R"}


def _send_json(handler, status: int, body: dict) -> None:
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


def _err(handler, status: int, message: str, **extra) -> None:
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


def _td_seconds(value) -> float | None:
    """Convert pandas Timedelta or NaT to float seconds (or None)."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    if hasattr(value, "total_seconds"):
        return float(value.total_seconds())
    return None


def _safe_str(value) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if pd.isna(value):
        return None
    return str(value)


def _safe_int(value) -> int | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if pd.isna(value):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _safe_bool(value) -> bool | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    return bool(value)


class handler(BaseHTTPRequestHandler):
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
                    f"session must be one of {sorted(ALLOWED_SESSIONS)}",
                )
                return

            try:
                session = fastf1.get_session(year, rnd, session_code)
                session.load(laps=True, telemetry=False, weather=False, messages=False)
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

            laps_df = session.laps
            if laps_df is None or len(laps_df) == 0:
                _err(self, 404, "no laps in session")
                return

            # Build the driver list from the session results / drivers info
            drivers_payload: list[dict] = []
            try:
                results = session.results
                if results is not None and len(results) > 0:
                    for _, row in results.iterrows():
                        drivers_payload.append({
                            "code": _safe_str(row.get("Abbreviation")) or "",
                            "team": _safe_str(row.get("TeamName")) or "",
                            "number": _safe_int(row.get("DriverNumber")),
                            "full_name": _safe_str(row.get("FullName")) or "",
                        })
            except Exception:
                # Fallback: derive from laps
                seen: set[str] = set()
                for _, row in laps_df.iterrows():
                    code = _safe_str(row.get("Driver")) or ""
                    if code and code not in seen:
                        seen.add(code)
                        drivers_payload.append({
                            "code": code,
                            "team": _safe_str(row.get("Team")) or "",
                            "number": _safe_int(row.get("DriverNumber")),
                            "full_name": "",
                        })

            laps_payload: list[dict] = []
            for _, row in laps_df.iterrows():
                laps_payload.append({
                    "driver": _safe_str(row.get("Driver")) or "",
                    "driver_number": _safe_int(row.get("DriverNumber")),
                    "team": _safe_str(row.get("Team")) or "",
                    "lap_number": _safe_int(row.get("LapNumber")),
                    "lap_time": _td_seconds(row.get("LapTime")),
                    "sector_1": _td_seconds(row.get("Sector1Time")),
                    "sector_2": _td_seconds(row.get("Sector2Time")),
                    "sector_3": _td_seconds(row.get("Sector3Time")),
                    "speed_i1": _safe_int(row.get("SpeedI1")),
                    "speed_i2": _safe_int(row.get("SpeedI2")),
                    "speed_fl": _safe_int(row.get("SpeedFL")),
                    "speed_st": _safe_int(row.get("SpeedST")),
                    "compound": (_safe_str(row.get("Compound")) or "UNKNOWN").upper(),
                    "tyre_life": _safe_int(row.get("TyreLife")),
                    "fresh_tyre": _safe_bool(row.get("FreshTyre")),
                    "stint": _safe_int(row.get("Stint")),
                    "position": _safe_int(row.get("Position")),
                    "is_pit_in": _td_seconds(row.get("PitInTime")) is not None,
                    "is_pit_out": _td_seconds(row.get("PitOutTime")) is not None,
                    "pit_in_time": _td_seconds(row.get("PitInTime")),
                    "pit_out_time": _td_seconds(row.get("PitOutTime")),
                    "track_status": _safe_str(row.get("TrackStatus")),
                    "is_personal_best": _safe_bool(row.get("IsPersonalBest")),
                    "deleted": _safe_bool(row.get("Deleted")),
                })

            event = getattr(session, "event", None)
            event_name = (event.get("EventName") if event is not None else "") or ""
            circuit = (event.get("Location") if event is not None else "") or ""

            body = {
                "year": year,
                "round": rnd,
                "event": str(event_name),
                "circuit": str(circuit),
                "session": session.name if hasattr(session, "name") else session_code,
                "drivers": drivers_payload,
                "laps": laps_payload,
                "n_laps": len(laps_payload),
            }
            _send_json(self, 200, body)

        except Exception as exc:  # noqa: BLE001
            tb = traceback.format_exc()
            print(f"[fastf1/laps] unhandled error: {exc}\n{tb}", file=sys.stderr)
            _err(self, 500, f"internal error: {exc}")
