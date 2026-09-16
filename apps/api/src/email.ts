import { env } from './config.js';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export async function sendSchoolEnquiry(
  type: 'Admission enquiry' | 'Contact message',
  senderEmail: string,
  details: Record<string, unknown>,
) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email service is not configured');
    console.warn('Email not sent: set RESEND_API_KEY and RESEND_FROM_EMAIL');
    return;
  }

  const rows = Object.entries(details)
    .map(([label, value]) => `<tr><th style="padding:8px;text-align:left;vertical-align:top">${escapeHtml(label)}</th><td style="padding:8px">${escapeHtml(value) || '—'}</td></tr>`)
    .join('');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [env.SCHOOL_ENQUIRY_EMAIL],
      reply_to: senderEmail,
      subject: `${type} — ${String(details.Name ?? details['Student name'] ?? 'Website').replace(/[\r\n]+/g, ' ').slice(0, 100)}`,
      html: `<h2>${escapeHtml(type)}</h2><p>A new enquiry was submitted through the school website.</p><table style="border-collapse:collapse">${rows}</table>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email provider rejected the message (${response.status}): ${await response.text()}`);
}
