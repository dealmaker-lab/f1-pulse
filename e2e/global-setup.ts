import { execSync, spawn } from "child_process";
import { existsSync } from "fs";

function findLightpanda(): string {
  const candidates = [
    process.env.LIGHTPANDA_BIN,
    "/sessions/wizardly-vigilant-mendel/.local/bin/lightpanda",
    "/usr/local/bin/lightpanda",
    "lightpanda",
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      if (existsSync(bin) || execSync(`which ${bin} 2>/dev/null`).toString().trim()) {
        return bin;
      }
    } catch {}
  }

  throw new Error(
    "Lightpanda not found. Install with: curl -sSfL https://get.lightpanda.io | bash"
  );
}

/**
 * Probe the CDP HTTP endpoint directly. Portable (the previous `ss -tlnp`
 * check only exists on Linux, so on macOS a healthy server was never
 * detected and setup always timed out) and stricter — it confirms the CDP
 * server is actually answering, not just that something holds the port.
 */
async function isCdpReady(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  const port = parseInt(process.env.CDP_PORT || "9222");

  if (await isCdpReady(port)) {
    console.log(`✓ Lightpanda CDP already running on port ${port}`);
    return;
  }

  const bin = findLightpanda();
  console.log(
    `Starting Lightpanda CDP: ${bin} serve --host 127.0.0.1 --port ${port}`
  );

  const proc = spawn(bin, [
    "serve",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--timeout",
    "600",
  ]);

  // Store PID in global state for teardown
  process.env.__LIGHTPANDA_PID = String(proc.pid);

  // Wait for the CDP endpoint to answer (max 30 seconds — nightly builds
  // can take longer than 10s to boot cold)
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    if (await isCdpReady(port)) {
      console.log(`✓ Lightpanda started (PID: ${proc.pid})`);
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error("Lightpanda failed to start within 30s");
}
