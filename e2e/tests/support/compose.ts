import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { type ScanReport, scanReportSchema } from '@rampe/shared';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs `docker compose …` from the repository root, against the running application. */
export function compose(args: readonly string[], timeoutMs = 120_000): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      'docker',
      ['compose', ...args],
      { cwd: repositoryRoot, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

/** Runs the scan command in the worker container and returns its validated report. */
export async function scan(url: string, options: readonly string[] = []): Promise<ScanReport> {
  const result = await compose(
    ['exec', '-T', 'worker', 'node', 'dist/scan-cli.js', url, ...options],
    5 * 60_000,
  );
  if (result.code !== 0) {
    throw new Error(`scan failed (${String(result.code)}): ${result.stderr}`);
  }
  return scanReportSchema.parse(JSON.parse(result.stdout));
}

/** A request the test site received, as its log records it. */
export interface FixtureRequest {
  readonly time: string;
  readonly method: string;
  readonly path: string;
  readonly userAgent: string;
  readonly status: number;
  readonly durationMs: number;
}

/**
 * Marks the test site's log, then returns a function that reads the requests
 * logged after the mark. A mark is more reliable than a timestamp: the clocks
 * of the test runner and of the Docker host may differ.
 */
export async function markFixtureLog(): Promise<() => Promise<FixtureRequest[]>> {
  const marker = `/__marker/${randomUUID()}`;
  const marked = await compose([
    'exec',
    '-T',
    'fixture-site',
    'node',
    '-e',
    `fetch('http://127.0.0.1${marker}').then((r) => r.text())`,
  ]);
  if (marked.code !== 0) {
    throw new Error(`could not mark the test site's log: ${marked.stderr}`);
  }
  return async () => {
    const logs = await compose(['logs', '--no-log-prefix', '--no-color', 'fixture-site']);
    const entries = logs.stdout
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as FixtureRequest & { event?: string })
      .filter((entry) => entry.event === 'request');
    const start = entries.findIndex((entry) => entry.path === marker);
    if (start === -1) {
      throw new Error('the mark is not in the test site log');
    }
    // Paths under /__ are the test's own marks and the container's health checks.
    return entries.slice(start + 1).filter((entry) => !entry.path.startsWith('/__'));
  };
}

/** Lines the egress proxy logged, as parsed JSON. */
export async function egressLog(): Promise<Record<string, unknown>[]> {
  const logs = await compose(['logs', '--no-log-prefix', '--no-color', 'egress-proxy']);
  return logs.stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Runs a short Node.js script in a container and returns what it printed. */
export async function nodeIn(service: string, script: string): Promise<string> {
  const result = await compose(['exec', '-T', service, 'node', '-e', script]);
  if (result.code !== 0) {
    throw new Error(`script failed in ${service}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/** The low-level configuration Docker applied to a service's container. */
export async function inspectService(service: string): Promise<{
  HostConfig: Record<string, unknown>;
  Config: Record<string, unknown>;
}> {
  const id = (await compose(['ps', '-q', service])).stdout.trim();
  const { stdout: result } = await promisify(execFile)('docker', ['inspect', id]);
  const [container] = JSON.parse(result) as [
    { HostConfig: Record<string, unknown>; Config: Record<string, unknown> },
  ];
  return container;
}
