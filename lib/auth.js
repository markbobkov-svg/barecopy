// Stateless auth: HS256 JWT in an httpOnly cookie. No DB — the cookie IS the
// session, issued only after Polar verified an active subscription/payment.
// Dependency-free (node:crypto) so the Vercel functions stay cold-start light.
// CommonJS to match the rest of Barecopy's /api + /lib (no build step).
const crypto = require('node:crypto');

const COOKIE = 'bc_session';
const b64u = (b) => Buffer.from(b).toString('base64url');

function signJWT(payload, secret, expSec) {
  if (!secret) throw new Error('JWT secret missing');
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + expSec }));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyJWT(token, secret) {
  if (!token || !secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  // Constant-time compare; guard length first (timingSafeEqual throws on mismatch).
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try { body = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch { return null; }
  if (!body.exp || Math.floor(Date.now() / 1000) >= body.exp) return null;
  return body;
}

// Verify a SESSION cookie specifically. The same JWT_SECRET signs both the
// long-lived session cookie and the short-lived magic-link token (purpose:
// 'magic'); without this check a magic token would be accepted as a session by
// /api/me and /api/portal (a confused-deputy). Session tokens carry
// purpose:'session'; reject a token whose purpose is present AND not 'session'.
function verifySession(token, secret) {
  const body = verifyJWT(token, secret);
  if (!body) return null;
  if (body.purpose && body.purpose !== 'session') return null;
  return body;
}

function readCookie(req, name = COOKIE) {
  const header = (req.headers && req.headers.cookie) || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) {
      const raw = part.slice(i + 1).trim();
      // A malformed percent-encoding (a stray "%") makes decodeURIComponent throw
      // URIError. That must not 500 the endpoint (e.g. /api/me) — fall back to the
      // raw value; an invalid token then just fails verifyJWT → treated anonymous.
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
  }
  return null;
}

const sessionCookie = (token, maxAgeSec) =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;

module.exports = { COOKIE, signJWT, verifyJWT, verifySession, readCookie, sessionCookie };
