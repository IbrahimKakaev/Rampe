import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';

import { QueueConnection } from '../infra/queue-connection.js';
import type { RampeRequest } from './request-context.js';

export interface RateLimitOptions {
  /** Requests allowed per window, per route and per client address. */
  readonly limit: number;
  readonly windowMs: number;
  /** Once the limit is passed, how long the client stays blocked. */
  readonly blockMs: number;
}

/** A ceiling for every route; sign-in routes set a much lower one. */
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 300, windowMs: 60_000, blockMs: 0 };

const RATE_LIMIT = 'rampe:rate-limit';
export const RateLimit = (options: RateLimitOptions | 'none'): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT, options);

/**
 * Counts in Valkey, so that every API instance shares the counters. One Lua
 * script makes the count, its expiry and the block atomic.
 */
const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3], 'NX')
end
return {hits, redis.call('PTTL', KEYS[1]), redis.call('PTTL', KEYS[2])}
`;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly valkey: QueueConnection,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions | 'none' | undefined>(RATE_LIMIT, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_RATE_LIMIT;
    if (options === 'none') {
      return true;
    }
    const request = context.switchToHttp().getRequest<RampeRequest>();
    const base = `rampe:rate:${context.getClass().name}:${context.getHandler().name}:${request.ip ?? 'unknown'}`;
    let counts: [number, number, number];
    try {
      counts = (await this.valkey.eval(
        SCRIPT,
        [`${base}:hits`, `${base}:blocked`],
        [options.windowMs, options.limit, options.blockMs],
      )) as [number, number, number];
    } catch (error) {
      // Without its counters, the API cannot protect the sign-in routes: it refuses
      // rather than letting password guessing through.
      this.logger.warn(
        `Rate limiting unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Service momentanément indisponible : réessayez dans un instant.',
      );
    }
    const [hits, windowLeftMs, blockLeftMs] = counts;
    if (blockLeftMs > 0 || hits > options.limit) {
      const waitSeconds = Math.max(Math.ceil(Math.max(blockLeftMs, windowLeftMs) / 1000), 1);
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(waitSeconds));
      throw new HttpException(
        `Trop de requêtes : réessayez dans ${String(waitSeconds)} secondes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
