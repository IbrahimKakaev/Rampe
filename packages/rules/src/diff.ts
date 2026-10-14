/** A defect as two scans can compare it. */
export interface FindingReference {
  readonly fingerprint: string;
  /** Path of the page the defect is on. */
  readonly pagePath: string;
}

export interface ScanSnapshot {
  /**
   * Pages whose defects are known in full: analysed, and not cut because they
   * had too many defects. Only those can be compared.
   */
  readonly comparablePages: readonly string[];
  readonly findings: readonly FindingReference[];
}

export interface ScanComparison {
  readonly added: readonly string[];
  readonly fixed: readonly string[];
  readonly unchanged: readonly string[];
  /** Defects of either scan on a page the other scan could not compare. */
  readonly notCompared: number;
}

/**
 * Compares the defects of two scans of a site. A defect counts as fixed only
 * if its page was analysed in both scans: a page that timed out, failed or was
 * not reached fixes nothing.
 */
export function compareScans(previous: ScanSnapshot, current: ScanSnapshot): ScanComparison {
  const inBoth = new Set(
    previous.comparablePages.filter((page) => current.comparablePages.includes(page)),
  );
  const comparable = (finding: FindingReference): boolean => inBoth.has(finding.pagePath);
  const before = new Set(
    previous.findings.filter(comparable).map((finding) => finding.fingerprint),
  );
  const after = new Set(current.findings.filter(comparable).map((finding) => finding.fingerprint));
  const sorted = (values: Iterable<string>): string[] => [...values].sort();
  return {
    added: sorted([...after].filter((fingerprint) => !before.has(fingerprint))),
    fixed: sorted([...before].filter((fingerprint) => !after.has(fingerprint))),
    unchanged: sorted([...after].filter((fingerprint) => before.has(fingerprint))),
    notCompared:
      previous.findings.filter((finding) => !comparable(finding)).length +
      current.findings.filter((finding) => !comparable(finding)).length,
  };
}
