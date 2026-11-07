import { BrevoClient } from '@getbrevo/brevo';
import { Injectable, Logger } from '@nestjs/common';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Email transport. With BREVO_API_KEY it sends through Brevo (transactional). Without a key it only writes to the log:
 * allowed outside production, in production startup fails.
 * Outside production it keeps the latest mails in memory, for tests.
 *
 * A send error does not fail the request: registration and forgotten password must respond
 * the same way in every case, and a created invitation stays valid (it can be regenerated). It is only logged.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly brevo: BrevoClient | null;
  private readonly sender: { email: string; name: string };
  readonly outbox: Mail[] = [];

  constructor() {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey && process.env.NODE_ENV === 'production') {
      throw new Error('BREVO_API_KEY missing: emails cannot be sent in production');
    }
    this.brevo = apiKey ? new BrevoClient({ apiKey, timeoutInSeconds: 15, maxRetries: 2 }) : null;
    const email = process.env.MAIL_FROM_EMAIL ?? 'noreply@teammanix.local';
    if (apiKey && !process.env.MAIL_FROM_EMAIL) throw new Error('MAIL_FROM_EMAIL missing (address of the domain authenticated on Brevo)');
    this.sender = { email, name: process.env.MAIL_FROM_NAME ?? 'TeamManix' };
  }

  /** @returns true if the mail was accepted by the transport (or logged outside production). */
  async send(mail: Mail): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') {
      this.outbox.push(mail);
      if (this.outbox.length > 200) this.outbox.shift();
    }
    if (!this.brevo) {
      // The body contains links with tokens: it goes in the logs only without a real transport and outside production.
      this.logger.log(`mail to ${mail.to}: ${mail.subject}\n${mail.text}`);
      return true;
    }
    try {
      await this.brevo.transactionalEmails.sendTransacEmail({
        subject: mail.subject,
        textContent: mail.text,
        sender: this.sender,
        to: [{ email: mail.to }],
      });
      this.logger.log(`mail to ${mail.to}: ${mail.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`send failed to ${mail.to} (${mail.subject}): ${(err as Error).message}`);
      return false;
    }
  }
}
