import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { REPORTS_QUEUE, SCANS_QUEUE } from '@rampe/shared';
import { Queue, Worker } from 'bullmq';

import { Retention } from '../src/scans/retention.js';
import { ScheduledScans } from '../src/scans/scheduled-scans.js';
import { analyzedPage, reportScan, verifiedSite } from './support/fixtures.js';
import { type Client, type Harness, signedInAccount, startHarness } from './support/harness.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('monitoring: scheduled scans, alerts, retention and reports', () => {
  let harness: Harness;
  let owner: Client;
  let org: string;

  beforeAll(async () => {
    harness = await startHarness();
    ({ client: owner, organizationId: org } = await signedInAccount(harness, 'suivi@example.fr'));
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('scheduled scans', () => {
    const scansOf = (siteId: string) =>
      harness.prisma.scan.findMany({ where: { siteId }, orderBy: { createdAt: 'asc' } });
    /** Plays the worker: the queued scan finishes, so that the next one may start. */
    const finishQueued = async (siteId: string): Promise<void> => {
      for (const scan of await scansOf(siteId)) {
        if (scan.status === 'QUEUED') {
          await reportScan(harness, scan.id, [analyzedPage(`https://${siteId}.example/`)]);
        }
      }
    };

    it('rescans a daily site every day without anyone asking, testing with the clock moved forward', async () => {
      const start = new Date('2026-11-02T08:00:00.000Z');
      harness.clock.set(start);
      const siteId = await verifiedSite(harness, owner, org, 'https://quotidien.example');
      const site = (
        await owner.patch(`/orgs/${org}/sites/${siteId}`, { schedule: 'DAILY' }).expect(200)
      ).body as { nextScanAt: string };
      expect(site.nextScanAt).toBe('2026-11-03T08:00:00.000Z');
      const scheduled = harness.app.get(ScheduledScans);

      harness.clock.set(new Date(start.getTime() + 23 * HOUR));
      await scheduled.runDue();
      expect(await scansOf(siteId)).toHaveLength(0);

      harness.clock.set(new Date(start.getTime() + DAY + 60_000));
      await scheduled.runDue();
      // A second round in the same minute starts nothing more.
      await scheduled.runDue();
      expect((await scansOf(siteId)).map(({ trigger }) => trigger)).toEqual(['SCHEDULED']);
      await finishQueued(siteId);

      harness.clock.set(new Date(start.getTime() + 2 * DAY + 2 * 60_000));
      await scheduled.runDue();
      expect(await scansOf(siteId)).toHaveLength(2);
      const queue = new Queue(SCANS_QUEUE, { connection: { url: harness.valkeyUrl } });
      const [latest] = (await scansOf(siteId)).slice(-1);
      expect((await queue.getJob(latest?.id ?? ''))?.data).toMatchObject({
        url: 'https://quotidien.example/',
      });
      await queue.close();
    });

    it('rescans a weekly site once a week, and stops when the schedule is removed', async () => {
      const start = new Date('2026-11-10T08:00:00.000Z');
      harness.clock.set(start);
      const siteId = await verifiedSite(harness, owner, org, 'https://hebdomadaire.example');
      await owner.patch(`/orgs/${org}/sites/${siteId}`, { schedule: 'WEEKLY' }).expect(200);
      const scheduled = harness.app.get(ScheduledScans);

      harness.clock.set(new Date(start.getTime() + 6 * DAY));
      await scheduled.runDue();
      expect(await scansOf(siteId)).toHaveLength(0);
      harness.clock.set(new Date(start.getTime() + 7 * DAY + 60_000));
      await scheduled.runDue();
      expect(await scansOf(siteId)).toHaveLength(1);
      await finishQueued(siteId);

      const site = (
        await owner.patch(`/orgs/${org}/sites/${siteId}`, { schedule: 'NONE' }).expect(200)
      ).body as { nextScanAt: string | null };
      expect(site.nextScanAt).toBeNull();
      harness.clock.set(new Date(start.getTime() + 30 * DAY));
      await scheduled.runDue();
      expect(await scansOf(siteId)).toHaveLength(1);
    });

    it('skips a turn when the ownership proof has disappeared, and tries again the next one', async () => {
      const start = new Date('2026-11-20T08:00:00.000Z');
      harness.clock.set(start);
      const siteId = await verifiedSite(harness, owner, org, 'https://disparu.example');
      await owner.patch(`/orgs/${org}/sites/${siteId}`, { schedule: 'DAILY' }).expect(200);
      harness.dns.records.delete('_rampe-verification.disparu.example');

      harness.clock.set(new Date(start.getTime() + DAY + 60_000));
      await harness.app.get(ScheduledScans).runDue();

      expect(await scansOf(siteId)).toHaveLength(0);
      const site = await harness.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
      expect(site.verifiedAt).toBeNull();
      expect(site.nextScanAt?.toISOString()).toBe('2026-11-22T08:01:00.000Z');
    });
  });

  describe('regression alerts', () => {
    let siteId: string;
    let memberEmail: string;

    beforeAll(async () => {
      harness.clock.set(new Date());
      siteId = await verifiedSite(harness, owner, org, 'https://alerte.example');
      // A second member, who must be warned too.
      memberEmail = 'collegue@example.fr';
      await harness.resetRateLimits();
      const member = await signedInAccount(harness, memberEmail);
      await owner
        .post(`/orgs/${org}/invitations`, { email: memberEmail, role: 'MEMBER' })
        .expect(201);
      await member.client
        .post('/invitations/accept', { token: harness.mailer.lastToken(memberEmail) })
        .expect(200);
    });

    beforeEach(() => {
      harness.mailer.sent.length = 0;
    });

    const scanWith = async (violations: { ruleId: string; selector: string }[]) => {
      const scan = (await owner.post(`/orgs/${org}/sites/${siteId}/scans`).expect(201)).body as {
        id: string;
      };
      await reportScan(harness, scan.id, [analyzedPage('https://alerte.example/', violations)]);
      return scan.id;
    };
    const alerts = () =>
      harness.mailer.sent.filter((message) => message.subject.startsWith('alerte.example'));

    it('sends nothing after the first scan of a site: there is nothing to compare with', async () => {
      await scanWith([{ ruleId: 'image-alt', selector: 'img' }]);

      expect(alerts()).toEqual([]);
    });

    it('sends one e-mail to each member when defects appear, and never a second one', async () => {
      const scanId = await scanWith([
        { ruleId: 'image-alt', selector: 'img' },
        { ruleId: 'link-name', selector: 'a.vide' },
      ]);

      expect(
        alerts()
          .map(({ to }) => to)
          .sort(),
      ).toEqual([memberEmail, 'suivi@example.fr']);
      const [message] = alerts();
      expect(message?.subject).toBe('alerte.example : 1 nouveau défaut d’accessibilité');
      expect(message?.text).toContain('Lien sans intitulé (page /)');
      expect(message?.text).toContain('pré-audit automatique');
      expect(message?.text).toContain('105 critères restent à vérifier manuellement');
      expect(message?.text).toContain(`https://rampe.test/organisations/${org}/scans/${scanId}`);
      expect(message?.text).not.toMatch(/\bconformes?\b/i);

      // The closing message delivered again by the queue sends nothing more.
      await reportScan(harness, scanId, [analyzedPage('https://alerte.example/')]);
      expect(alerts()).toHaveLength(2);
      expect(
        await harness.prisma.notification.findMany({
          where: { scanId },
          select: { recipients: true },
        }),
      ).toEqual([{ recipients: 2 }]);
    });

    it('sends nothing when a scan finds no new defect, even if old ones remain or some are fixed', async () => {
      await scanWith([{ ruleId: 'image-alt', selector: 'img' }]);

      expect(alerts()).toEqual([]);
    });
  });

  describe('retention', () => {
    it('deletes the scans older than the retention period of their organisation, and only them', async () => {
      const keeper = await signedInAccount(harness, 'conservation@example.fr');
      await keeper.client
        .patch(`/orgs/${keeper.organizationId}`, { retentionMonths: 24 })
        .expect(200);
      const ownSite = await verifiedSite(harness, owner, org, 'https://ancien.example');
      const keptSite = await verifiedSite(
        harness,
        keeper.client,
        keeper.organizationId,
        'https://garde.example',
      );
      const scanAt = async (client: Client, organization: string, site: string, at: string) => {
        const { id } = (await client.post(`/orgs/${organization}/sites/${site}/scans`).expect(201))
          .body as { id: string };
        await reportScan(harness, id, [
          analyzedPage('https://ancien.example/', [{ ruleId: 'image-alt', selector: 'img' }]),
        ]);
        await harness.prisma.scan.update({ where: { id }, data: { createdAt: new Date(at) } });
        return id;
      };
      const old = await scanAt(owner, org, ownSite, '2025-09-01T00:00:00.000Z');
      const recent = await scanAt(owner, org, ownSite, '2025-11-01T00:00:00.000Z');
      const keptOld = await scanAt(
        keeper.client,
        keeper.organizationId,
        keptSite,
        '2025-09-01T00:00:00.000Z',
      );

      // Twelve months after 15 October 2025: only the September scan is older.
      harness.clock.set(new Date('2026-10-15T03:00:00.000Z'));
      await harness.app.get(Retention).purge();

      const remaining = await harness.prisma.scan.findMany({
        where: { id: { in: [old, recent, keptOld] } },
        select: { id: true },
      });
      expect(remaining.map(({ id }) => id).sort()).toEqual([recent, keptOld].sort());
      expect(await harness.prisma.finding.count({ where: { scanId: old } })).toBe(0);
      expect(await harness.prisma.scanPage.count({ where: { scanId: old } })).toBe(0);
    });
  });

  describe('pre-audit report', () => {
    let fakeWorker: Worker;
    const printed: string[] = [];

    beforeAll(() => {
      // Plays the worker's part: keeps the HTML and answers with a stand-in PDF.
      fakeWorker = new Worker(
        REPORTS_QUEUE,
        (job) => {
          printed.push((job.data as { html: string }).html);
          return Promise.resolve({ pdf: Buffer.from('%PDF-1.7 rapport').toString('base64') });
        },
        { connection: { url: harness.valkeyUrl } },
      );
    });

    afterAll(async () => {
      await fakeWorker.close();
    });

    it('gives the PDF of a finished scan, printed by the worker from the report HTML', async () => {
      harness.clock.set(new Date('2026-10-16T08:00:00.000Z'));
      const siteId = await verifiedSite(harness, owner, org, 'https://rapport.example');
      const { id } = (await owner.post(`/orgs/${org}/sites/${siteId}/scans`).expect(201)).body as {
        id: string;
      };
      await reportScan(harness, id, [
        analyzedPage('https://rapport.example/', [{ ruleId: 'image-alt', selector: 'img.logo' }]),
      ]);

      const response = await owner
        .get(`/orgs/${org}/scans/${id}/report.pdf`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            done(null, Buffer.concat(chunks));
          });
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="pre-audit-rapport.example-2026-10-14.pdf"',
      );
      expect((response.body as Buffer).toString()).toBe('%PDF-1.7 rapport');
      const html = printed.at(-1) ?? '';
      expect(html).toContain('Critère 1.1');
      expect(html).toContain('Critères à vérifier manuellement');
      expect(html).toContain('img.logo');
    });

    it('refuses the report of a scan that is not finished', async () => {
      const siteId = await verifiedSite(harness, owner, org, 'https://en-cours.example');
      const { id } = (await owner.post(`/orgs/${org}/sites/${siteId}/scans`).expect(201)).body as {
        id: string;
      };

      const response = await owner.get(`/orgs/${org}/scans/${id}/report.pdf`).expect(409);

      expect(response.body).toMatchObject({
        message: 'Le rapport n’est disponible que pour un scan terminé.',
      });
    });
  });
});
