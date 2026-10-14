import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { DependencyStatus } from '@rampe/shared';

import { HealthApi, type HealthState } from './health-api';

const LABELS: Readonly<Record<DependencyStatus, string>> = {
  up: 'en ligne',
  down: 'hors ligne',
};

@Component({
  selector: 'rampe-service-status',
  templateUrl: './service-status.html',
  styleUrl: './service-status.css',
})
export class ServiceStatus {
  private static readonly loading: HealthState = { kind: 'loading' };

  protected readonly state = toSignal(inject(HealthApi).load(), {
    initialValue: ServiceStatus.loading,
  });

  protected label(status: DependencyStatus): string {
    return LABELS[status];
  }
}
