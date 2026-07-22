// GET /api/confirm?checkout_id=... — Polar success_url target.
// Verify the checkout with Polar, then issue the 30-day session cookie. This is
// what replaces the old "paste your license key" step: after paying, the
// browser lands here (or the embed calls it), the cookie is set, and Pro is
// unlocked automatically — no key to copy from an email.
const { getCheckout, sessionForProduct } = require('../lib/polar.js');
const { signJWT, sessionCookie } = require('../lib/auth.js');
const { redirect } = require('../lib/http.js');

const REPLAY_WINDOW_MS = 6 * 3600 * 1000; // a checkout_id is only good for a few hours after creation

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('checkout_id');
  try {
    if (!id || !process.env.JWT_SECRET) return redirect(res, '/?pro=0');
    const c = await getCheckout(id);
    const paid = (c.status === 'succeeded' || c.status === 'confirmed') && c.customer_id && c.customer_email;
    if (!paid) return redirect(res, '/?pro=0');
    // Replay hardening. With no DB we can't mark a checkout_id consumed, and a
    // succeeded checkout stays succeeded forever — so a leaked/bookmarked
    // ?checkout_id= could otherwise mint a fresh 30-day session long after the
    // sale. Bound it: reject a checkout that is clearly old. We only reject when
    // a timestamp actually parses, so a missing/renamed field can never break a
    // real payment. Residual (accepted): within the window the id is replayable.
    const created = Date.parse(c.created_at || c.created || '');
    if (Number.isFinite(created) && Date.now() - created > REPLAY_WINDOW_MS) return redirect(res, '/?pro=0');
    const { tier, ttl } = sessionForProduct(c.product_id);
    const token = signJWT({ customer_id: c.customer_id, email: c.customer_email, tier, purpose: 'session' }, process.env.JWT_SECRET, ttl);
    res.setHeader('Set-Cookie', sessionCookie(token, ttl));
    return redirect(res, '/?pro=1');
  } catch (e) {
    console.error('confirm error', e.message, e.data || '');
    return redirect(res, '/?pro=0');
  }
};
