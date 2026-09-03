import { Resend } from 'resend';
import nodemailer, { Transporter } from 'nodemailer';

import env from '../config/env';
import { OtpPurpose } from '../models/EmailOtpChallenge';
import { EmailLocale } from '../utils/otp';

export interface SendOtpEmailInput {
  to: string;
  code: string;
  purpose: OtpPurpose;
  locale?: EmailLocale;
}

let transporter: Transporter | null = null;
let resendClient: Resend | null = null;

function isResendConfigured(): boolean {
  return Boolean(env.resendApiKey);
}

function isSmtpConfigured(): boolean {
  return Boolean(env.smtpHost);
}

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(env.resendApiKey);
  }
  return resendClient;
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    });
  }
  return transporter;
}

function buildOtpHtml(title: string, code: string, footer: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:420px;background:#ffffff;border-radius:12px;padding:32px 28px;">
          <tr>
            <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#3f3f46;">${title}</p>
              <p style="margin:0 0 20px;font-size:36px;font-weight:700;line-height:1.2;letter-spacing:6px;color:#18181b;text-align:center;">${code}</p>
              <p style="margin:0;font-size:14px;line-height:1.5;color:#71717a;">${footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOtpText(title: string, code: string, footer: string): string {
  return `${title}\n\n${code}\n\n${footer}`;
}

function buildOtpMessage(
  purpose: OtpPurpose,
  code: string,
  locale: EmailLocale,
): { subject: string; text: string; html: string } {
  if (purpose === 'register') {
    if (locale === 'en') {
      const title = 'Hive verification code';
      const footer = 'Valid for 10 minutes.';
      return {
        subject: title,
        text: buildOtpText(title, code, footer),
        html: buildOtpHtml(title, code, footer),
      };
    }
    const title = 'Код подтверждения Hive';
    const footer = 'Действует 10 минут.';
    return {
      subject: title,
      text: buildOtpText(title, code, footer),
      html: buildOtpHtml(title, code, footer),
    };
  }

  if (locale === 'en') {
    const title = 'Hive password reset code';
    const footer = "If you didn't request this, ignore this email.";
    return {
      subject: title,
      text: buildOtpText(title, code, footer),
      html: buildOtpHtml(title, code, footer),
    };
  }

  const title = 'Код для сброса пароля Hive';
  const footer = 'Если вы не запрашивали сброс — игнорируйте письмо.';
  return {
    subject: title,
    text: buildOtpText(title, code, footer),
    html: buildOtpHtml(title, code, footer),
  };
}

function logDevOtp(input: SendOtpEmailInput): void {
  if (env.nodeEnv === 'production' || !env.otpDevLog) {
    return;
  }
  console.log(`[otp-dev] purpose=${input.purpose} to=${input.to} code=${input.code}`);
}

async function sendViaResend(to: string, subject: string, text: string, html: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: env.smtpFrom,
    to,
    subject,
    text,
    html,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
  logDevOtp(input);

  const hasProvider = isResendConfigured() || isSmtpConfigured();
  if (!hasProvider) {
    if (env.nodeEnv === 'production') {
      throw new Error('Email provider is not configured');
    }
    return;
  }

  const locale = input.locale ?? env.otpDefaultLocale;
  const { subject, text, html } = buildOtpMessage(input.purpose, input.code, locale);

  if (isResendConfigured()) {
    await sendViaResend(input.to, subject, text, html);
    return;
  }

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to: input.to,
    subject,
    text,
    html,
  });
}
