import { Component } from '@angular/core';

import { ServiceStatus } from '../health/service-status';

@Component({
  selector: 'rampe-home-page',
  imports: [ServiceStatus],
  templateUrl: './home-page.html',
})
export class HomePage {}
