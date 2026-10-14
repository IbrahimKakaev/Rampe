import { execFileSync } from 'node:child_process';

const DEFAULT_SOCKET = 'unix:///var/run/docker.sock';

/**
 * Testcontainers only looks for Docker at the default socket. Docker Desktop
 * alternatives (Colima, Rancher Desktop, OrbStack…) expose it elsewhere and
 * record the location in the active `docker context`. This points Testcontainers
 * at that context, unless the environment already says where Docker is.
 */
export function useActiveDockerContext(env: NodeJS.ProcessEnv = process.env): void {
  if (env['DOCKER_HOST'] !== undefined) {
    return;
  }
  let endpoint: string;
  try {
    endpoint = execFileSync(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    // No docker CLI: leave Testcontainers to report that it found no runtime.
    return;
  }
  if (endpoint === '' || endpoint === DEFAULT_SOCKET) {
    return;
  }
  env['DOCKER_HOST'] = endpoint;
  // The resource reaper mounts the socket from inside the Docker host, where it
  // sits at the default path whatever the path on this machine.
  env['TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE'] ??= '/var/run/docker.sock';
}
