/** A dependency the API can reach or not. `ping` rejects when it cannot. */
export interface Probe {
  ping(): Promise<void>;
}

export const DATABASE_PROBE = Symbol('DATABASE_PROBE');
export const QUEUE_PROBE = Symbol('QUEUE_PROBE');
