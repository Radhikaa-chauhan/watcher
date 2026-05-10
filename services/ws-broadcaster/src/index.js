import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from 'jsonwebtoken';
const { verify } = jwt;
import Redis from "ioredis";
import { URL } from "url";

const JWT_SECRET = process.env.JWT_SECRET ?? "changeme";
const PORT = process.env.PORT ?? 3003;

// Separate Redis client for blocking XREAD
const redisSub = new Redis(process.env.REDIS_URL);

// Connected dashboard clients: Set<WebSocket>
const clients = new Set();

// ─── HTTP Server (for health check) ──────────────────────────────────────────
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", clients: clients.size }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  // Parse JWT from ?token= query param
  let token;
  try {
    const url = new URL(req.url, `http://localhost`);
    token = url.searchParams.get("token");
  } catch (_) {}

  if (!token) {
    ws.close(4001, "Missing token");
    return;
  }

  try {
    verify(token, JWT_SECRET);
  } catch (e) {
    ws.close(4003, "Invalid token");
    return;
  }

  clients.add(ws);
  console.log(`[ws-broadcaster] Client connected (total: ${clients.size})`);

  // Send welcome + current client count
  ws.send(JSON.stringify({ type: "connected", clientCount: clients.size }));

  // Heartbeat
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[ws-broadcaster] Client disconnected (total: ${clients.size})`);
  });

  ws.on("error", (err) => {
    console.error("[ws-broadcaster] WS error:", err.message);
    clients.delete(ws);
  });
});

// Ping all clients every 30s to detect stale connections
const heartbeat = setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

wss.on("close", () => clearInterval(heartbeat));

// ─── Broadcast helper ─────────────────────────────────────────────────────────
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ─── Redis Streams consumer ───────────────────────────────────────────────────
const STREAMS = ["events:pr", "events:decisions", "events:actions"];

// Track last-read IDs per stream
const lastIds = Object.fromEntries(STREAMS.map(s => [s, "$"]));

async function consumeStreams() {
  console.log("[ws-broadcaster] Listening on streams:", STREAMS.join(", "));

  while (true) {
    try {
      // Build XREAD args: STREAMS stream1 stream2 ... id1 id2 ...
      const streamArgs = [...STREAMS, ...STREAMS.map(s => lastIds[s])];

      const results = await redisSub.xread(
        "COUNT", "50",
        "BLOCK", "2000",
        "STREAMS", ...streamArgs
      );

      if (!results) continue;

      for (const [streamName, messages] of results) {
        for (const [msgId, fields] of messages) {
          // fields is alternating key/value array from ioredis
          const type = fields[fields.indexOf("type") + 1];
          const data = fields[fields.indexOf("data") + 1];

          let parsed;
          try { parsed = JSON.parse(data); } catch (_) { parsed = {}; }

          broadcast({ stream: streamName, type, data: parsed, ts: Date.now() });
          lastIds[streamName] = msgId;
        }
      }
    } catch (err) {
      console.error("[ws-broadcaster] Stream read error:", err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[ws-broadcaster] Listening on :${PORT}`);
  consumeStreams().catch(err => { console.error(err); process.exit(1); });
});
