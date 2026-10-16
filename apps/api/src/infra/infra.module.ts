import { Global, Module } from '@nestjs/common';

import { Clock, SystemClock } from './clock.js';
import { Mailer, SmtpMailer } from './mailer.js';
import { Prisma } from './prisma.js';
import { DATABASE_PROBE, QUEUE_PROBE } from './probe.js';
import { QueueConnection } from './queue-connection.js';
import { Queues } from './queues.js';

@Global()
@Module({
  providers: [
    Prisma,
    QueueConnection,
    Queues,
    { provide: Mailer, useClass: SmtpMailer },
    { provide: Clock, useClass: SystemClock },
    { provide: DATABASE_PROBE, useExisting: Prisma },
    { provide: QUEUE_PROBE, useExisting: QueueConnection },
  ],
  exports: [Prisma, QueueConnection, Queues, Mailer, Clock, DATABASE_PROBE, QUEUE_PROBE],
})
export class InfraModule {}
