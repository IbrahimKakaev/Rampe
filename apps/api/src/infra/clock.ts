import { Injectable } from '@nestjs/common';

/**
 * The current time. Scheduling and retention depend on it; the tests replace
 * it to move time forward instead of waiting a day or a year.
 */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
