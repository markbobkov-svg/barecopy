// /api/login — sign in on a new browser/device WITHOUT a license key.
//   POST { email }    → if that email has an active subscription, email a
//                       15-minute magic link
//   GET  ?token=<jwt> → verify the magic link, set the 30-day session cookie
// Never receives file data. Responds generically to avoid email enumeration.
const { findCustomerByEmail, hasActiveSubscription } = require('../lib/polar.js');
const { signJWT, verifyJWT, sessionCookie } = require('../lib/auth.js');
const { sendMagicLink, emailDisabled } = require('../lib/email.js');
const { originOf, readBody, redirect, json } = require('../lib/http.js');
const { rateLimit, tooMany } = require('../lib/ratelimit.js');

const THIRTY_DAYS = 30 * 24 * 3600;
const FIFTEEN_MIN = 15 * 60;

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = token ? verifyJWT(token, process.env.JWT_SECRET) : null;
    if (!payload || payload.purpose !== 'magic') return redirect(res, '/?signin=invalid');
    const session = signJWT(
      { customer_id: payload.customer_id, email: payload.email, tier: payload.tier || 'pro', purpose: 'session' },
      process.env.JWT_SECRET, THIRTY_DAYS,
    );
    res.setHeader('Set-Cookie', sessionCookie(session, THIRTY_DAYS));
    return redirect(res, '/?pro=1');
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  // Throttle: each POST can trigger a magic-link email to a real customer plus a
  // Polar lookup. Without a cap an attacker could spam a customer's inbox or
  // burn Polar quota. 5 per 10 min per IP is ample for a human.
  const rl = await rateLimit(req, { bucket: 'login', limit: 5, windowSec: 600 });
  if (!rl.ok) return tooMany(res, json, rl.retryAfter);

  // config-only flag — computed regardless of the email, so it can't leak sub status
  const disabled = emailDisabled();
  try {
    const body = await readBody(req);
    const email = String((body && body.email) || '').trim().toLowerCase();
    if (!email.includes('@')) return json(res, 400, { ok: false, error: 'invalid_email' });

    if (!disabled && process.env.JWT_SECRET) {
      const customer = await findCustomerByEmail(email);
      if (customer && await hasActiveSubscription(customer.id)) {
        const magic = signJWT({ customer_id: customer.id, email, tier: 'pro', purpose: 'magic' }, process.env.JWT_SECRET, FIFTEEN_MIN);
        const link = `${originOf(req)}/api/login?token=${encodeURIComponent(magic)}`;
        await sendMagicLink(email, link);
      }
    }
    // Always generic — never reveal whether the email has a subscription.
    return json(res, 200, { ok: true, emailDisabled: disabled });
  } catch (e) {
    console.error('login error', e.message, e.data || '');
    return json(res, 200, { ok: true, emailDisabled: disabled });
  }
};
