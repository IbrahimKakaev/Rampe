import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { ScanPage } from './scan-page';

const ORG = '0192f2b0-0000-7000-8000-0000000000aa';
const SCAN = '0192f2b0-0000-7000-8000-0000000000bb';
const SITE = '0192f2b0-0000-7000-8000-0000000000cc';
const PAGE = '0192f2b0-0000-7000-8000-0000000000dd';
const FINDING = '0192f2b0-0000-7000-8000-0000000000ee';
const BASE = `/api/v1/orgs/${ORG}`;

const scan = {
  id: SCAN,
  siteId: SITE,
  status: 'COMPLETED',
  reason: null,
  trigger: 'MANUAL',
  createdAt: '2026-10-15T10:00:00.000Z',
  startedAt: '2026-10-15T10:00:01.000Z',
  finishedAt: '2026-10-15T10:01:00.000Z',
  pageCount: 1,
  checks: { passed: 30, failed: 2, incomplete: 1 },
  score: 0.9375,
  criteriaToCheckManually: 105,
  findingsAdded: null,
  findingsFixed: null,
  referentialVersion: '4.1.2',
  axeVersion: '4.13.0',
};
const summary = {
  byCriterion: [{ key: '1.1', label: '1.1 Chaque image…', count: 1 }],
  byImpact: [{ key: 'critical', label: 'Critique', count: 2 }],
  byPage: [{ key: PAGE, label: '/', count: 2 }],
  withoutCriterion: 1,
};

/**
 * Lets responses be parsed and the requests that depend on them be sent.
 * Not `whenStable()`: it waits for the requests in flight, which only the test answers.
 */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }
}

describe('ScanPage', () => {
  let fixture: ComponentFixture<ScanPage>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ScanPage);
    fixture.componentRef.setInput('org', ORG);
    fixture.componentRef.setInput('scan', SCAN);
    element = fixture.nativeElement as HTMLElement;
    await settle();
    http.expectOne(`${BASE}/scans/${SCAN}`).flush(scan);
    http.expectOne(`${BASE}/scans/${SCAN}/pages`).flush([
      {
        id: PAGE,
        position: 0,
        url: 'http://site/',
        path: '/',
        depth: 0,
        status: 'ANALYZED',
        error: null,
        httpStatus: 200,
        title: 'Accueil',
        findingCount: 2,
        truncated: false,
      },
    ]);
    await settle();
    http.expectOne(`${BASE}/sites/${SITE}`).flush({
      id: SITE,
      origin: 'http://site',
      host: 'site',
      verified: true,
      verificationMethod: 'FILE',
      verifiedAt: '2026-10-15T09:00:00.000Z',
      maxPages: 25,
      schedule: 'NONE',
      createdAt: '2026-10-15T09:00:00.000Z',
      lastScan: null,
      trend: null,
    });
    http.expectOne(`${BASE}/scans/${SCAN}/findings/summary`).flush(summary);
    http.expectOne(`${BASE}/scans/${SCAN}/diff`).flush({
      previousScanId: '0192f2b0-0000-7000-8000-0000000000ff',
      added: [{ ruleId: 'link-name', title: 'Lien sans intitulé', pagePath: '/', selector: 'a' }],
      fixed: [],
      unchanged: 1,
      notCompared: 2,
    });
    await settle();
  });

  afterEach(() => {
    http.verify();
  });

  const groupLabels = (): string[] =>
    Array.from(element.querySelectorAll('.disclosure'), (button) =>
      button.textContent.replace(/\s+/g, ' ').trim(),
    );

  it('shows the score with the pre-audit notice', () => {
    expect(element.querySelector('[data-score]')).not.toBeNull();
    expect(element.querySelector('[data-pre-audit-notice]')?.textContent).toContain(
      '105 critères RGAA',
    );
  });

  it('offers the PDF report of the scan', () => {
    const link = Array.from(element.querySelectorAll('a')).find((anchor) =>
      anchor.textContent.includes('Télécharger le rapport'),
    );

    expect(link?.getAttribute('href')).toBe(`${BASE}/scans/${SCAN}/report.pdf`);
    expect(link?.hasAttribute('download')).toBe(true);
  });

  it('lists what changed since the previous scan, and says what could not be compared', () => {
    const text = element.textContent.replace(/\s+/g, ' ');

    expect(text).toContain(
      '1 nouveau défaut, 0 défaut corrigé et 1 défaut inchangé, sur les pages analysées dans les deux scans. 2 défauts ne sont pas comparés',
    );
    expect(text).toContain('Lien sans intitulé, page /, élément a');
  });

  it('groups the defects by RGAA criterion first, with those attached to none apart', () => {
    expect(groupLabels()).toEqual([
      '1.1 Chaque image…, 1 défaut',
      'Sans critère RGAA confirmé, 1 défaut',
    ]);
  });

  it('groups them by impact or by page on request', async () => {
    fixture.componentRef.setInput('groupe', 'gravite');
    await settle();
    expect(groupLabels()).toEqual(['Critique, 2 défauts']);

    fixture.componentRef.setInput('groupe', 'page');
    await settle();
    expect(groupLabels()).toEqual(['/, 2 défauts']);
  });

  it('loads the defects of a group when it is opened, and says it is open', async () => {
    const button = element.querySelectorAll<HTMLButtonElement>('.disclosure')[1];
    expect(button?.getAttribute('aria-expanded')).toBe('false');

    button?.click();
    await settle();
    http.expectOne(`${BASE}/scans/${SCAN}/findings?criterion=none&limit=500`).flush({
      total: 1,
      items: [
        {
          id: FINDING,
          pageId: PAGE,
          pagePath: '/',
          ruleId: 'aria-tooltip-name',
          title: 'Infobulle sans nom',
          impact: 'serious',
          selector: '#aide',
          html: '<div role="tooltip" id="aide"></div>',
          wcag: ['4.1.2'],
          rgaa: { criteria: [], uncertain: [], candidates: ['11.1'] },
          isNew: true,
        },
      ],
    });
    await settle();

    expect(button?.getAttribute('aria-expanded')).toBe('true');
    const panel = element.querySelector(`#${button?.getAttribute('aria-controls') ?? ''}`);
    const link = panel?.querySelector('a');
    expect(link?.textContent).toBe('Infobulle sans nom');
    expect(link?.getAttribute('href')).toBe(
      `/organisations/${ORG}/scans/${SCAN}/defauts/${FINDING}`,
    );
    expect(panel?.textContent).toContain('Nouveau');
    expect(panel?.textContent).toContain('Grave');
  });
});
