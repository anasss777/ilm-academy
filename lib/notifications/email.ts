// lib/notifications/email.ts
// Sending email through Resend (https://resend.com) with a plain HTTPS call: no SDK needed.
// Configure with two environment variables; without them emails are simply not sent and
// notifications stay in-app only.
//
//   RESEND_API_KEY   an API key from your Resend account
//   EMAIL_FROM       a sender on a domain you verified there, e.g.  Ilm Academy <noreply@yourdomain.com>

export const isEmailConfigured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type RenderedEmail = { subject: string; text: string; html: string };

/** A small, dependency-free email: right-to-left for Arabic, with one button. */
export function renderEmail(args: {
  title: string;
  body: string;
  url: string | null;
  locale: "ar" | "en";
  openLabel: string;
  footer: string;
}): RenderedEmail {
  const { title, body, url, locale, openLabel, footer } = args;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";

  const button = url
    ? `<a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:15px;">${escapeHtml(openLabel)}</a>`
    : "";

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f3f5f7;font-family:Tahoma,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;">
<tr><td style="padding:28px;text-align:${align};">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.4;">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#334155;">${escapeHtml(body)}</p>
${button}
<p style="margin:28px 0 0;font-size:12px;line-height:1.7;color:#64748b;">${escapeHtml(footer)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    title,
    "",
    body,
    url ? `\n${openLabel}: ${url}` : "",
    "",
    "--",
    footer,
  ].join("\n");
  return { subject: title, text, html };
}

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** retrying can never help (bad address, rejected content) */ permanent: boolean;
      /** slow down and try later */ rateLimited: boolean;
    };

export type SendFn = (
  mail: { to: string } & RenderedEmail,
) => Promise<SendResult>;

export const sendEmail: SendFn = async (mail) => {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const rateLimited = res.status === 429;
    return {
      ok: false,
      error: `HTTP ${res.status}`,
      rateLimited,
      permanent: res.status >= 400 && res.status < 500 && !rateLimited,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 150) : "NETWORK",
      permanent: false,
      rateLimited: false,
    };
  }
};
