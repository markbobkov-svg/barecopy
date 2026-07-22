// GET /api/checkout — create a Polar checkout and return its link as JSON.
// The browser opens it in an embedded overlay (or navigates to it as a
// fallback). No file data is ever received here — this only mints a checkout
// URL from the configured product; Barecopy's client-only guarantee is intact.
const { createCheckout } = require('../lib/polar.js');
const { originOf, json } = require('../lib/http.js');
const { rateLimit, tooMany } = require('../lib/ratelimit.js');

module.exports = async function handler(req, res) {
  try {
    // Each call creates a Polar checkout session; throttle so an attacker can't
    // hammer the Polar API. 10 per 10 min per IP is generous for a human.
    const rl = await rateLimit(req, { bucket: 'checkout', limit: 10, windowSec: 600 });
    if (!rl.ok) return tooMany(res, json, rl.retryAfter);
    const productId = process.env.POLAR_PRODUCT_ID;
    if (!productId) return json(res, 500, { error: 'not_configured' });
    const origin = originOf(req);
    const successUrl = `${origin}/api/confirm?checkout_id={CHECKOUT_ID}`;
    const checkout = await createCheckout(productId, successUrl, origin);
    if (!checkout || !checkout.url) return json(res, 502, { error: 'checkout_failed' });
    return json(res, 200, { url: checkout.url, id: checkout.id });
  } catch (e) {
    console.error('checkout error', e.message, e.data || '');
    return json(res, 502, { error: 'checkout_failed' });
  }
};
