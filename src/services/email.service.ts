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

function isSmtpConfigured(): boolean {
  return Boolean(env.smtpHost);
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

function buildOtpMessage(
  purpose: OtpPurpose,
  code: string,
  locale: EmailLocale,
): { subject: string; text: string } {
  if (purpose === 'register') {
    if (locale === 'en') {
      return {
        subject: 'Hive verification code',
        text: `Hive verification code: ${code}. Valid for 10 minutes.`,
      };
    }
    return {
      subject: 'Код подтверждения Hive',
      text: `Код подтверждения Hive: ${code}. Действует 10 минут.`,
    };
  }

  if (locale === 'en') {
    return {
      subject: 'Hive password reset code',
      text: `Hive password reset code: ${code}. If you didn't request this, ignore this email.`,
    };
  }

  return {
    subject: 'Код для сброса пароля Hive',
    text: `Код для сброса пароля Hive: ${code}. Если вы не запрашивали сброс — игнорируйте письмо.`,
  };
}

function logDevOtp(input: SendOtpEmailInput): void {
  if (env.nodeEnv === 'production' || !env.otpDevLog) {
    return;
  }
  console.log(`[otp-dev] purpose=${input.purpose} to=${input.to} code=${input.code}`);
}

export async function sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
  logDevOtp(input);

  if (!isSmtpConfigured()) {
    if (env.nodeEnv === 'production') {
      throw new Error('SMTP is not configured');
    }
    return;
  }

  const locale = input.locale ?? env.otpDefaultLocale;
  const { subject, text } = buildOtpMessage(input.purpose, input.code, locale);

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to: input.to,
    subject,
    text,
  });
}
