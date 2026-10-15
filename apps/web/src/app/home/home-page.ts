import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { webPath } from '@rampe/shared';

import { Session } from '../core/session';
import { ServiceStatus } from '../health/service-status';

@Component({
  selector: 'rampe-home-page',
  imports: [RouterLink, ServiceStatus],
  templateUrl: './home-page.html',
})
export class HomePage {
  protected readonly session = inject(Session);
  protected readonly paths = {
    dashboard: webPath('dashboard'),
    register: webPath('register'),
    login: webPath('login'),
  };
}
