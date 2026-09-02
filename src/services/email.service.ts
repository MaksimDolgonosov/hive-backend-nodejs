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

function buildOtpMessage(
  purpose: OtpPurpose,
  code: string,
  locale: EmailLocale,
): { subject: string; text: string; html: string } {
  if (purpose === 'register') {
    if (locale === 'en') {
      const text = `Hive verification code: ${code}. Valid for 10 minutes.`;
      return {
        subject: 'Hive verification code',
        text,
        html: `<p>Hive verification code: <strong>${code}</strong>. Valid for 10 minutes.</p>`,
      };
    }
    const text = `Код подтверждения Hive: ${code}. Действует 10 минут.`;
    return {
      subject: 'Код подтверждения Hive',
      text,
      html: `<p>Код подтверждения Hive: <strong>${code}</strong>. Действует 10 минут.</p>`,
    };
  }

  if (locale === 'en') {
    const text = `Hive password reset code: ${code}. If you didn't request this, ignore this email.`;
    return {
      subject: 'Hive password reset code',
      text,
      html: `<p>Hive password reset code: <strong>${code}</strong>. If you didn't request this, ignore this email.</p>`,
    };
  }

  const text = `Код для сброса пароля Hive: ${code}. Если вы не запрашивали сброс — игнорируйте письмо.`;
  return {
    subject: 'Код для сброса пароля Hive',
    text,
    html: `<p>Код для сброса пароля Hive: <strong>${code}</strong>. Если вы не запрашивали сброс — игнорируйте письмо.</p>`,
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
