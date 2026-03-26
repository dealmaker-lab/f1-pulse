export const F1_TABLES = [
  "races",
  "results",
  "driver_standings",
  "constructor_standings",
  "laps",
  "stints",
  "weather",
  "positions",
] as const;

export type F1Table = (typeof F1_TABLES)[number];

// Schema description for NL2SQL -- keeps the LLM informed about table structure
export const DB_SCHEMA = `
You have access to a PostgreSQL database with the following F1 racing data tables:

TABLE: races
- id SERIAL PRIMARY KEY
- year INT NOT NULL
- round INT NOT NULL
- name TEXT NOT NULL (e.g., "Australian Grand Prix")
- circuit_id TEXT NOT NULL (e.g., "albert_park")
- circuit_name TEXT (e.g., "Albert Park Grand Prix Circuit")
- country TEXT NOT NULL
- locality TEXT
- date DATE NOT NULL
- total_laps INT
- circuit_length_km NUMERIC(5,3)
- UNIQUE(year, round)

TABLE: results
- id SERIAL PRIMARY KEY
- year INT NOT NULL
- round INT NOT NULL
- position INT
- driver_code TEXT NOT NULL (e.g., "VER", "HAM", "NOR")
- driver_id TEXT NOT NULL (e.g., "max_verstappen")
- driver_name TEXT NOT NULL
- constructor TEXT NOT NULL (e.g., "Red Bull", "Mercedes")
- grid_position INT
- laps_completed INT
- status TEXT (e.g., "Finished", "+1 Lap", "Retired")
- time_text TEXT (e.g., "1:34:12.345", "+5.678")
- points NUMERIC(5,2)
- fastest_lap_rank INT
- fastest_lap_time TEXT
- UNIQUE(year, round, driver_id)

TABLE: driver_standings
- id SERIAL PRIMARY KEY
- year INT NOT NULL
- round INT NOT NULL (standings after this round)
- position INT NOT NULL
- driver_code TEXT NOT NULL
- driver_id TEXT NOT NULL
- driver_name TEXT NOT NULL
- constructor TEXT NOT NULL
- points NUMERIC(6,2) NOT NULL
- wins INT NOT NULL DEFAULT 0
- UNIQUE(year, round, driver_id)

TABLE: constructor_standings
- id SERIAL PRIMARY KEY
- year INT NOT NULL
- round INT NOT NULL
- position INT NOT NULL
- constructor TEXT NOT NULL
- constructor_id TEXT NOT NULL
- points NUMERIC(6,2) NOT NULL
- wins INT NOT NULL DEFAULT 0
- UNIQUE(year, round, constructor_id)

TABLE: laps
- id SERIAL PRIMARY KEY
- year INT NOT NULL
- round INT NOT NULL
- session_type TEXT NOT NULL DEFAULT 'R' (R=Race, Q=Qualifying, S=Sprint, FP1/FP2/FP3)
- driver_code TEXT NOT NULL
- driver_number INT
- lap_number INT NOT NULL
- lap_time_seconds NUMERIC(8,3) (lap time in seconds, e.g., 82.456)
- sector1_seconds NUMERIC(7,3)
- sector2_seconds NUMERIC(7,3)
- sector3_seconds NUMERIC(7,3)
- compound TEXT (SOFT, MEDIUM, HARD, INTERMEDIATE, WET)
- tire_life INT (laps on current set)
- position INT
- gap_to_leader_seconds NUMERIC(8,3)
- is_pit BOOLEAN DEFAULT FALSE
- is_personal_best BOOLEAN DEFAULT FALSE
- speed_trap_kmh NUMERIC(6,1)
- UNIQUE(year, round, session_type, driver_code, lap_number)

TABLE: stints
- id SERIAL PRIMARY KEY
- year INT NOT NULL
- round INT NOT NULL
- session_key INT
- driver_code TEXT NOT NULL
- driver_number INT
- stint_number INT NOT NULL
- compound TEXT NOT NULL
- tire_age_at_start INT DEFAULT 0
- lap_start INT NOT NULL
- lap_end INT NOT NULL
- UNIQUE(year, round, driver_code, stint_number)

TABLE: weather
- id SERIAL PRIMARY KEY
- year INT NOT NULL
- round INT NOT NULL
- session_key INT
- timestamp TIMESTAMPTZ
- air_temperature NUMERIC(5,1)
- track_temperature NUMERIC(5,1)
- humidity NUMERIC(5,1)
- wind_speed NUMERIC(5,1)
- wind_direction INT
- rainfall BOOLEAN DEFAULT FALSE
- pressure NUMERIC(7,1)

TABLE: positions
- id SERIAL PRIMARY KEY
- year INT NOT NULL
- round INT NOT NULL
- session_key INT
- driver_code TEXT NOT NULL
- driver_number INT
- date TIMESTAMPTZ
- position INT NOT NULL

Common queries users might ask:
- "Compare Hamilton vs Verstappen lap times at Monza 2025" -> JOIN laps for both drivers where round matches Monza
- "Average lap times by compound" -> GROUP BY compound with AVG(lap_time_seconds)
- "Races with rain in 2025" -> JOIN weather WHERE rainfall = true
- "Fastest pit stop at Silverstone" -> Look at stints table gaps or consecutive lap times
- "Championship standings after round 5" -> driver_standings WHERE round = 5
- "Which driver had the most wins in 2025" -> results WHERE position = 1 GROUP BY driver_code

IMPORTANT NOTES:
- Always use the races table to resolve circuit names to (year, round) pairs
- Driver codes are 3 letters uppercase: VER, HAM, NOR, LEC, PIA, RUS, SAI, ALO, GAS, TSU, etc.
- lap_time_seconds is in seconds (e.g., 82.456 for 1:22.456)
- To format as M:SS.mmm: floor(seconds/60) || ':' || to_char(seconds % 60, 'FM00.000')
- Use ILIKE for fuzzy matching on circuit/driver names
- Always LIMIT results to 50 unless the user asks for more
- For "latest" or "current" standings, use the MAX(round) for that year
`;
