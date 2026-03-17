export default async function globalTeardown() {
  const pid = process.env.__LIGHTPANDA_PID;
  if (pid) {
    try {
      process.kill(parseInt(pid), "SIGTERM");
      console.log(`✓ Lightpanda stopped (PID: ${pid})`);
    } catch {}
  }
}
