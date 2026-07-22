// Magic-link email over SMTP (nodemailer) — the SAME relay Barecopy already
// uses for the contact form (api/contact.js), so no new provider/dependency is
// introduced. No-ops (logs "email disabled") when SMTP isn't configured, so the
// sign-in flow still responds generically instead of crashing.
//
// Configure via the existing Vercel env vars (see .env.example):
//   SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
//   CONTACT_FROM   From: header (defaults to SMTP_USER)
const nodemailer = require('nodemailer');

// Cached transport survives warm invocations so we don't reconnect every time.
let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null; // email disabled
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return transporter;
}

// True when no SMTP relay is configured — the client shows a "sign-in email
// isn't available" message instead of a false "link sent".
function emailDisabled() {
  return !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS;
}

// Send the sign-in magic link. Returns { sent } / { sent:false, disabled:true }.
// Never throws through to the caller path in a way that reveals delivery state.
async function sendMagicLink(to, link) {
  const tx = getTransport();
  if (!tx) {
    console.log('email disabled (SMTP not configured) — magic link not sent for', to);
    return { sent: false, disabled: true };
  }
  const from = process.env.CONTACT_FROM || process.env.SMTP_USER;
  try {
    await tx.sendMail({
      to,
      from,
      subject: 'Your Barecopy sign-in link',
      text: `Sign in to Barecopy Pro:\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
      html: `<p>Sign in to Barecopy Pro:</p><p><a href="${link}">${link}</a></p><p style="color:#666">This link expires in 15 minutes. If you didn't request it, ignore this email.</p>`,
    });
    return { sent: true, disabled: false };
  } catch (e) {
    console.error('magic-link send failed:', e && e.message ? e.message : e);
    return { sent: false, disabled: false };
  }
}

module.exports = { sendMagicLink, emailDisabled };
