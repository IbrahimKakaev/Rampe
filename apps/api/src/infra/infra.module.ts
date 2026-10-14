import { Module } from '@nestjs/common';

import { Database } from './database.js';
import { DATABASE_PROBE, QUEUE_PROBE } from './probe.js';
import { QueueConnection } from './queue-connection.js';

@Module({
  providers: [
    Database,
    QueueConnection,
    { provide: DATABASE_PROBE, useExisting: Database },
    { provide: QUEUE_PROBE, useExisting: QueueConnection },
  ],
  exports: [DATABASE_PROBE, QUEUE_PROBE],
})
export class InfraModule {}
