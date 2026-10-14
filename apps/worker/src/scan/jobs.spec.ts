import { describe, expect, it } from '@jest/globals';
import { SCAN_DEFAULTS, type ScanEvent, type ScanReport } from '@rampe/shared';

import { createScanJobHandler, createSiteCheckHandler } from './jobs.js';

const SCAN_ID = '0199c4b2-7a5e-7cc1-8f3e-2b9a1c0d4e5f';
const job = { scanId: SCAN_ID, url: 'http://fixture-site/', limits: SCAN_DEFAULTS };

const report: ScanReport = {
  target: 'http://fixture-site/',
  status: 'completed',
  reason: null,
  startedAt: '2026-10-14T08:00:00.000Z',
  finishedAt: '2026-10-14T08:00:10.000Z',
  engine: { axeVersion: '4.13.0', userAgent: 'RampeBot' },
  limits: SCAN_DEFAULTS,
  pages: [
    { status: 'failed', url: 'http://fixture-site/', depth: 0, error: 'timeout', httpStatus: null },
    {
      status: 'failed',
      url: 'http://fixture-site/a',
      depth: 1,
      error: 'timeout',
      httpStatus: null,
    },
  ],
  skipped: { disallowedByRobots: 0, beyondLimits: 0 },
};

function recorder() {
  const events: { event: ScanEvent; id: string }[] = [];
  return {
    events,
    emit: (event: ScanEvent, id: string) => {
      events.push({ event, id });
      return Promise.resolve();
    },
  };
}

describe('createScanJobHandler', () => {
  it('announces the scan, sends each page, then the end, with stable message ids', async () => {
    const { events, emit } = recorder();
    const handle = createScanJobHandler({
      runScan: () => Promise.resolve(report),
      emit,
      now: () => new Date('2026-10-14T08:00:00.000Z'),
    });

    await handle(job);

    expect(events.map(({ id }) => id)).toEqual([
      `${SCAN_ID}-started`,
      `${SCAN_ID}-page-0`,
      `${SCAN_ID}-page-1`,
      `${SCAN_ID}-finished`,
    ]);
    expect(events[1]?.event).toMatchObject({ type: 'page', position: 0, page: report.pages[0] });
    expect(events[3]?.event).toMatchObject({
      type: 'finished',
      pageCount: 2,
      report: { status: 'completed' },
    });
    expect(events[3]?.event).not.toHaveProperty('report.pages');
  });

  it('reports a crash instead of leaving the scan running', async () => {
    const { events, emit } = recorder();
    const handle = createScanJobHandler({
      runScan: () => Promise.reject(new Error('browser gone')),
      emit,
    });

    await handle(job);

    expect(events.map(({ event }) => event.type)).toEqual(['started', 'crashed']);
    expect(events[1]?.event).toMatchObject({ message: 'browser gone' });
  });

  it('refuses a malformed job', async () => {
    const { emit } = recorder();
    const handle = createScanJobHandler({ runScan: () => Promise.resolve(report), emit });

    await expect(handle({ scanId: 'nope', url: 'x' })).rejects.toThrow();
  });
});

describe('createSiteCheckHandler', () => {
  const gate = {
    turns: 0,
    wait() {
      this.turns += 1;
      return Promise.resolve();
    },
  };

  it('fetches the proof file, politely, and returns its status and body', async () => {
    const handle = createSiteCheckHandler({
      fetchText: (url) => Promise.resolve({ status: 200, url, body: 'jeton\n' }),
      gate,
      intervalMs: 1100,
    });

    await expect(
      handle({ url: 'http://fixture-site/.well-known/rampe-verification.txt' }),
    ).resolves.toEqual({
      status: 200,
      body: 'jeton\n',
    });
    expect(gate.turns).toBe(1);
  });

  it('says so when nothing answered', async () => {
    const handle = createSiteCheckHandler({
      fetchText: () => Promise.resolve(null),
      gate,
      intervalMs: 1100,
    });

    await expect(handle({ url: 'http://unreachable.example/x' })).resolves.toEqual({
      status: null,
      body: null,
    });
  });
});
