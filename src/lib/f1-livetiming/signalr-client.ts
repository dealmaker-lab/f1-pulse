/**
 * Minimal SignalR (ASP.NET classic, protocol 1.5) client for F1 Live Timing.
 *
 * BRITTLE / EXPERIMENTAL — read this before changing anything.
 * ----------------------------------------------------------------
 * F1's live timing service is NOT a public API. It is the same SignalR hub
 * that fastf1, the open-source F1TimingClient projects, and various
 * unofficial dashboards reverse-engineer. Microsoft retired classic SignalR
 * in favour of SignalR Core years ago, but F1 never migrated, so this code
 * speaks the legacy `clientProtocol=1.5` dialect on purpose.
 *
 * Things that have broken in the past and may break again at any time:
 *   - User-Agent sniffing — F1's edge sometimes 403s anything that looks
 *     like a browser or a default Node fetch. We send `BestHTTP/2 v2.10.0`
 *     because that string is what the official Unity client uses and is
 *     the most reliably allowed.
 *   - Cookies on /negotiate — F1 sometimes attaches a session cookie that
 *     must be replayed on the WebSocket upgrade. We forward any
 *     `set-cookie` from the negotiate response onto the WS handshake.
 *   - Hub method casing is case-sensitive on the server (`Subscribe`, not
 *     `subscribe`). If you change it you'll get a silent no-op with a
 *     `R` (return) frame containing `{}`.
 *   - The "feed" message envelope is `{"M":[{"H":"Streaming","M":"feed",
 *     "A":[topic, data, timestamp]}]}` — but during quiet periods the
 *     server also sends keepalive `{}` frames and `{"C": "...","S":1}`
 *     init frames. We silently ignore both.
 *   - Outside of a live session window the hub returns near-empty data
 *     (just `Heartbeat`). That's not a bug; there's just nothing to push.
 *
 * If F1 changes ANY of: the negotiate URL, the protocol version, the hub
 * name (`Streaming`), the subscribe method, or the message envelope —
 * this client will fail. Catch errors loudly and surface them; do not
 * try to be clever about retries inside this file.
 *
 * Dependencies: only `ws` (Node WebSocket client). No `@microsoft/signalr`.
 */

import WebSocket from "ws";

// `ws` exports RawData as a namespace member (`WebSocket.RawData`), not a
// top-level named export. Re-alias here so we can use it as a normal type.
type RawData = WebSocket.RawData;

export interface SignalROptions {
  /** Base hub URL, e.g. `https://livetiming.formula1.com/signalr`. No trailing slash. */
  hubUrl: string;
  /** Hub name registered on the server. F1 uses `Streaming`. */
  hub: string;
  /** Topic names to subscribe to once connected. */
  topics: string[];
  /** Called for each `feed` message. `data` is whatever the server sent — be defensive. */
  onMessage: (topic: string, data: unknown) => void;
  /** Called when the underlying transport errors. */
  onError?: (err: Error) => void;
  /** Called once the WebSocket has closed (cleanly or otherwise). */
  onClose?: () => void;
  /** Override the User-Agent. Default: `BestHTTP/2 v2.10.0`. */
  userAgent?: string;
}

interface NegotiateResponse {
  /** Token we replay on the WS upgrade. */
  ConnectionToken: string;
  /** Server-assigned id for diagnostics. */
  ConnectionId?: string;
  /** Protocol version echoed back. We never read this but log it on mismatch. */
  ProtocolVersion?: string;
}

interface SignalREnvelope {
  /** Init frame: `{C, S, M: []}`. Marks transport ready. */
  S?: number;
  /** Cursor — opaque, must be echoed if we ever reconnect (we don't yet). */
  C?: string;
  /** Hub messages array. */
  M?: Array<{
    /** Hub name. */
    H?: string;
    /** Method name on the client side ("feed" for F1 push). */
    M?: string;
    /** Method args. F1 packs `[topic, data, timestamp]`. */
    A?: unknown[];
  }>;
  /** Result of a method invocation we made (e.g. Subscribe). */
  R?: unknown;
  /** Invocation id we echoed. */
  I?: string;
  /** Error message from the hub. */
  E?: string;
}

const DEFAULT_USER_AGENT = "BestHTTP/2 v2.10.0";
const CLIENT_PROTOCOL = "1.5";

export class F1SignalRClient {
  private ws: WebSocket | null = null;
  private connectionToken: string | null = null;
  private cookies: string | null = null;
  private readonly opts: SignalROptions;
  private closed = false;

  constructor(opts: SignalROptions) {
    if (!opts.hubUrl) throw new Error("F1SignalRClient: hubUrl is required");
    if (!opts.hub) throw new Error("F1SignalRClient: hub is required");
    if (!Array.isArray(opts.topics) || opts.topics.length === 0) {
      throw new Error("F1SignalRClient: topics must be a non-empty array");
    }
    this.opts = opts;
  }

  /**
   * Run the negotiate handshake, open the WebSocket, send Subscribe.
   * Resolves once the WS is open AND the subscribe frame has been written
   * (we don't wait for the server's `R` ack — F1 never sends a meaningful
   * one, and waiting just adds latency).
   */
  async connect(): Promise<void> {
    if (this.closed) throw new Error("F1SignalRClient: already closed");
    if (this.ws) throw new Error("F1SignalRClient: already connected");

    await this.negotiate();
    await this.openWebSocket();
    this.subscribe();
  }

  /** Cleanly close the WebSocket. Idempotent. */
  close(): void {
    this.closed = true;
    if (this.ws) {
      try {
        // 1000 = normal closure. ws will fire `close` regardless.
        this.ws.close(1000, "client close");
      } catch {
        /* swallow — we're tearing down anyway */
      }
      this.ws = null;
    }
  }

  // -- internals --------------------------------------------------------

  private async negotiate(): Promise<void> {
    const url = new URL(`${this.opts.hubUrl}/negotiate`);
    url.searchParams.set("clientProtocol", CLIENT_PROTOCOL);
    url.searchParams.set(
      "connectionData",
      JSON.stringify([{ name: this.opts.hub }]),
    );

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": this.opts.userAgent ?? DEFAULT_USER_AGENT,
        Accept: "*/*",
      },
      // We're server-side. No CORS, no credentials magic.
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(
        `F1 negotiate failed: HTTP ${res.status} ${res.statusText}`,
      );
    }

    // Forward set-cookie onto the WS upgrade if F1 sent one. The Headers
    // API exposes a single concatenated value via .get('set-cookie');
    // that's fine for replay since we're not parsing them.
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookies = setCookie;

    let body: NegotiateResponse;
    try {
      body = (await res.json()) as NegotiateResponse;
    } catch (err) {
      throw new Error(
        `F1 negotiate returned non-JSON body: ${(err as Error).message}`,
      );
    }

    if (!body.ConnectionToken) {
      throw new Error(
        "F1 negotiate response missing ConnectionToken — schema may have changed",
      );
    }
    if (body.ProtocolVersion && body.ProtocolVersion !== CLIENT_PROTOCOL) {
      // Not fatal — the server sometimes echoes a slightly different
      // version while still speaking 1.5. Log so we notice on rollouts.
      console.warn(
        `[f1-signalr] server ProtocolVersion=${body.ProtocolVersion} client=${CLIENT_PROTOCOL}`,
      );
    }

    this.connectionToken = body.ConnectionToken;
  }

  private openWebSocket(): Promise<void> {
    if (!this.connectionToken) {
      throw new Error("openWebSocket called before negotiate");
    }

    // Swap https -> wss, http -> ws. URL constructor doesn't let us change
    // protocol on a parsed URL, so do it as a string substitution.
    const wsBase = this.opts.hubUrl.replace(/^http/i, "ws");
    const wsUrl = new URL(`${wsBase}/connect`);
    wsUrl.searchParams.set("transport", "webSockets");
    wsUrl.searchParams.set("clientProtocol", CLIENT_PROTOCOL);
    wsUrl.searchParams.set("connectionToken", this.connectionToken);
    wsUrl.searchParams.set(
      "connectionData",
      JSON.stringify([{ name: this.opts.hub }]),
    );

    const headers: Record<string, string> = {
      "User-Agent": this.opts.userAgent ?? DEFAULT_USER_AGENT,
      Accept: "*/*",
    };
    if (this.cookies) headers.Cookie = this.cookies;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl.toString(), { headers });
      this.ws = ws;

      let opened = false;

      ws.once("open", () => {
        opened = true;
        resolve();
      });

      ws.on("message", (raw) => this.handleRaw(raw));

      ws.on("error", (err) => {
        if (!opened) reject(err);
        this.opts.onError?.(err);
      });

      ws.on("close", () => {
        this.ws = null;
        this.opts.onClose?.();
      });
    });
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("subscribe called before WS open");
    }
    // Wire format: SignalR 1.x hub invocation.
    //   H = hub name, M = method, A = arg array, I = invocation id.
    // F1 expects ONE arg: an array of topic strings, hence the double-array.
    const frame = JSON.stringify({
      H: this.opts.hub,
      M: "Subscribe",
      A: [this.opts.topics],
      I: 1,
    });
    this.ws.send(frame);
  }

  private handleRaw(raw: RawData): void {
    // ws can hand us Buffer, ArrayBuffer, or Buffer[] (fragmented). We
    // only care about text frames, but normalise defensively.
    let text: string;
    if (typeof raw === "string") {
      text = raw;
    } else if (Buffer.isBuffer(raw)) {
      text = raw.toString("utf8");
    } else if (Array.isArray(raw)) {
      text = Buffer.concat(raw).toString("utf8");
    } else {
      text = Buffer.from(raw).toString("utf8");
    }

    // Empty keepalive frames are literally `{}` — skip the parse cost.
    if (text === "{}") return;

    let env: SignalREnvelope;
    try {
      env = JSON.parse(text) as SignalREnvelope;
    } catch (err) {
      console.warn(
        `[f1-signalr] non-JSON frame ignored (${(err as Error).message}): ${text.slice(0, 120)}`,
      );
      return;
    }

    if (env.E) {
      this.opts.onError?.(new Error(`F1 hub error: ${env.E}`));
      return;
    }

    // Init frame `{C, S:1, M:[]}` — nothing to do.
    if (env.S === 1 && (!env.M || env.M.length === 0)) return;

    if (!Array.isArray(env.M)) return;

    for (const m of env.M) {
      if (m?.M !== "feed") continue;
      const args = m.A;
      if (!Array.isArray(args) || args.length < 2) {
        console.warn(
          "[f1-signalr] feed message with unexpected arg shape:",
          args,
        );
        continue;
      }
      const topic = args[0];
      const data = args[1];
      if (typeof topic !== "string") {
        console.warn("[f1-signalr] feed topic was not a string:", topic);
        continue;
      }
      try {
        this.opts.onMessage(topic, data);
      } catch (err) {
        // Never let a consumer's exception kill our message loop.
        this.opts.onError?.(err as Error);
      }
    }
  }
}
