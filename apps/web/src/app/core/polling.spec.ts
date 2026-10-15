import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { reloadWhile } from './polling';

describe('reloadWhile', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps reloading while the condition holds, and stops when it no longer does', () => {
    const active = signal(true);
    const reload = jest.fn(() => true);
    TestBed.runInInjectionContext(() => {
      reloadWhile(active, { reload }, 1000);
    });
    TestBed.tick();

    jest.advanceTimersByTime(3500);
    expect(reload).toHaveBeenCalledTimes(3);

    active.set(false);
    TestBed.tick();
    jest.advanceTimersByTime(5000);
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it('does nothing while the condition is false', () => {
    const reload = jest.fn(() => true);
    TestBed.runInInjectionContext(() => {
      reloadWhile(() => false, { reload }, 1000);
    });
    TestBed.tick();

    jest.advanceTimersByTime(5000);
    expect(reload).not.toHaveBeenCalled();
  });
});
