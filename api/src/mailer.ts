import { readFileSync } from 'node:fs';

export interface Mail {
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
}

export class MailError extends Error {}

const LOGO_B64 = readFileSync(new URL('../assets/logo.png', import.meta.url)).toString('base64');

const FROM = process.env.MAIL_FROM ?? 'A3 Transport <dispatch@a3transport.com>';
const from = (m => (m ? { name: m[1]!.trim(), email: m[2]! } : { email: FROM.trim() }))(
  FROM.match(/^(.*)<(.+)>$/),
);

export const sendMail = async (mail: Mail): Promise<void> => {
  const key = process.env.SENDGRID_API_KEY;

  if (!key) {
    console.log(
      `\n── mail (no SENDGRID_API_KEY, not sent) ──\nto: ${mail.to}${mail.cc?.length ? `\ncc: ${mail.cc.join(', ')}` : ''}\nsubject: ${mail.subject}\n\n${mail.text}\n───────────────────────────────────────\n`,
    );
    return;
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: mail.to }],
          ...(mail.cc?.length ? { cc: mail.cc.map(email => ({ email })) } : {}),
        },
      ],
      from,
      subject: mail.subject,
      content: [
        { type: 'text/plain', value: mail.text },
        ...(mail.html ? [{ type: 'text/html', value: mail.html }] : []),
      ],
      ...(mail.html?.includes('cid:a3logo')
        ? {
            attachments: [
              {
                content: LOGO_B64,
                type: 'image/png',
                filename: 'a3-logo.png',
                disposition: 'inline',
                content_id: 'a3logo',
              },
            ],
          }
        : {}),
      tracking_settings: { click_tracking: { enable: false, enable_text: false } },
    }),
  });

  if (!res.ok) {
    throw new MailError(`${res.status} ${await res.text().catch(() => '')}`.trim());
  }
};

export const completionEmail = (job: {
  id: string;
  title: string;
  customerName: string;
  containerNo: string | null;
  deliveryLocation: string;
}): Pick<Mail, 'subject' | 'text' | 'html'> => {
  const rows: [string, string][] = [
    ['Reference', job.id],
    ['Job', job.title],
    ...(job.containerNo ? [['Container', job.containerNo] as [string, string]] : []),
    ['Delivered', job.deliveryLocation],
  ];
  const note = 'Container returned and chassis returned; 9 photos are attached.';
  return {
    subject: `Job complete — ${job.title}`,
    text: [
      `Hello ${job.customerName},`,
      '',
      `Your job is complete.`,
      '',
      ...rows.map(([k, v]) => `  ${`${k}:`.padEnd(12)}${v}`),
      '',
      note,
      '',
      'A3 Transport',
    ].join('\n'),
    html: layout(`
      <span style="display:inline-block;margin:0 0 16px;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:12px;font-weight:600;">✓ Completed</span>
      <h1 style="margin:0 0 8px;font-size:22px;line-height:28px;color:#0f172a;">Hello ${esc(job.customerName)},</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#334155;">Your job is complete.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;">
        ${rows
          .map(
            ([k, v], i) => `<tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;${i ? 'border-top:1px solid #e2e8f0;' : ''}">${k}</td>
          <td style="padding:12px 16px;font-size:14px;color:#0f172a;font-weight:500;${i ? 'border-top:1px solid #e2e8f0;' : ''}">${esc(v)}</td>
        </tr>`,
          )
          .join('')}
      </table>
      <p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#64748b;">${note}</p>`),
  };
};

export const resetEmail = (r: {
  name: string;
  token: string;
  invite: boolean;
}): Pick<Mail, 'subject' | 'text' | 'html'> => {
  const base = process.env.APP_URL ?? 'https://admin.a3tranz.appcrops.com';
  const link = `${base}/reset/?token=${encodeURIComponent(r.token)}`;
  const intro = r.invite
    ? 'An account has been created for you. Choose a password to sign in:'
    : 'Someone asked to reset your password. Choose a new one here:';
  const expiry = r.invite
    ? 'The link is good for 7 days.'
    : 'The link is good for 30 minutes and can be used once.';
  const ignore = r.invite ? '' : 'If this was not you, ignore this email — nothing has changed.';
  const cta = r.invite ? 'Set your password' : 'Reset password';
  return {
    subject: r.invite ? 'Your A3 Transport account' : 'Reset your A3 Transport password',
    text: [`Hello ${r.name},`, '', intro, '', `  ${link}`, '', expiry, '', ignore, 'A3 Transport']
      .filter(l => l !== '')
      .join('\n'),
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:#0f172a;">Hello ${esc(r.name)},</h1>
      <p style="margin:0 0 28px;font-size:15px;line-height:24px;color:#334155;">${intro}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="border-radius:10px;background:#0d27c8;">
          <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${cta}</a>
        </td>
      </tr></table>
      <p style="margin:28px 0 0;font-size:13px;line-height:20px;color:#64748b;">${expiry}${ignore ? `<br>${ignore}` : ''}</p>
      <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;line-height:18px;color:#94a3b8;">
        Button not working? Paste this link into your browser:<br>
        <a href="${esc(link)}" style="color:#0d27c8;word-break:break-all;">${esc(link)}</a>
      </p>`),
  };
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const layout = (body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
      <tr><td style="padding:0 4px 20px;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.2px;">
        <img src="cid:a3logo" width="36" height="36" alt="A3" style="display:inline-block;border:0;border-radius:8px;vertical-align:middle;">
        <span style="vertical-align:middle;margin-left:8px;">A3 Transport</span>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(15,23,42,0.08);">${body}</td></tr>
      <tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#94a3b8;text-align:center;">A3 Transport · This is an automated message, please don't reply.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
