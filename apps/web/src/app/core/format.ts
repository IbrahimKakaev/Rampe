import type { Impact, Scan, ScanPage } from '@rampe/shared';

const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });

/** A score between 0 and 1, as a percentage: "72 %". */
export function formatScore(score: number): string {
  return PERCENT.format(score);
}

/** The change between two scores, in points of percentage, said in words. */
export function formatTrend(trend: number | null): string {
  if (trend === null) {
    return 'Pas encore de comparaison';
  }
  const points = Math.round(trend * 100);
  if (points === 0) {
    return 'Stable';
  }
  const amount = `${String(Math.abs(points))} point${Math.abs(points) > 1 ? 's' : ''}`;
  return points > 0 ? `En hausse de ${amount}` : `En baisse de ${amount}`;
}

export function trendDirection(trend: number | null): 'up' | 'down' | 'flat' {
  const points = trend === null ? 0 : Math.round(trend * 100);
  return points > 0 ? 'up' : points < 0 ? 'down' : 'flat';
}

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}

export const SCAN_STATUS_LABEL: Readonly<Record<Scan['status'], string>> = {
  QUEUED: 'En attente',
  RUNNING: 'En cours',
  COMPLETED: 'Terminé',
  PARTIAL: 'Terminé en partie',
  FAILED: 'Échoué',
};

export function isScanActive(status: Scan['status']): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

/** Why a scan failed or stopped early. */
const SCAN_REASON_LABEL: Readonly<Record<string, string>> = {
  'site-unreachable': 'Le site n’a pas répondu, ou son fichier robots.txt était inaccessible.',
  'disallowed-by-robots':
    'Le fichier robots.txt du site interdit à RampeBot d’explorer la page d’accueil.',
  'home-page-failed': 'La page d’accueil n’a pas pu être analysée.',
  'page-limit': 'Le scan s’est arrêté à la limite de pages fixée pour ce site.',
  'scan-timeout': 'Le scan a atteint sa durée maximale avant d’avoir visité toutes les pages.',
  'engine-error': 'Le robot a rencontré une erreur interne. Relancez le scan.',
};

export function scanReasonLabel(reason: string | null): string | null {
  return reason === null ? null : (SCAN_REASON_LABEL[reason] ?? 'Raison inconnue.');
}

export const PAGE_ERROR_LABEL: Readonly<Record<NonNullable<ScanPage['error']>, string>> = {
  timeout: 'Délai dépassé',
  blocked: 'Adresse refusée par le robot',
  'http-error': 'Erreur HTTP',
  'not-html': 'Pas une page HTML',
  'redirected-off-site': 'Redirigée vers un autre site',
  'navigation-failed': 'Chargement impossible',
};

export const IMPACT_LABEL: Readonly<Record<Impact, string>> = {
  critical: 'Critique',
  serious: 'Grave',
  moderate: 'Modéré',
  minor: 'Mineur',
};
