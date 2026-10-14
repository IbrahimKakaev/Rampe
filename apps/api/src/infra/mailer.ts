import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Sends e-mails. A class rather than an interface, so that it can be an injection token. */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly logger = new Logger(SmtpMailer.name);
  private readonly transport: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
    this.transport = createTransport(config.smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.config.mailFrom, ...message });
    // The address is personal data: the log keeps the subject only.
    this.logger.log(`E-mail sent: ${message.subject}`);
  }
}
