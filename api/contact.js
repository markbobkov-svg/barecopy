// Serverless contact relay (Vercel Node function, CommonJS).
//
// The browser POSTs {name, email, message} here as JSON. Because this lives on
// Barecopy's OWN origin, the request is allowed by the site CSP (connect-src
// 'self') with no third party involved — the message is relayed to the support
// mailbox over SMTP, server-side. No file data is ever involved; this endpoint
// only handles the contact form's own fields.
//
// Configure via Vercel env vars (Project Settings → Environment Variables):
//   SMTP_HOST      e.g. smtp.your-host.com          (required)
//   SMTP_PORT      587 (STARTTLS) or 465 (TLS)      (default 587)
//   SMTP_SECURE    "true" for port 465, else "false"(default: true when port 465)
//   SMTP_USER      SMTP username / mailbox          (required)
//   SMTP_PASS      SMTP password / app password     (required)
//   CONTACT_TO     where messages land   (default support@barecopy.com)
//   CONTACT_FROM   From: header          (default: SMTP_USER; many hosts require
//                                          From to equal the authenticated user)

const nodemailer = require('nodemailer');

const MAX = { name: 120, email: 200, message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A cached transport survives warm invocations so we don't reconnect every time.
let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('SMTP not configured');
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return transporter;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Body is JSON; Vercel parses it, but tolerate a raw string too.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Honeypot: real users never fill this hidden field. Pretend success for bots.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  const name = String(body.name || '').trim().slice(0, MAX.name);
  const email = String(body.email || '').trim().slice(0, MAX.email);
  const message = String(body.message || '').trim().slice(0, MAX.message);

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'A valid email is required.' });
  }
  if (!message) {
    return res.status(400).json({ ok: false, error: 'Message is required.' });
  }

  const to = process.env.CONTACT_TO || 'support@barecopy.com';
  const from = process.env.CONTACT_FROM || process.env.SMTP_USER;

  try {
    await getTransport().sendMail({
      to,
      from,                       // authenticated sender (host may require this)
      replyTo: name ? `${name} <${email}>` : email,
      subject: `Barecopy contact — ${name || email}`,
      text:
        `New message from the Barecopy contact form.\n\n` +
        `Name:    ${name || '(not given)'}\n` +
        `Email:   ${email}\n\n` +
        `Message:\n${message}\n`,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Log server-side; never leak SMTP details to the client.
    console.error('contact relay failed:', err && err.message ? err.message : err);
    const configIssue = err && err.message === 'SMTP not configured';
    return res.status(configIssue ? 503 : 502).json({
      ok: false,
      error: 'Could not send right now. Please email support@barecopy.com directly.',
    });
  }
};
