// GET /api/portal — open the Polar customer portal for the signed-in customer
// (the "Manage subscription" link). Requires a valid session cookie. This is
// where a Pro user updates payment details or cancels — Polar hosts it.
const { createCustomerSession } = require('../lib/polar.js');
const { verifySession, readCookie } = require('../lib/auth.js');
const { redirect } = require('../lib/http.js');

module.exports = async function handler(req, res) {
  const token = readCookie(req);
  const payload = token ? verifySession(token, process.env.JWT_SECRET) : null;
  if (!payload) return redirect(res, '/?signin=required');
  try {
    const session = await createCustomerSession(payload.customer_id);
    if (!session || !session.customer_portal_url) return redirect(res, '/?portal=error');
    return redirect(res, session.customer_portal_url);
  } catch (e) {
    console.error('portal error', e.message, e.data || '');
    return redirect(res, '/?portal=error');
  }
};
