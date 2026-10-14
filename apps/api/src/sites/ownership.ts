import { resolveTxt } from 'node:dns/promises';

import { Injectable, Logger } from '@nestjs/common';

import { Queues } from '../infra/queues.js';

export const VERIFICATION_RECORD_PREFIX = '_rampe-verification';
export const VERIFICATION_FILE_PATH = '/.well-known/rampe-verification.txt';

/** Reads the TXT records of a name. A class so that tests can replace the DNS. */
export abstract class TxtResolver {
  abstract resolve(name: string): Promise<string[]>;
}

@Injectable()
export class SystemTxtResolver extends TxtResolver {
  async resolve(name: string): Promise<string[]> {
    try {
      // A TXT record may come in several chunks of 255 characters at most.
      return (await resolveTxt(name)).map((chunks) => chunks.join(''));
    } catch {
      return [];
    }
  }
}

export interface OwnershipProof {
  readonly verified: boolean;
  /** What was found, in French, for the person checking. */
  readonly detail: string;
}

/**
 * Checks that the owner of a site published its verification token. The API
 * reads the DNS itself (no connection to the site is made), but never fetches a
 * customer's URL: the worker does, through the egress proxy.
 */
@Injectable()
export class OwnershipVerifier {
  private readonly logger = new Logger(OwnershipVerifier.name);

  constructor(
    private readonly resolver: TxtResolver,
    private readonly queues: Queues,
  ) {}

  dnsRecord(host: string, token: string): { name: string; value: string } {
    return { name: `${VERIFICATION_RECORD_PREFIX}.${host}`, value: `rampe-verification=${token}` };
  }

  fileUrl(origin: string): string {
    return `${origin}${VERIFICATION_FILE_PATH}`;
  }

  async checkDns(host: string, token: string): Promise<OwnershipProof> {
    const { name, value } = this.dnsRecord(host, token);
    const records = await this.resolver.resolve(name);
    if (records.some((record) => record.trim() === value)) {
      return { verified: true, detail: `Enregistrement TXT trouvé sur ${name}.` };
    }
    return {
      verified: false,
      detail:
        records.length === 0
          ? `Aucun enregistrement TXT sur ${name}. La propagation DNS peut prendre jusqu’à quelques heures.`
          : `Des enregistrements TXT existent sur ${name}, mais aucun ne contient le jeton attendu.`,
    };
  }

  async checkFile(origin: string, token: string): Promise<OwnershipProof> {
    const url = this.fileUrl(origin);
    try {
      const answer = await this.queues.fetchThroughWorker(url, 30_000);
      if (answer.status === null) {
        return { verified: false, detail: `Le site n’a pas répondu à l’adresse ${url}.` };
      }
      if (answer.status !== 200) {
        return {
          verified: false,
          detail: `L’adresse ${url} répond avec le code HTTP ${String(answer.status)}.`,
        };
      }
      return answer.body?.trim() === token
        ? { verified: true, detail: `Fichier de vérification trouvé à ${url}.` }
        : {
            verified: false,
            detail: `Le fichier ${url} existe, mais ne contient pas le jeton attendu.`,
          };
    } catch (error) {
      this.logger.warn(
        `File check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        verified: false,
        detail: 'La vérification n’a pas pu aboutir. Réessayez dans un instant.',
      };
    }
  }
}
