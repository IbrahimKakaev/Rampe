import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import { rgaaLinksOf } from '@rampe/rules';
import { type AnalyzedPage, HTML_SNIPPET_MAX_LENGTH, type ScanReport } from '@rampe/shared';

import {
  compose,
  egressLog,
  type FixtureRequest,
  inspectService,
  markFixtureLog,
  nodeIn,
  scan,
} from './support/compose.js';

/**
 * Acceptance tests of milestone J1, against the application started by Docker
 * Compose: the worker drives the isolated browser through the egress proxy,
 * and scans the test site.
 */

const SITE = 'http://fixture-site/';
const manifest = JSON.parse(
  readFileSync(new URL('../../apps/fixture-site/defects.json', import.meta.url), 'utf8'),
) as { defects: { page: string; rule: string; expectedRgaaCriterion: string }[] };

const pathOf = (url: string): string => new URL(url).pathname;
const isPageRequest = (request: FixtureRequest): boolean =>
  request.path !== '/robots.txt' && request.path !== '/sitemap.xml';

test.describe('a full scan of the test site', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  let report: ScanReport;
  let requests: FixtureRequest[];

  test.beforeAll(async () => {
    // A hook keeps the default timeout unless it sets its own.
    test.setTimeout(5 * 60_000);
    const readLog = await markFixtureLog();
    report = await scan(SITE);
    // The slow page is abandoned at 30 s but answers at 35 s: wait for its log line.
    await new Promise((resolve) => setTimeout(resolve, 6000));
    requests = await readLog();
  });

  test('completes, with the engine and user agent recorded', () => {
    expect(report.status).toBe('completed');
    expect(report.engine.axeVersion).toMatch(/^4\.\d+\.\d+$/);
    expect(report.engine.userAgent).toMatch(/RampeBot\/1\.0; \+https?:\/\/\S+\/robot\)$/);
  });

  test('detects every planted error on its page, with what is needed to fix it', () => {
    for (const defect of manifest.defects) {
      const page = report.pages.find((candidate) => pathOf(candidate.url) === defect.page);
      expect(page, defect.page).toMatchObject({ status: 'analyzed' });
      const violation = (page as AnalyzedPage).violations.find((v) => v.ruleId === defect.rule);
      expect(violation, `${defect.rule} on ${defect.page}`).toBeDefined();
      expect(violation?.impact).not.toBeNull();
      expect(violation?.wcag.length).toBeGreaterThan(0);
      for (const node of violation?.nodes ?? []) {
        expect(node.selector).not.toBe('');
        expect(node.html.length).toBeGreaterThan(0);
        expect(node.html.length).toBeLessThanOrEqual(HTML_SNIPPET_MAX_LENGTH);
      }
    }
  });

  test('attaches every planted error to the expected RGAA criterion, with certainty', () => {
    for (const defect of manifest.defects) {
      const page = report.pages.find(
        (candidate) => pathOf(candidate.url) === defect.page,
      ) as AnalyzedPage;
      for (const violation of page.violations) {
        expect(rgaaLinksOf(violation.ruleId).links, defect.page).toEqual([
          expect.objectContaining({ criterion: defect.expectedRgaaCriterion, status: 'confirmed' }),
        ]);
      }
    }
  });

  test('finds nothing on the pages without planted errors', () => {
    const planted = new Set(manifest.defects.map((defect) => defect.page));
    const clean = report.pages.filter(
      (page): page is AnalyzedPage => page.status === 'analyzed' && !planted.has(pathOf(page.url)),
    );
    expect(clean.map((page) => pathOf(page.url))).toEqual(
      expect.arrayContaining(['/', '/page-propre.html', '/plan-du-site-seulement.html']),
    );
    for (const page of clean) {
      expect(page.violations, pathOf(page.url)).toEqual([]);
    }
    for (const page of report.pages.filter((p): p is AnalyzedPage => p.status === 'analyzed')) {
      const others = page.violations.filter(
        (v) => !manifest.defects.some((d) => d.page === pathOf(page.url) && d.rule === v.ruleId),
      );
      expect(others, pathOf(page.url)).toEqual([]);
    }
  });

  test('gives up on the page that takes more than 30 seconds, without failing the scan', () => {
    expect(report.pages.find((page) => pathOf(page.url) === '/lent.html')).toMatchObject({
      status: 'failed',
      error: 'timeout',
    });
    const slow = requests.find((request) => request.path === '/lent.html');
    expect(slow?.durationMs).toBeGreaterThanOrEqual(29_000);
  });

  test('does not follow a redirect to an internal address: the proxy blocks it', async () => {
    expect(report.pages.find((page) => pathOf(page.url) === '/redirection-interne')).toMatchObject({
      status: 'failed',
      error: 'blocked',
    });
    expect(await egressLog()).toContainEqual(
      expect.objectContaining({ event: 'blocked', hostname: '169.254.169.254', port: 80 }),
    );
  });

  test('identifies itself with the RampeBot user agent on every request', () => {
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.userAgent, request.path).toBe(report.engine.userAgent);
    }
  });

  test('reads robots.txt and the sitemap, and obeys robots.txt', () => {
    const paths = requests.map((request) => request.path);
    expect(paths[0]).toBe('/robots.txt');
    expect(paths).toContain('/sitemap.xml');
    expect(paths).toContain('/plan-du-site-seulement.html');
    expect(paths.filter((path) => path.startsWith('/prive/'))).toEqual([]);
    expect(paths).not.toContain('/interdit-a-rampebot.html');
    expect(report.skipped.disallowedByRobots).toBe(2);
  });

  test('never goes deeper than 3 links from the home page', () => {
    const paths = requests.map((request) => request.path);
    expect(paths).toContain('/profondeur/niveau-3.html');
    expect(paths).not.toContain('/profondeur/niveau-4.html');
  });

  test('leaves at least one second between two requests to the site', () => {
    const starts = requests.map((request) => Date.parse(request.time)).sort((a, b) => a - b);
    const gaps = starts.slice(1).map((start, index) => start - (starts[index] ?? start));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1000);
  });

  test('loads two pages at the same time at most, and does use that parallelism', () => {
    const pages = requests.filter(isPageRequest);
    const events = pages.flatMap((request) => {
      const start = Date.parse(request.time);
      return [
        { at: start, delta: 1 },
        { at: start + request.durationMs, delta: -1 },
      ];
    });
    // A static page is served in under a millisecond: its request starts and ends at the same
    // logged time. Opening before closing at equal times keeps it counted while another is open.
    events.sort((a, b) => a.at - b.at || b.delta - a.delta);
    let open = 0;
    let most = 0;
    for (const event of events) {
      open += event.delta;
      most = Math.max(most, open);
    }
    expect(most).toBe(2);
  });

  test('requests no page twice', () => {
    const pages = requests.filter(isPageRequest).map((request) => request.path);
    expect(new Set(pages).size).toBe(pages.length);
  });
});

test.describe('scan limits', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test('stops at the page limit, counting navigations', async () => {
    const readLog = await markFixtureLog();

    const report = await scan(SITE, ['--max-pages', '5']);

    expect(report).toMatchObject({ status: 'completed', reason: 'page-limit' });
    expect(report.pages).toHaveLength(5);
    expect((await readLog()).filter(isPageRequest)).toHaveLength(5);
  });

  test('stops at the scan time limit and reports a partial scan', async () => {
    const started = Date.now();

    const report = await scan(SITE, ['--scan-timeout-ms', '5000']);

    expect(report).toMatchObject({ status: 'partial', reason: 'scan-timeout' });
    expect(report.skipped.beyondLimits).toBeGreaterThan(0);
    // The scan itself, without starting the command, stays within its limit.
    expect(Date.parse(report.finishedAt) - Date.parse(report.startedAt)).toBeLessThan(5000 + 1500);
    expect(Date.now() - started).toBeLessThan(60_000);
  });
});

test.describe('internal addresses given as the target', () => {
  for (const target of [
    'http://169.254.169.254/',
    'http://api/',
    'http://127.0.0.1/',
    'http://[::1]/',
  ]) {
    test(`refuses to scan ${target}: nothing is fetched, the site is reported unreachable`, async () => {
      const report = await scan(target);

      expect(report).toMatchObject({ status: 'failed', reason: 'site-unreachable', pages: [] });
    });
  }

  test('refuses a target on another port than 80 or 443 before doing anything', async () => {
    const result = await compose([
      'exec',
      '-T',
      'worker',
      'node',
      'dist/scan-cli.js',
      'http://api:3000/',
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('port 80 or 443');
  });
});

test.describe('isolation of the browser', () => {
  test('cannot reach the database, the queue, the API, the interface or the Internet', async () => {
    const reachability = JSON.parse(
      await nodeIn(
        'browser',
        `const net = require('node:net');
         const targets = [['postgres', 5432], ['valkey', 6379], ['api', 3000], ['web', 8080],
           ['fixture-site', 80], ['1.1.1.1', 443], ['egress-proxy', 3128]];
         Promise.all(targets.map(([host, port]) => new Promise((resolve) => {
           const socket = net.connect({ host, port, timeout: 3000 });
           socket.on('connect', () => { socket.destroy(); resolve([host, 'reachable']); });
           socket.on('timeout', () => { socket.destroy(); resolve([host, 'timeout']); });
           socket.on('error', (error) => resolve([host, error.code]));
         }))).then((results) => console.log(JSON.stringify(Object.fromEntries(results))));`,
      ),
    ) as Record<string, string>;

    // The egress proxy is its only way out.
    expect(reachability['egress-proxy']).toBe('reachable');
    for (const target of ['postgres', 'valkey', 'api', 'web', 'fixture-site', '1.1.1.1']) {
      expect(reachability[target], target).not.toBe('reachable');
    }
  });

  test('runs Chromium with its sandbox: renderers live in their own user namespace', async () => {
    const processes = JSON.parse(
      await nodeIn(
        'browser',
        `const fs = require('node:fs');
         const ns = (pid) => { try { return fs.readlinkSync('/proc/' + pid + '/ns/user'); } catch (e) { return e.code; } };
         const list = fs.readdirSync('/proc').filter((d) => /^\\d+$/.test(d)).flatMap((pid) => {
           try { return [{ pid, ns: ns(pid), args: fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\\0').filter(Boolean) }]; }
           catch { return []; }
         });
         console.log(JSON.stringify(list.filter((p) => /chrom/.test(p.args[0] || ''))));`,
      ),
    ) as { pid: string; ns: string; args: string[] }[];

    // Chromium rewrites the title of its zygotes: their whole command line may sit in one argument.
    const commandLine = (process: { args: string[] }): string => process.args.join(' ');
    const main = processes.find((process) => !commandLine(process).includes('--type='));
    const sandboxedZygote = processes.find(
      (process) =>
        commandLine(process).includes('--type=zygote') &&
        !commandLine(process).includes('--no-zygote-sandbox'),
    );
    expect(main?.args).not.toContain('--no-sandbox');
    expect(main?.args).toEqual(expect.arrayContaining(['--proxy-server=http://egress-proxy:3128']));
    expect(sandboxedZygote).toBeDefined();
    expect(sandboxedZygote?.ns).toMatch(/^user:\[\d+\]$/);
    expect(sandboxedZygote?.ns).not.toBe(main?.ns);
  });

  test('runs with CPU, memory and process limits, without privileges', async () => {
    const { HostConfig, Config } = await inspectService('browser');

    expect(HostConfig['Memory']).toBe(1536 * 1024 * 1024);
    expect(HostConfig['NanoCpus']).toBe(2_000_000_000);
    expect(HostConfig['PidsLimit']).toBe(512);
    expect(HostConfig['ReadonlyRootfs']).toBe(true);
    expect(HostConfig['CapDrop']).toEqual(['ALL']);
    expect(HostConfig['CapAdd']).toEqual(['CAP_SYS_CHROOT']);
    expect(HostConfig['SecurityOpt']).toEqual(
      expect.arrayContaining(['no-new-privileges:true', expect.stringMatching(/^seccomp=/)]),
    );
    expect(Config['User']).toBe('pwuser');
  });
});

test.describe('egress proxy configuration', () => {
  test('refuses to start in production with private hosts allowed', async () => {
    const result = await compose([
      'run',
      '--rm',
      '--no-deps',
      '-T',
      '-e',
      'NODE_ENV=production',
      'egress-proxy',
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toContain(
      'EGRESS_ALLOWED_PRIVATE_HOSTS must be empty in production',
    );
  });
});
