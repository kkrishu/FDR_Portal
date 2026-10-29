/**
 * Mail Service
 *
 * One transport for every environment: SMTP points at Mailhog locally and at a
 * real relay in production, so the same code path is exercised in both. When
 * SMTP is not reachable the send is logged instead of thrown — a mail failure
 * should never fail the request that triggered it.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { config, isDevelopment } from '../config';
import logger from '../lib/logger';

class MailService {
  private transporter: Transporter | null = null;
  private verified = false;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    // Port 1025 with no auth is the standard Mailhog setup. If no host is
    // configured at all we fall back to a stream transport so development never
    // hard-fails on a missing mail server.
    const useStream = !config.SMTP_HOST;

    this.transporter = useStream
      ? nodemailer.createTransport({ streamTransport: true, buffer: true })
      : nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          auth: config.SMTP_USER
            ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
            : undefined,
          // Mailhog and most dev servers use self-signed certificates.
          tls: isDevelopment ? { rejectUnauthorized: false } : undefined,
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 10000,
        });

    return this.transporter;
  }

  async send(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<boolean> {
    try {
      const info = await this.getTransporter().sendMail({
        from: config.SMTP_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      if (!this.verified) {
        this.verified = true;
        logger.info({ host: config.SMTP_HOST || 'stream' }, 'Mail transport ready');
      }

      logger.info({ to: options.to, subject: options.subject, messageId: info.messageId }, 'Email sent');
      return true;
    } catch (error) {
      // Development is expected to run without a mail server; treat that as a
      // warning and keep the token visible in the log so the flow is testable.
      const level = isDevelopment ? 'warn' : 'error';
      logger[level]({ err: error, to: options.to, subject: options.subject }, 'Email delivery failed');
      if (isDevelopment) {
        logger.warn({ to: options.to, body: options.text }, 'Email body (delivery failed)');
      }
      return false;
    }
  }

  async sendPasswordReset(to: string, name: string, resetUrl: string, expiresMinutes: number) {
    const text = [
      `Hello ${name},`,
      '',
      'A password reset was requested for your FDR Portal account.',
      `Open this link to choose a new password (valid for ${expiresMinutes} minutes):`,
      resetUrl,
      '',
      'If you did not request this, you can ignore this email — your password has not changed.',
    ].join('\n');

    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0f172a">
        <h2 style="margin:0 0 8px;font-size:20px">Reset your password</h2>
        <p style="margin:0 0 20px;color:#475569;line-height:1.6">Hello ${escapeHtml(name)}, a password reset was requested for your FDR Portal account.</p>
        <p style="margin:0 0 24px">
          <a href="${resetUrl}" style="display:inline-block;background:#1B4270;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Choose a new password</a>
        </p>
        <p style="margin:0 0 8px;color:#64748b;font-size:13px">This link expires in ${expiresMinutes} minutes.</p>
        <p style="margin:0;color:#94a3b8;font-size:12px">If you did not request this, you can ignore this email — your password has not changed.</p>
      </div>`;

    return this.send({ to, subject: 'Reset your FDR Portal password', text, html });
  }

  async sendVerificationOtp(options: {
    to: string;
    otp: string;
    fdrNumber: string;
    bankName: string;
    amount: number;
    expiresMinutes: number;
    verifyUrl: string;
  }) {
    const amount = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(options.amount);

    const text = [
      `FDR verification request`,
      '',
      `FDR number: ${options.fdrNumber}`,
      `Bank: ${options.bankName}`,
      `Amount: ${amount}`,
      '',
      `Your one-time password is ${options.otp}. It expires in ${options.expiresMinutes} minutes.`,
      `Verify here: ${options.verifyUrl}`,
    ].join('\n');

    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0f172a">
        <h2 style="margin:0 0 8px;font-size:20px">FDR verification request</h2>
        <p style="margin:0 0 20px;color:#475569;line-height:1.6">AICTE has asked your branch to confirm the following deposit.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
          <tr><td style="padding:8px 0;color:#64748b">FDR number</td><td style="padding:8px 0;text-align:right;font-weight:600">${escapeHtml(options.fdrNumber)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Bank</td><td style="padding:8px 0;text-align:right;font-weight:600">${escapeHtml(options.bankName)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Amount</td><td style="padding:8px 0;text-align:right;font-weight:600">${amount}</td></tr>
        </table>
        <p style="margin:0 0 8px;color:#475569">Your one-time password:</p>
        <p style="margin:0 0 24px;font-size:30px;letter-spacing:8px;font-weight:700;font-family:ui-monospace,monospace">${options.otp}</p>
        <p style="margin:0 0 24px"><a href="${options.verifyUrl}" style="display:inline-block;background:#1B4270;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Open verification page</a></p>
        <p style="margin:0;color:#94a3b8;font-size:12px">This code expires in ${options.expiresMinutes} minutes.</p>
      </div>`;

    return this.send({
      to: options.to,
      subject: `Verify FDR ${options.fdrNumber}`,
      text,
      html,
    });
  }

  async sendReleaseDecision(options: {
    to: string;
    name: string;
    fdrNumber: string;
    decision: 'approved' | 'rejected';
    remarks?: string;
  }) {
    const subject = `Release request ${options.decision} — FDR ${options.fdrNumber}`;
    const text = [
      `Hello ${options.name},`,
      '',
      `Your release request for FDR ${options.fdrNumber} has been ${options.decision}.`,
      options.remarks ? `Remarks: ${options.remarks}` : '',
    ].join('\n');

    return this.send({ to: options.to, subject, text });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const mailService = new MailService();
