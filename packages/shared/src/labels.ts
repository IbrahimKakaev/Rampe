import type { Impact, PageError } from './scan.js';

/**
 * French wording of the codes the scan engine reports, shared by the
 * interface, the PDF report and the e-mails, so that they say the same thing.
 */

export const IMPACT_LABEL: Readonly<Record<Impact, string>> = {
  critical: 'Critique',
  serious: 'Grave',
  moderate: 'Modéré',
  minor: 'Mineur',
};

export const PAGE_ERROR_LABEL: Readonly<Record<PageError, string>> = {
  timeout: 'Délai dépassé',
  blocked: 'Adresse refusée par le robot',
  'http-error': 'Erreur HTTP',
  'not-html': 'Pas une page HTML',
  'redirected-off-site': 'Redirigée vers un autre site',
  'navigation-failed': 'Chargement impossible',
};

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
