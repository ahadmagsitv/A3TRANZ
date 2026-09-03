/**
 * Sending mail.
 *
 * One function, two behaviours, chosen by whether a provider key exists. No
 * transport interface and no adapter class: there is exactly one caller (the
 * outbox worker) and exactly one message type.
 *
 * Without RESEND_API_KEY the message is written to the log — which is what a
 * dev environment wants, and means the outbox can be exercised end to end
 * before anyone has bought a domain.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export class MailError extends Error {}

const FROM = process.env.MAIL_FROM ?? 'A3 Transport <dispatch@a3transport.com>';

export const sendMail = async (mail: Mail): Promise<void> => {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.log(
      `\n── mail (no RESEND_API_KEY, not sent) ──\nto: ${mail.to}\nsubject: ${mail.subject}\n\n${mail.text}\n───────────────────────────────────────\n`,
    );
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });

  if (!res.ok) {
    // Thrown, not swallowed: the worker records it and retries. A send that
    // fails quietly is the one case where the customer is never told at all.
    throw new MailError(`${res.status} ${await res.text().catch(() => '')}`.trim());
  }
};

/**
 * The completion email. Reworded per plan §8 Q2 (resolved): no `J1-…` /
 * `CR-…` literals — those ticket numbers are photographed by the driver, never
 * keyed, so the app has no value to print and inventing one would be a lie.
 */
export const completionEmail = (job: {
  id: string;
  title: string;
  customerName: string;
  containerNo: string | null;
  deliveryLocation: string;
}): Pick<Mail, 'subject' | 'text'> => ({
  subject: `Job complete — ${job.title}`,
  text: [
    `Hello ${job.customerName},`,
    '',
    `Your job is complete.`,
    '',
    `  Reference:  ${job.id}`,
    `  Job:        ${job.title}`,
    job.containerNo ? `  Container:  ${job.containerNo}` : null,
    `  Delivered:  ${job.deliveryLocation}`,
    '',
    'Container returned and chassis returned; 9 photos are attached.',
    '',
    'A3 Transport',
  ]
    .filter(l => l !== null)
    .join('\n'),
});

/**
 * The reset link, and the driver invite — the same message with different
 * copy, because they are the same mechanism (BACKEND_PLAN B2: an invite is a
 * reset token with a longer life, so there is no second code path and no
 * second screen).
 *
 * APP_URL is where the client redeems it. It has no default worth guessing:
 * a link to the wrong host is worse than a link the operator must configure.
 */
export const resetEmail = (r: {
  name: string;
  token: string;
  invite: boolean;
}): Pick<Mail, 'subject' | 'text'> => {
  const base = process.env.APP_URL ?? 'http://31.97.99.190:3000/A3TRANZ';
  const link = `${base}/reset?token=${encodeURIComponent(r.token)}`;
  return {
    subject: r.invite ? 'Your A3 Transport account' : 'Reset your A3 Transport password',
    text: [
      `Hello ${r.name},`,
      '',
      r.invite
        ? 'An account has been created for you. Choose a password to sign in:'
        : 'Someone asked to reset your password. Choose a new one here:',
      '',
      `  ${link}`,
      '',
      r.invite
        ? 'The link is good for 7 days.'
        : 'The link is good for 30 minutes and can be used once.',
      '',
      r.invite ? '' : 'If this was not you, ignore this email — nothing has changed.',
      'A3 Transport',
    ]
      .filter(l => l !== '')
      .join('\n'),
  };
};
