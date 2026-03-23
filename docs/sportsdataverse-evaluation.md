# SportsDataverse Evaluation for F1 Pulse

## Executive Summary

SportsDataverse does **not** have a dedicated Formula 1 module. The ecosystem (sportsdatapy, sportypy, etc.) focuses on North American sports: NFL, NBA, CFB, CBB, MLB, NHL, MLS. There is no F1 data coverage, making direct integration infeasible.

However, the evaluation identified several alternative data sources that could complement F1 Pulse's existing OpenF1 + Jolpica/Ergast stack.

## Current F1 Pulse Data Stack

| Source | Coverage | Data Types |
|--------|----------|------------|
| **OpenF1 API** | 2023-present | Telemetry (3.7Hz), positions, intervals, stints, weather, radio |
| **Jolpica/Ergast API** | 1950-present | Standings, race results, qualifying, historical data |

## Alternative F1 Data Sources Evaluated

### 1. FastF1 (Python library)
- **URL:** https://docs.fastf1.dev/
- **Coverage:** Official F1 timing data, telemetry, session results
- **Strengths:** Deep telemetry analysis, tire degradation modeling, sector-level timing
- **Gap it fills:** Advanced statistical models (tire degradation curves, expected positions)
- **Integration complexity:** HIGH — requires Python backend (Edge Function or separate API service)
- **Recommendation:** Best candidate for advanced analytics features

### 2. f1api.dev
- **URL:** https://f1api.dev/
- **Coverage:** Historical F1 data (all seasons)
- **Strengths:** Free, open-source, REST API
- **Gap it fills:** Backup/alternative to Jolpica for historical data
- **Integration complexity:** LOW — REST API, same as existing pattern
- **Recommendation:** Consider as Jolpica fallback

### 3. Sportradar Formula 1 v2
- **URL:** https://developer.sportradar.com/docs/read/racing/Formula_1_v2
- **Coverage:** Full championship, lap-by-lap updates
- **Strengths:** Professional-grade data, betting odds
- **Gap it fills:** Predictive models, odds-based analytics
- **Integration complexity:** MEDIUM — paid API with authentication
- **Recommendation:** Only if betting/prediction features become priority

### 4. API-Sports Formula 1
- **URL:** https://api-sports.io/documentation/formula-1/v1
- **Coverage:** Seasons, standings, teams, races
- **Strengths:** Consistent API design, well-documented
- **Gap it fills:** Similar to Jolpica, no unique advantage
- **Integration complexity:** LOW
- **Recommendation:** Skip — no unique data over existing sources

## Gap Analysis: What F1 Pulse is Missing

| Feature | Available in Current Stack? | Best Source |
|---------|---------------------------|-------------|
| Tire degradation curves | Partial (stints data) | FastF1 |
| Expected positions model | No | FastF1 / custom model |
| Gap analysis (time delta evolution) | Yes (intervals API) | OpenF1 |
| Weather impact correlation | Partial | OpenF1 weather + custom analysis |
| Qualifying vs race pace comparison | Partial (results) | Jolpica results + OpenF1 laps |
| Historical trends (10+ years) | Yes | Jolpica |
| Real-time telemetry visualization | Yes | OpenF1 |
| Pit window optimization | No | FastF1 + custom model |
| DRS effectiveness analysis | No | OpenF1 car-data (DRS flag) |
| Championship probability models | No | Custom model / Sportradar |

## Prototype Integration Plan

### Phase A: FastF1 Edge Function (recommended next step)
1. Create a Supabase Edge Function or Vercel serverless function with Python runtime
2. Use FastF1 to compute:
   - Tire degradation curves (lap time vs tire age, per compound)
   - Pace comparison (qualifying vs race pace delta)
   - Sector-level driver comparison
3. Cache results in Supabase to avoid re-computation
4. Expose via `/api/f1/analytics/*` endpoints
5. Integrate into NL2SQL chat tools

### Phase B: Predictive Models
1. Build championship probability model using historical results + current standings
2. Race outcome prediction using qualifying position + historical circuit data
3. Pit window calculator using degradation curves

### Phase C: f1api.dev Fallback
1. Add f1api.dev as secondary source for historical data
2. Automatic failover if Jolpica is down
3. Cross-validate data between sources

## Recommendation

**Skip SportsDataverse** — it has no F1 data.

**Invest in FastF1** — it's the most valuable complementary data source for F1 Pulse. The Python dependency adds complexity (separate service or Edge Function with Python runtime), but the advanced analytics capabilities (tire degradation, expected positions, sector analysis) would significantly differentiate F1 Pulse from generic F1 dashboards.

Start with Phase A (FastF1 Edge Function) in a future sprint. The NL2SQL chat interface is already architected to support additional tools — adding FastF1-backed tools would be straightforward.
