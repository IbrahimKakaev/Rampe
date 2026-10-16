import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORRECTIONS_FR, criteriaToCheckManually } from '@rampe/rules';
import { webPath } from '@rampe/shared';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { Mailer } from '../infra/mailer.js';
import { Prisma } from '../infra/prisma.js';
import { regressionEmail } from '../mail/templates.js';

/** New defects named in the e-mail; the others are counted. */
const EXAMPLES = 10;

const DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * Warns the members of an organisation when a scan finds defects that the
 * previous scan of the site did not have. A scan without new defects, or the
 * first scan of a site, sends nothing.
 *
 * The alert is sent at most once per scan: a row in `notifications`, unique
 * per scan, is written before the e-mails leave. If the mail server fails at
 * that moment, the alert is lost rather than sent twice; the log says so.
 */
@Injectable()
export class RegressionAlerts {
  private readonly logger = new Logger(RegressionAlerts.name);

  constructor(
    private readonly prisma: Prisma,
    private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async afterScan(scanId: string): Promise<void> {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: { site: true },
    });
    if (
      scan?.findingsAdded === null ||
      scan?.findingsAdded === undefined ||
      scan.findingsAdded === 0 ||
      scan.finishedAt === null
    ) {
      return;
    }
    const claimed = await this.prisma.notification.createMany({
      data: [{ organizationId: scan.organizationId, scanId, type: 'REGRESSION', recipients: 0 }],
      skipDuplicates: true,
    });
    if (claimed.count === 0) {
      return;
    }
    const [members, added] = await Promise.all([
      this.prisma.membership.findMany({
        where: { organizationId: scan.organizationId, user: { emailVerifiedAt: { not: null } } },
        include: { user: { select: { email: true } } },
      }),
      this.prisma.finding.findMany({
        where: { scanId, isNew: true },
        include: { page: { select: { path: true, position: true } } },
        orderBy: [{ page: { position: 'asc' } }, { ruleId: 'asc' }],
        take: EXAMPLES,
      }),
    ]);
    const alert = {
      host: scan.site.host,
      finishedAt: DATE.format(scan.finishedAt),
      added: scan.findingsAdded,
      fixed: scan.findingsFixed ?? 0,
      examples: added.map((finding) => ({
        title: CORRECTIONS_FR[finding.ruleId]?.title ?? finding.ruleId,
        pagePath: finding.page.path,
      })),
      criteriaToCheckManually: criteriaToCheckManually(),
      link: `${this.config.publicUrl}${webPath('scan', { org: scan.organizationId, scan: scanId })}`,
    };
    let sent = 0;
    for (const member of members) {
      try {
        await this.mailer.send(regressionEmail(member.user.email, alert));
        sent += 1;
      } catch (error) {
        this.logger.error(
          `Regression alert of scan ${scanId} not sent to a member: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await this.prisma.notification.updateMany({
      where: { scanId, type: 'REGRESSION' },
      data: { recipients: sent },
    });
  }
}
