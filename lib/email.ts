import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export function magicLinkEmailHtml(magicLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your YouTube to BUILD-IT login link</title>
  </head>
  <body style="margin:0;padding:0;background:#f7fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fafc;padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <tr>
              <td>
                <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#111;">YouTube to BUILD-IT</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#333;">Click the button below to sign in.</p>
                <p style="margin:0 0 32px;font-size:16px;line-height:1.5;color:#333;">This link expires in one hour. If you did not request it, ignore this email.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 32px;">
                  <tr>
                    <td style="background:#16a34a;border-radius:8px;">
                      <a href="${magicLink}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Sign in to BUILD-IT</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#666;">Or paste this link into your browser:</p>
                <p style="margin:0 0 32px;font-size:13px;color:#16a34a;word-break:break-all;"><a href="${magicLink}" style="color:#16a34a;text-decoration:underline;">${magicLink}</a></p>
                <p style="margin:0;font-size:13px;color:#666;line-height:1.5;">Built by The Ultimate Farmer.<br/>Limited to 10 guides per user per day.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendMagicLinkEmail(to: string, magicLink: string) {
  const resend = getResend();
  const from = `Robert <${process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"}>`;

  return resend.emails.send({
    from,
    to,
    subject: "Your YouTube to BUILD-IT login link",
    html: magicLinkEmailHtml(magicLink),
  });
}
