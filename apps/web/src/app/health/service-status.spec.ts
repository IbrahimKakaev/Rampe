import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { Subject } from 'rxjs';

import { HealthApi, type HealthState } from './health-api';
import { ServiceStatus } from './service-status';

describe('ServiceStatus', () => {
  let states: Subject<HealthState>;
  let fixture: ComponentFixture<ServiceStatus>;

  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent.replace(/\s+/g, ' ');

  const rows = (): Record<string, string> =>
    Object.fromEntries(
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('dl > div'), (row) => [
        row.querySelector('dt')?.textContent.trim() ?? '',
        row.querySelector('dd')?.textContent.trim() ?? '',
      ]),
    );

  beforeEach(async () => {
    states = new Subject<HealthState>();
    TestBed.configureTestingModule({
      providers: [{ provide: HealthApi, useValue: { load: () => states } }],
    });
    fixture = TestBed.createComponent(ServiceStatus);
    await fixture.whenStable();
  });

  it('says that the check is in progress until the API answers', () => {
    expect(text()).toContain('Vérification en cours…');
  });

  it('lists every dependency as online when all are up', async () => {
    states.next({
      kind: 'loaded',
      health: { status: 'ok', checks: { database: 'up', queue: 'up' } },
    });
    await fixture.whenStable();

    expect(rows()).toEqual({
      API: 'en ligne',
      'Base de données': 'en ligne',
      'File de tâches': 'en ligne',
    });
  });

  it('names the dependency that is down, in words and not only in colour', async () => {
    states.next({
      kind: 'loaded',
      health: { status: 'degraded', checks: { database: 'up', queue: 'down' } },
    });
    await fixture.whenStable();

    expect(rows()).toEqual({
      API: 'en ligne',
      'Base de données': 'en ligne',
      'File de tâches': 'hors ligne',
    });
  });

  it('says so when the API cannot be reached', async () => {
    states.next({ kind: 'unreachable' });
    await fixture.whenStable();

    expect(text()).toContain("L'API ne répond pas.");
  });

  it('announces changes to assistive technologies', () => {
    const live = (fixture.nativeElement as HTMLElement).querySelector('[aria-live]');

    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toContain('Vérification en cours…');
  });
});
