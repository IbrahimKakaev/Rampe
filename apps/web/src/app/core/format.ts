import type { Conformity, Scan } from '@rampe/shared';

export { IMPACT_LABEL, PAGE_ERROR_LABEL, scanReasonLabel } from '@rampe/shared';

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

const RATE = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

/** An RGAA conformity rate, to one decimal: "66,7 %". */
export function formatRate(rate: number): string {
  return RATE.format(rate);
}

/** Where a manual audit stands: the evaluations left, or its rate once complete. */
export function formatAuditProgress(conformity: Conformity): string {
  if (conformity.complete && conformity.rate !== null) {
    return `audit complet, taux de conformité RGAA de ${formatRate(conformity.rate)}`;
  }
  if (conformity.complete) {
    return 'audit complet, aucun critère applicable';
  }
  if (conformity.expected === 0) {
    return 'échantillon à composer';
  }
  const remaining = conformity.expected - conformity.evaluated;
  return `${String(remaining)} évaluation${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} sur ${String(conformity.expected)}`;
}
