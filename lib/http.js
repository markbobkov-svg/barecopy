// Small request/response helpers shared by the /api functions (CommonJS —
// Barecopy has no build step and no "type":"module", so functions are CJS,
// matching api/contact.js). No file data ever passes through these.

// The app's canonical origin. Deliberately NOT derived from request headers:
// Host / X-Forwarded-Host are client-controllable, and originOf() feeds the
// magic-link URL (api/login.js) and the checkout success_url / embed_origin
// (api/checkout.js). Trusting the header there is a host-header-injection /
// magic-link-poisoning vector (an attacker requests a sign-in link for a
// victim, spoofs the host, and the emailed link points at the attacker's host
// while carrying a valid token). Override for preview/staging via APP_ORIGIN.
const APP_ORIGIN = process.env.APP_ORIGIN || 'https://www.barecopy.com';
function originOf() {
  return APP_ORIGIN;
}

// Read + JSON-parse the request body, capped. Vercel's Node runtime usually
// pre-parses JSON into req.body; fall back to reading the stream otherwise.
// Every caller handles only tiny JSON ({ email }), so an oversized body is
// abuse: cap it and treat it as empty ({}), which the endpoints' own validation
// then rejects with a 400.
async function readBody(req, maxBytes = 256 * 1024) {
  if (req.body != null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    return req.body;
  }
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > maxBytes) return {};           // oversize → empty → validation 400s
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function redirect(res, path) {
  res.statusCode = 302;
  res.setHeader('Location', path);
  res.end();
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

module.exports = { APP_ORIGIN, originOf, readBody, redirect, json };
