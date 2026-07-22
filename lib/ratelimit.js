// Best-effort per-IP rate limiting for the unauthenticated, side-effect-heavy
// API endpoints. /api/login sends email and calls the Polar API; /api/checkout
// creates a Polar checkout — an unthrottled caller could spam a customer with
// magic-link emails or burn Polar quota. There is no dedicated database, so:
//   • when Vercel KV / Upstash REST is configured (KV_REST_API_URL + _TOKEN)
//     we use an atomic fixed-window counter (INCR + EXPIRE on the first hit) —
//     the real, cross-instance limiter;
//   • otherwise we fall back to a per-instance in-memory window — a weak
//     backstop that still blunts a burst against one warm lambda.
// FAIL-OPEN by design: if the caller can't be attributed (no IP) or KV errors,
// the request is allowed — a working payment / sign-in beats a hard block.
// CommonJS, dependency-free.

function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.headers && req.headers['x-real-ip']) || (req.socket && req.socket.remoteAddress) || null;
}

const globalMem = new Map(); // "bucket:ip" -> { count, reset }

function memHit(store, key, limit, windowSec, now) {
  const e = store.get(key);
  if (!e || now >= e.reset) { store.set(key, { count: 1, reset: now + windowSec * 1000 }); return { ok: true }; }
  e.count += 1;
  if (e.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
  return { ok: true };
}

function prune(store, now) {
  if (store.size < 5000) return;
  for (const [k, v] of store) if (now >= v.reset) store.delete(k);
}

async function kvHit(key, limit, windowSec) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const k = `rl:${key}`;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const r = await fetch(`${url}/incr/${encodeURIComponent(k)}`, { headers });
    const body = await r.json().catch(() => null);
    const n = Number(body && body.result);
    if (!Number.isFinite(n)) return null;                    // odd response → fail-open
    if (n === 1) await fetch(`${url}/expire/${encodeURIComponent(k)}/${windowSec}`, { headers });
    if (n > limit) return { ok: false, retryAfter: windowSec };
    return { ok: true };
  } catch (e) {
    console.error('ratelimit kv error', e.message);
    return null;                                             // fail-open on KV error
  }
}

// Returns { ok:true } or { ok:false, retryAfter }. `bucket` namespaces the
// limit per endpoint so counters don't collide.
async function rateLimit(req, { bucket, limit, windowSec }) {
  const ip = clientIp(req);
  if (!ip) return { ok: true };                              // can't attribute → allow
  const key = `${bucket}:${ip}`;
  const kv = await kvHit(key, limit, windowSec);
  if (kv) return kv;                                         // KV authoritative when configured
  const now = Date.now();
  prune(globalMem, now);
  return memHit(globalMem, key, limit, windowSec, now);      // weak per-instance backstop
}

// Send a 429 with Retry-After. Small helper so every endpoint does it the same.
function tooMany(res, json, retryAfter) {
  if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
  return json(res, 429, { ok: false, error: 'rate_limited' });
}

module.exports = { clientIp, memHit, rateLimit, tooMany };
