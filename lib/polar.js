// Thin Polar REST client (production API). Source of truth for entitlement —
// Barecopy keeps no local subscription state; the session cookie is minted only
// after Polar confirms a payment, and re-checked from the cookie thereafter.
// CommonJS (no build step). global fetch is available on Vercel's Node runtime.
const BASE = 'https://api.polar.sh';

async function polar(path, opts = {}) {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) throw new Error('POLAR_ACCESS_TOKEN missing');
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(`Polar ${res.status} ${path}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Create a subscription checkout; success_url gets {CHECKOUT_ID} filled by Polar.
// embed_origin (when set) allows the checkout to run in an embedded overlay on
// that origin — that's what powers the on-page checkout instead of a redirect.
const createCheckout = (productId, successUrl, embedOrigin) =>
  polar('/v1/checkouts/', {
    method: 'POST',
    body: JSON.stringify({
      products: [productId],
      success_url: successUrl,
      embed_origin: embedOrigin,   // omitted from JSON when undefined
      allow_discount_codes: true,
    }),
  });

const getCheckout = (id) => polar('/v1/checkouts/' + encodeURIComponent(id));

async function findCustomerByEmail(email) {
  const data = await polar('/v1/customers/?limit=1&email=' + encodeURIComponent(email));
  return (data && data.items && data.items[0]) || null;
}

// True if the customer has an active (or trialing) subscription. Used by the
// magic-link flow to decide whether an email is a paying customer we should
// restore Pro for.
async function hasActiveSubscription(customerId) {
  const data = await polar('/v1/subscriptions/?active=true&limit=100&customer_id=' + encodeURIComponent(customerId));
  return (data && data.items || []).some((s) => s.status === 'active' || s.status === 'trialing');
}

const DAY = 24 * 3600;
const THIRTY_DAYS = 30 * DAY;

// Session tier + cookie TTL for a completed checkout. Barecopy sells a single
// Pro subscription, so any completed checkout → 30-day 'pro' session. Pure, so
// it is trivially unit-testable without hitting Polar.
function sessionForProduct(/* productId */) {
  return { tier: 'pro', ttl: THIRTY_DAYS };
}

const createCustomerSession = (customerId) =>
  polar('/v1/customer-sessions/', { method: 'POST', body: JSON.stringify({ customer_id: customerId }) });

// Pure entitlement resolver from a verified session payload (no network). tier
// is 'free' (no cookie) | 'pro'. Cookies are only ever issued to paid buyers,
// so any valid payload → Pro.
function entitlement(payload) {
  if (!payload) return { pro: false, tier: 'free' };
  return { pro: true, tier: 'pro', email: payload.email };
}

module.exports = {
  createCheckout, getCheckout, findCustomerByEmail, hasActiveSubscription,
  sessionForProduct, createCustomerSession, entitlement,
};
