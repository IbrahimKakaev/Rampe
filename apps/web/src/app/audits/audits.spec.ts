import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { Audit, CriterionEvaluation } from '@rampe/shared';

import { AuditPage } from './audit-page';
import { CriterionForm } from './criterion-form';

const ORG = '0192f2b0-0000-7000-8000-0000000000aa';
const AUDIT = '0192f2b0-0000-7000-8000-0000000000bb';
const PAGE = '0192f2b0-0000-7000-8000-0000000000cc';
const SITE = '0192f2b0-0000-7000-8000-0000000000dd';

/** Lets responses be parsed and the requests that depend on them be sent. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }
}

const text = (element: Element): string => element.textContent.replace(/\s+/g, ' ');

const row = (overrides: Partial<CriterionEvaluation> = {}): CriterionEvaluation => ({
  criterion: '1.1',
  theme: 1,
  themeTitle: 'Images',
  title: 'Chaque image porteuse d’information a-t-elle une alternative textuelle ?',
  automation: 'partial',
  status: 'NC',
  origin: 'AUTOMATIC',
  note: null,
  proposal: 'NON_COMPLIANT',
  proposalRules: [{ ruleId: 'image-alt', title: 'Image sans alternative textuelle' }],
  author: null,
  updatedAt: null,
  ...overrides,
});

describe('manual audit', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  describe('CriterionForm', () => {
    function render(evaluation: CriterionEvaluation): HTMLElement {
      const fixture = TestBed.createComponent(CriterionForm);
      fixture.componentRef.setInput('org', ORG);
      fixture.componentRef.setInput('audit', AUDIT);
      fixture.componentRef.setInput('page', PAGE);
      fixture.componentRef.setInput('row', evaluation);
      TestBed.tick();
      return fixture.nativeElement as HTMLElement;
    }

    it('says a defect was found, which status it set, and how to overturn it', () => {
      const element = render(row());

      expect(text(element)).toContain('Statut actuel : non conforme, défaut détecté par le robot');
      expect(text(element)).toContain('Image sans alternative textuelle');
      expect(text(element)).toContain('expliquez pourquoi dans la note');
      expect(element.querySelector<HTMLInputElement>('input[value="NC"]')?.checked).toBe(true);
    });

    it('shows the « conforme » of the robot as a proposal, with no status checked', () => {
      const element = render(
        row({
          status: null,
          origin: null,
          proposal: 'COMPLIANT_TO_CONFIRM',
          automation: 'automatable',
        }),
      );

      expect(text(element)).toContain('Statut actuel : non évalué');
      expect(text(element)).toContain('Un test automatique ne suffit pas');
      expect(text(element)).toContain('Proposition du robot : conforme');
      expect(element.querySelector<HTMLInputElement>('input[value=""]')?.checked).toBe(true);
    });

    it('groups the statuses under a legend naming the criterion, and names its button after it', () => {
      const element = render(row());

      expect(element.querySelector('legend')?.textContent).toBe('Statut du critère 1.1');
      expect(
        Array.from(element.querySelectorAll('label'), (label) => label.textContent.trim()),
      ).toEqual([
        'Conforme',
        'Non conforme',
        'Non applicable',
        'Non évalué',
        'Note sur le critère 1.1',
      ]);
      expect(element.querySelector('button')?.textContent.trim()).toBe(
        'Enregistrer le critère 1.1',
      );
    });

    it('sends the chosen status and the note, « Non évalué » as no status', async () => {
      const element = render(row({ proposal: null, origin: null, status: null }));
      element.querySelector<HTMLInputElement>('input[value="NA"]')?.click();
      const note = element.querySelector('textarea');
      if (note !== null) {
        note.value = '  Aucune image sur la page.  ';
      }
      element.querySelector('form')?.requestSubmit();
      await settle();

      const request = http.expectOne(
        `/api/v1/orgs/${ORG}/audits/${AUDIT}/pages/${PAGE}/criteria/1.1`,
      );
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ status: 'NA', note: 'Aucune image sur la page.' });
      request.flush(row({ status: 'NA', origin: 'AUDITOR', proposal: null }));
      await settle();
      expect(text(element)).toContain('Critère 1.1 enregistré.');
    });
  });

  describe('AuditPage', () => {
    const audit = (complete: boolean): Audit => ({
      id: AUDIT,
      siteId: SITE,
      scanId: null,
      referentialVersion: '4.1.2',
      createdAt: '2026-10-16T08:00:00.000Z',
      pages: [
        {
          id: PAGE,
          position: 0,
          url: 'https://exemple.fr/',
          title: 'Accueil',
          scanned: true,
          evaluated: complete ? 106 : 100,
          expected: 106,
        },
      ],
      conformity: {
        evaluated: complete ? 106 : 100,
        expected: 106,
        complete,
        validated: complete ? 2 : 0,
        invalidated: complete ? 1 : 0,
        notApplicable: complete ? 103 : 0,
        rate: complete ? 2 / 3 : null,
        averageRate: complete ? 2 / 3 : null,
        state: complete ? 'partial' : null,
      },
    });

    async function render(complete: boolean): Promise<HTMLElement> {
      const fixture = TestBed.createComponent(AuditPage);
      fixture.componentRef.setInput('org', ORG);
      fixture.componentRef.setInput('audit', AUDIT);
      await settle();
      http.expectOne(`/api/v1/orgs/${ORG}/audits/${AUDIT}`).flush(audit(complete));
      await settle();
      http.expectOne(`/api/v1/orgs/${ORG}/sites/${SITE}`).flush({
        id: SITE,
        origin: 'https://exemple.fr',
        host: 'exemple.fr',
        verified: true,
        verificationMethod: 'DNS',
        verifiedAt: null,
        maxPages: 25,
        schedule: 'NONE',
        nextScanAt: null,
        createdAt: '2026-10-16T08:00:00.000Z',
        lastScan: null,
        trend: null,
      });
      await settle();
      return fixture.nativeElement as HTMLElement;
    }

    it('gives no rate while evaluations remain, and says how many', async () => {
      const element = await render(false);

      expect(text(element)).toContain('6 évaluations restent à faire sur 106');
      expect(text(element)).not.toContain('Taux de conformité RGAA');
    });

    it('gives the rates, to one decimal, and the state once the audit is complete', async () => {
      const element = await render(true);
      const figures = Object.fromEntries(
        Array.from(element.querySelectorAll('.figures > div'), (figure): [string, string] => [
          figure.querySelector('dt')?.textContent.trim() ?? '',
          figure
            .querySelector('dd')
            ?.textContent.trim()
            .replace(/\u202f|\u00a0/g, ' ') ?? '',
        ]),
      );

      expect(figures).toMatchObject({
        'Taux de conformité RGAA': '66,7 %',
        'Taux moyen des pages': '66,7 %',
        'État de conformité': 'Partiellement conforme',
      });
    });
  });
});
