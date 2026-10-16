import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { criteriaToCheckManually } from '@rampe/rules';
import type { Site, VerificationResult } from '@rampe/shared';

import type { VerificationMethod } from '../generated/prisma/client.js';
import { Clock } from '../infra/clock.js';
import { Prisma } from '../infra/prisma.js';
import { nextScanAt } from '../scans/schedule.js';
import { newToken } from '../security/secrets.js';
import { OwnershipVerifier } from './ownership.js';

const FINISHED = ['COMPLETED', 'PARTIAL'] as const;

/** Normalises the address of a site to its origin, or refuses it. */
export function siteOrigin(url: string): { origin: string; host: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !['', '80', '443'].includes(parsed.port)) {
    return null;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return null;
  }
  return { origin: parsed.origin, host: parsed.hostname };
}

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: Prisma,
    private readonly ownership: OwnershipVerifier,
    private readonly clock: Clock,
  ) {}

  async list(organizationId: string): Promise<Site[]> {
    const sites = await this.prisma.site.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(sites.map((site) => this.toSite(site)));
  }

  async get(organizationId: string, siteId: string): Promise<Site> {
    return this.toSite(await this.find(organizationId, siteId));
  }

  async create(organizationId: string, url: string): Promise<Site> {
    const address = siteOrigin(url);
    if (address === null) {
      throw new ConflictException('L’adresse doit être en http ou https, sur le port 80 ou 443.');
    }
    const existing = await this.prisma.site.findUnique({
      where: { organizationId_origin: { organizationId, origin: address.origin } },
    });
    if (existing !== null) {
      throw new ConflictException('Ce site est déjà enregistré dans l’organisation.');
    }
    const site = await this.prisma.site.create({
      data: {
        organizationId,
        origin: address.origin,
        host: address.host,
        verificationToken: newToken(),
      },
    });
    return this.toSite(site);
  }

  async update(
    organizationId: string,
    siteId: string,
    changes: { maxPages?: number | undefined; schedule?: 'NONE' | 'DAILY' | 'WEEKLY' | undefined },
  ): Promise<Site> {
    const current = await this.find(organizationId, siteId);
    // A new schedule starts from now; the same one sent again keeps its next scan.
    const rescheduled = changes.schedule !== undefined && changes.schedule !== current.schedule;
    const site = await this.prisma.site.update({
      where: { id: siteId },
      data: {
        ...(changes.maxPages === undefined ? {} : { maxPages: changes.maxPages }),
        ...(changes.schedule === undefined || !rescheduled
          ? {}
          : {
              schedule: changes.schedule,
              nextScanAt: nextScanAt(changes.schedule, this.clock.now()),
            }),
      },
    });
    return this.toSite(site);
  }

  async delete(organizationId: string, siteId: string): Promise<void> {
    await this.find(organizationId, siteId);
    await this.prisma.site.delete({ where: { id: siteId } });
  }

  async instructions(organizationId: string, siteId: string) {
    const site = await this.find(organizationId, siteId);
    return {
      token: site.verificationToken,
      dns: { type: 'TXT' as const, ...this.ownership.dnsRecord(site.host, site.verificationToken) },
      file: { url: this.ownership.fileUrl(site.origin), content: site.verificationToken },
    };
  }

  /** Checks the proof the owner says they published, and records the result. */
  async verify(
    organizationId: string,
    siteId: string,
    method: VerificationMethod,
  ): Promise<VerificationResult> {
    const site = await this.find(organizationId, siteId);
    const proof =
      method === 'DNS'
        ? await this.ownership.checkDns(site.host, site.verificationToken)
        : await this.ownership.checkFile(site.origin, site.verificationToken);
    if (proof.verified) {
      await this.prisma.site.update({
        where: { id: siteId },
        data: { verifiedAt: new Date(), verificationMethod: method },
      });
    }
    return { verified: proof.verified, method, detail: proof.detail };
  }

  /**
   * Before each scan: the proof must still be in place. Ownership changes hands,
   * and a domain may expire; if the proof is gone, the site is unverified again.
   */
  async confirmOwnership(site: {
    id: string;
    origin: string;
    host: string;
    verificationToken: string;
    verificationMethod: VerificationMethod | null;
  }) {
    if (site.verificationMethod === null) {
      return { verified: false, detail: 'Le site n’est pas vérifié.' };
    }
    const proof =
      site.verificationMethod === 'DNS'
        ? await this.ownership.checkDns(site.host, site.verificationToken)
        : await this.ownership.checkFile(site.origin, site.verificationToken);
    if (!proof.verified) {
      await this.prisma.site.update({
        where: { id: site.id },
        data: { verifiedAt: null, verificationMethod: null },
      });
    }
    return proof;
  }

  async find(organizationId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, organizationId } });
    if (site === null) {
      throw new NotFoundException('Site introuvable');
    }
    return site;
  }

  private async toSite(site: Awaited<ReturnType<SitesService['find']>>): Promise<Site> {
    const [last, previous] = await this.prisma.scan.findMany({
      where: { siteId: site.id, status: { in: [...FINISHED] } },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    const latest = await this.prisma.scan.findFirst({
      where: { siteId: site.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      id: site.id,
      origin: site.origin,
      host: site.host,
      verified: site.verifiedAt !== null,
      verificationMethod: site.verificationMethod,
      verifiedAt: site.verifiedAt?.toISOString() ?? null,
      maxPages: site.maxPages,
      schedule: site.schedule,
      nextScanAt: site.nextScanAt?.toISOString() ?? null,
      createdAt: site.createdAt.toISOString(),
      lastScan:
        latest === null
          ? null
          : {
              id: latest.id,
              status: latest.status,
              score: latest.score,
              criteriaToCheckManually: criteriaToCheckManually(),
              finishedAt: latest.finishedAt?.toISOString() ?? null,
            },
      trend:
        last?.score !== null &&
        last?.score !== undefined &&
        previous?.score !== null &&
        previous?.score !== undefined
          ? last.score - previous.score
          : null,
    };
  }
}
