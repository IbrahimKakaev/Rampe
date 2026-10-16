import { Injectable, Logger } from '@nestjs/common';

import { Clock } from '../infra/clock.js';
import { Prisma } from '../infra/prisma.js';
import { ScansService } from './scans.service.js';
import { nextScanAt } from './schedule.js';

/** Sites started at most per round; the next round, a minute later, takes the rest. */
const BATCH = 50;

/**
 * Starts the scans that are due. Runs every minute; the state lives in the
 * database (`sites.next_scan_at`), so a restart loses nothing and several API
 * instances can run it side by side: each site is claimed by one of them only.
 */
@Injectable()
export class ScheduledScans {
  private readonly logger = new Logger(ScheduledScans.name);

  constructor(
    private readonly prisma: Prisma,
    private readonly scans: ScansService,
    private readonly clock: Clock,
  ) {}

  /** Starts every scan due by now; returns how many were started. */
  async runDue(): Promise<number> {
    const now = this.clock.now();
    const due = await this.prisma.site.findMany({
      where: { schedule: { not: 'NONE' }, nextScanAt: { lte: now } },
      orderBy: { nextScanAt: 'asc' },
      take: BATCH,
    });
    let started = 0;
    for (const site of due) {
      // The condition on the old date makes the claim fail for a concurrent instance.
      const claimed = await this.prisma.site.updateMany({
        where: { id: site.id, nextScanAt: site.nextScanAt },
        data: { nextScanAt: nextScanAt(site.schedule, now) },
      });
      if (claimed.count !== 1) {
        continue;
      }
      try {
        await this.scans.start(site.organizationId, site.id, 'SCHEDULED');
        started += 1;
      } catch (error) {
        // An unverified site, a proof gone or a scan in progress: this turn is skipped.
        this.logger.warn(
          `Scheduled scan of site ${site.id} skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return started;
  }
}
