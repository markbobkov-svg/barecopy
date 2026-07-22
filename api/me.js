// GET /api/me — entitlement from the session cookie (no body, no file data).
// Returns { pro, tier, email? }. tier is 'free' | 'pro'. This is the source of
// truth the page reads on every load to decide whether Pro is unlocked — there
// is no license key to paste and nothing cached client-side that could go stale.
const { verifySession, readCookie } = require('../lib/auth.js');
const { entitlement } = require('../lib/polar.js');
const { json } = require('../lib/http.js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = readCookie(req);
  const payload = token ? verifySession(token, process.env.JWT_SECRET) : null;
  return json(res, 200, entitlement(payload));
};
