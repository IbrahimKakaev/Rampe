import { Injectable, Logger } from '@nestjs/common';

import { Clock } from '../infra/clock.js';
import { Prisma } from '../infra/prisma.js';
import { monthsBefore } from './schedule.js';

/**
 * Deletes the scans older than the retention period of their organisation
 * (12 months by default), with their pages, defects and alerts. A scan still
 * in progress is never deleted.
 */
@Injectable()
export class Retention {
  private readonly logger = new Logger(Retention.name);

  constructor(
    private readonly prisma: Prisma,
    private readonly clock: Clock,
  ) {}

  /** Returns how many scans were deleted. */
  async purge(): Promise<number> {
    const now = this.clock.now();
    const organizations = await this.prisma.organization.findMany({
      select: { id: true, retentionMonths: true },
    });
    let deleted = 0;
    for (const organization of organizations) {
      const { count } = await this.prisma.scan.deleteMany({
        where: {
          organizationId: organization.id,
          createdAt: { lt: monthsBefore(now, organization.retentionMonths) },
          status: { notIn: ['QUEUED', 'RUNNING'] },
        },
      });
      deleted += count;
    }
    if (deleted > 0) {
      this.logger.log(`Retention: ${String(deleted)} scan(s) deleted`);
    }
    return deleted;
  }
}
