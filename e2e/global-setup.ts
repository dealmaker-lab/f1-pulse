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

function isPortInUse(port: number): boolean {
  try {
    execSync(`ss -tlnp | grep :${port}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  const port = parseInt(process.env.CDP_PORT || "9222");

  if (isPortInUse(port)) {
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
    "120",
  ]);

  // Store PID in global state for teardown
  process.env.__LIGHTPANDA_PID = String(proc.pid);

  // Wait for port to be in use (max 10 seconds)
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    if (isPortInUse(port)) {
      console.log(`✓ Lightpanda started (PID: ${proc.pid})`);
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error("Lightpanda failed to start within 10s");
}
