import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { SCANS_QUEUE, SITE_CHECKS_QUEUE } from '@rampe/shared';
import { Queue, Worker } from 'bullmq';

import { NotYetError, ScanRecorder } from '../src/scans/scan-recorder.js';
import { analyzedPage, reportScan, verifiedSite } from './support/fixtures.js';
import { type Client, type Harness, signedInAccount, startHarness } from './support/harness.js';

describe('sites and scans', () => {
  let harness: Harness;
  let client: Client;
  let org: string;
  let fileAnswers: Map<string, { status: number | null; body: string | null }>;
  let fakeWorker: Worker;

  beforeAll(async () => {
    harness = await startHarness();
    ({ client, organizationId: org } = await signedInAccount(harness, 'owner@example.fr'));
    // Plays the worker's part for file checks: answers from a table.
    fileAnswers = new Map();
    fakeWorker = new Worker(
      SITE_CHECKS_QUEUE,
      (job) =>
        Promise.resolve(
          fileAnswers.get((job.data as { url: string }).url) ?? { status: 404, body: 'Not Found' },
        ),
      { connection: { url: harness.valkeyUrl } },
    );
  });

  afterAll(async () => {
    await fakeWorker.close();
    await harness.close();
  });

  describe('sites', () => {
    it('records a site by its origin, once', async () => {
      const site = await client
        .post(`/orgs/${org}/sites`, { url: 'https://WWW.Example.fr/accueil?x=1' })
        .expect(201);

      expect(site.body).toMatchObject({
        origin: 'https://www.example.fr',
        host: 'www.example.fr',
        verified: false,
        maxPages: 25,
        schedule: 'NONE',
        lastScan: null,
      });
      await client.post(`/orgs/${org}/sites`, { url: 'https://www.example.fr/' }).expect(409);
      await client.post(`/orgs/${org}/sites`, { url: 'ftp://www.example.fr/' }).expect(400);
      await client.post(`/orgs/${org}/sites`, { url: 'https://www.example.fr:8443/' }).expect(409);
    });

    it('gives the token to publish, by DNS or by file', async () => {
      const site = (
        await client.post(`/orgs/${org}/sites`, { url: 'https://instructions.example' }).expect(201)
      ).body as { id: string };

      const instructions = (
        await client.get(`/orgs/${org}/sites/${site.id}/verification`).expect(200)
      ).body as {
        token: string;
        dns: { type: string; name: string; value: string };
        file: { url: string; content: string };
      };

      expect(instructions.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(instructions.dns).toEqual({
        type: 'TXT',
        name: '_rampe-verification.instructions.example',
        value: `rampe-verification=${instructions.token}`,
      });
      expect(instructions.file).toEqual({
        url: 'https://instructions.example/.well-known/rampe-verification.txt',
        content: instructions.token,
      });
    });

    it('verifies ownership by DNS only when the record holds the token', async () => {
      const site = (
        await client.post(`/orgs/${org}/sites`, { url: 'https://dns.example' }).expect(201)
      ).body as { id: string };
      const { dns, token } = (await client.get(`/orgs/${org}/sites/${site.id}/verification`))
        .body as { dns: { name: string; value: string }; token: string };

      const absent = await client
        .post(`/orgs/${org}/sites/${site.id}/verification/check`, { method: 'DNS' })
        .expect(200);
      expect(absent.body).toMatchObject({
        verified: false,
        detail: expect.stringContaining('Aucun enregistrement TXT'),
      });
      harness.dns.records.set(dns.name, ['v=spf1 -all', 'rampe-verification=autre-chose']);
      const wrong = await client
        .post(`/orgs/${org}/sites/${site.id}/verification/check`, { method: 'DNS' })
        .expect(200);
      expect(wrong.body).toMatchObject({
        verified: false,
        detail: expect.stringContaining('aucun ne contient le jeton'),
      });
      harness.dns.records.set(dns.name, ['v=spf1 -all', `rampe-verification=${token}`]);
      const right = await client
        .post(`/orgs/${org}/sites/${site.id}/verification/check`, { method: 'DNS' })
        .expect(200);
      expect(right.body).toMatchObject({ verified: true, method: 'DNS' });
      expect((await client.get(`/orgs/${org}/sites/${site.id}`)).body).toMatchObject({
        verified: true,
        verificationMethod: 'DNS',
      });
    });

    it('verifies ownership by file through the worker, never by fetching the site itself', async () => {
      const site = (
        await client.post(`/orgs/${org}/sites`, { url: 'https://file.example' }).expect(201)
      ).body as { id: string };
      const { file, token } = (await client.get(`/orgs/${org}/sites/${site.id}/verification`))
        .body as { file: { url: string }; token: string };

      const missing = await client
        .post(`/orgs/${org}/sites/${site.id}/verification/check`, { method: 'FILE' })
        .expect(200);
      expect(missing.body).toMatchObject({
        verified: false,
        detail: expect.stringContaining('code HTTP 404'),
      });
      fileAnswers.set(file.url, { status: null, body: null });
      const down = await client
        .post(`/orgs/${org}/sites/${site.id}/verification/check`, { method: 'FILE' })
        .expect(200);
      expect(down.body).toMatchObject({
        verified: false,
        detail: expect.stringContaining('n’a pas répondu'),
      });
      fileAnswers.set(file.url, { status: 200, body: `${token}\n` });
      const found = await client
        .post(`/orgs/${org}/sites/${site.id}/verification/check`, { method: 'FILE' })
        .expect(200);
      expect(found.body).toMatchObject({ verified: true, method: 'FILE' });
    });
  });

  describe('starting a scan', () => {
    it('refuses to scan a site whose ownership is not proven', async () => {
      const site = (
        await client.post(`/orgs/${org}/sites`, { url: 'https://unproven.example' }).expect(201)
      ).body as { id: string };

      const response = await client.post(`/orgs/${org}/sites/${site.id}/scans`).expect(409);

      expect(JSON.stringify(response.body)).toContain('Vérifiez d’abord');
      expect(await harness.prisma.scan.count({ where: { siteId: site.id } })).toBe(0);
    });

    it('queues a scan of the site with its limits, one at a time', async () => {
      const siteId = await verifiedSite(harness, client, org, 'https://queued.example');
      await client.patch(`/orgs/${org}/sites/${siteId}`, { maxPages: 7 }).expect(200);

      const scan = (await client.post(`/orgs/${org}/sites/${siteId}/scans`).expect(201)).body as {
        id: string;
        status: string;
        criteriaToCheckManually: number;
      };
      expect(scan).toMatchObject({ status: 'QUEUED', criteriaToCheckManually: 105 });
      const queue = new Queue(SCANS_QUEUE, { connection: { url: harness.valkeyUrl } });
      const job = await queue.getJob(scan.id);
      await queue.close();
      expect(job?.data).toMatchObject({
        scanId: scan.id,
        url: 'https://queued.example/',
        limits: { maxPages: 7, maxDepth: 3 },
      });

      await client.post(`/orgs/${org}/sites/${siteId}/scans`).expect(409);
    });

    it('checks the proof again, and unverifies a site whose proof is gone', async () => {
      const siteId = await verifiedSite(harness, client, org, 'https://gone.example');
      harness.dns.records.delete('_rampe-verification.gone.example');

      const response = await client.post(`/orgs/${org}/sites/${siteId}/scans`).expect(409);

      expect(JSON.stringify(response.body)).toContain('n’est plus en place');
      expect((await client.get(`/orgs/${org}/sites/${siteId}`)).body).toMatchObject({
        verified: false,
      });
    });
  });

  describe('recording what the worker reports', () => {
    const start = async (url: string) => {
      const siteId = await verifiedSite(harness, client, org, url);
      const scan = (await client.post(`/orgs/${org}/sites/${siteId}/scans`).expect(201)).body as {
        id: string;
      };
      return { siteId, scanId: scan.id };
    };

    it('stores pages and defects with their RGAA criteria, fingerprints and correction, and the score', async () => {
      const { scanId } = await start('https://recorded.example');

      await reportScan(harness, scanId, [
        analyzedPage('https://recorded.example/', [
          { ruleId: 'image-alt', selector: 'img:nth-child(2)' },
        ]),
        analyzedPage('https://recorded.example/contact', [
          { ruleId: 'aria-tooltip-name', selector: '#aide' },
        ]),
        {
          status: 'failed',
          url: 'https://recorded.example/lent',
          depth: 1,
          error: 'timeout',
          httpStatus: null,
        },
      ]);

      const scan = (await client.get(`/orgs/${org}/scans/${scanId}`).expect(200)).body as Record<
        string,
        unknown
      >;
      // Two analysed pages: 2 rules passed and 1 failed on each.
      expect(scan).toMatchObject({
        status: 'COMPLETED',
        pageCount: 3,
        checks: { passed: 4, failed: 2, incomplete: 0 },
        score: 4 / 6,
        findingsAdded: null,
      });
      const pages = (await client.get(`/orgs/${org}/scans/${scanId}/pages`).expect(200)).body as {
        path: string;
        status: string;
        error: string | null;
      }[];
      expect(pages.map(({ path, status, error }) => `${path} ${status} ${String(error)}`)).toEqual([
        '/ ANALYZED null',
        '/contact ANALYZED null',
        '/lent FAILED timeout',
      ]);

      const findings = (await client.get(`/orgs/${org}/scans/${scanId}/findings`).expect(200))
        .body as {
        total: number;
        items: { id: string; ruleId: string; title: string | null; rgaa: unknown }[];
      };
      expect(findings.total).toBe(2);
      // The list names each defect in French, from the corrections content.
      expect(findings.items.find((finding) => finding.ruleId === 'image-alt')?.title).toBe(
        'Image sans alternative textuelle',
      );
      expect(findings.items.find((finding) => finding.ruleId === 'image-alt')?.rgaa).toEqual({
        criteria: ['1.1'],
        uncertain: [],
        candidates: [],
      });
      expect(
        findings.items.find((finding) => finding.ruleId === 'aria-tooltip-name')?.rgaa,
      ).toMatchObject({ criteria: [], candidates: expect.arrayContaining(['11.1']) });

      const imageAlt = findings.items.find((finding) => finding.ruleId === 'image-alt')?.id ?? '';
      const detail = (
        await client.get(`/orgs/${org}/scans/${scanId}/findings/${imageAlt}`).expect(200)
      ).body as Record<string, unknown>;
      expect(detail).toMatchObject({
        fingerprint: 'image-alt|/|img|1',
        correction: { title: 'Image sans alternative textuelle' },
        criterionTitles: { '1.1': expect.stringContaining('alternative textuelle') },
      });

      const summary = (
        await client.get(`/orgs/${org}/scans/${scanId}/findings/summary`).expect(200)
      ).body as Record<string, unknown>;
      expect(summary).toMatchObject({
        byCriterion: [{ key: '1.1', count: 1 }],
        byImpact: [{ key: 'critical', label: 'Critique', count: 2 }],
        withoutCriterion: 1,
      });
      const filtered = (
        await client.get(`/orgs/${org}/scans/${scanId}/findings?criterion=1.1`).expect(200)
      ).body as { total: number };
      expect(filtered.total).toBe(1);
      const unattached = (
        await client.get(`/orgs/${org}/scans/${scanId}/findings?criterion=none`).expect(200)
      ).body as { items: { ruleId: string }[] };
      expect(unattached.items.map(({ ruleId }) => ruleId)).toEqual(['aria-tooltip-name']);
      await client.get(`/orgs/${org}/scans/${scanId}/findings?impact=fatal`).expect(400);
    });

    it('records each message once, even when it arrives twice', async () => {
      const { scanId } = await start('https://twice.example');
      const page = analyzedPage('https://twice.example/', [
        { ruleId: 'image-alt', selector: 'img' },
      ]);
      const recorder = harness.app.get(ScanRecorder);

      await recorder.record({ type: 'page', scanId, position: 0, page });
      await recorder.record({ type: 'page', scanId, position: 0, page });

      expect(await harness.prisma.scanPage.count({ where: { scanId } })).toBe(1);
      expect(await harness.prisma.finding.count({ where: { scanId } })).toBe(1);
    });

    it('waits for every page before closing a scan', async () => {
      const { scanId } = await start('https://early.example');
      const recorder = harness.app.get(ScanRecorder);

      await expect(
        recorder.record({
          type: 'finished',
          scanId,
          pageCount: 2,
          report: {
            target: 'https://early.example/',
            status: 'completed',
            reason: null,
            startedAt: '2026-10-14T08:00:00.000Z',
            finishedAt: '2026-10-14T08:00:30.000Z',
            engine: { axeVersion: '4.13.0', userAgent: 'RampeBot' },
            limits: {
              maxPages: 25,
              maxDepth: 3,
              concurrency: 2,
              pageTimeoutMs: 30000,
              scanTimeoutMs: 900000,
              navigationIntervalMs: 1100,
            },
            skipped: { disallowedByRobots: 0, beyondLimits: 0 },
          },
        }),
      ).rejects.toThrow(NotYetError);
      expect((await client.get(`/orgs/${org}/scans/${scanId}`)).body).toMatchObject({
        status: 'QUEUED',
        score: null,
      });
    });

    it('marks a scan whose engine crashed as failed', async () => {
      const { scanId } = await start('https://crash.example');

      await harness.app
        .get(ScanRecorder)
        .record({ type: 'crashed', scanId, message: 'browser gone' });

      expect((await client.get(`/orgs/${org}/scans/${scanId}`)).body).toMatchObject({
        status: 'FAILED',
        reason: 'engine-error',
      });
    });

    it('compares with the previous scan, only on pages analysed by both', async () => {
      const { siteId, scanId: first } = await start('https://compared.example');
      await reportScan(harness, first, [
        analyzedPage('https://compared.example/', [{ ruleId: 'image-alt', selector: 'img' }]),
        analyzedPage('https://compared.example/contact', [{ ruleId: 'label', selector: 'input' }]),
      ]);
      const second = (
        (await client.post(`/orgs/${org}/sites/${siteId}/scans`).expect(201)).body as { id: string }
      ).id;
      await reportScan(harness, second, [
        analyzedPage('https://compared.example/', [
          { ruleId: 'image-alt', selector: 'img' },
          { ruleId: 'link-name', selector: 'a' },
        ]),
        // The contact page timed out: its defect is not "fixed".
        {
          status: 'failed',
          url: 'https://compared.example/contact',
          depth: 1,
          error: 'timeout',
          httpStatus: null,
        },
      ]);

      expect((await client.get(`/orgs/${org}/scans/${second}`)).body).toMatchObject({
        findingsAdded: 1,
        findingsFixed: 0,
      });
      const diff = (await client.get(`/orgs/${org}/scans/${second}/diff`).expect(200))
        .body as Record<string, unknown>;
      expect(diff).toEqual({
        previousScanId: first,
        added: [{ ruleId: 'link-name', pagePath: '/', selector: 'a' }],
        fixed: [],
        unchanged: 1,
        notCompared: 1,
      });
      const findings = (await client.get(`/orgs/${org}/scans/${second}/findings`)).body as {
        items: { ruleId: string; isNew: boolean }[];
      };
      expect(
        findings.items.map(({ ruleId, isNew }) => `${ruleId}:${String(isNew)}`).sort(),
      ).toEqual(['image-alt:false', 'link-name:true']);
      const site = (await client.get(`/orgs/${org}/sites/${siteId}`)).body as {
        trend: number | null;
        lastScan: { id: string; criteriaToCheckManually: number };
      };
      expect(site.lastScan.id).toBe(second);
      expect(site.lastScan.criteriaToCheckManually).toBe(105);
      expect(site.trend).not.toBeNull();
    });
  });
});
