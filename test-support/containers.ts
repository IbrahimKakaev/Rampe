import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { composeImage } from './compose-images.js';
import { useActiveDockerContext } from './container-runtime.js';

useActiveDockerContext();

const PASSWORD = 'integration-test';

export interface StartedDependency {
  readonly container: StartedTestContainer;
  /** Connection URL reachable from the test process. */
  readonly url: string;
}

export async function startValkey(): Promise<StartedDependency> {
  const container = await new GenericContainer(composeImage('valkey'))
    .withCommand(['valkey-server', '--requirepass', PASSWORD, '--maxmemory-policy', 'noeviction'])
    .withEnvironment({ REDISCLI_AUTH: PASSWORD })
    .withExposedPorts(6379)
    .withHealthCheck({
      test: ['CMD-SHELL', 'valkey-cli ping | grep -q PONG'],
      interval: 500,
      timeout: 3000,
      retries: 60,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .start();
  return {
    container,
    url: `redis://:${PASSWORD}@${container.getHost()}:${String(container.getMappedPort(6379))}`,
  };
}

export async function startPostgres(): Promise<StartedDependency> {
  const container = await new GenericContainer(composeImage('postgres'))
    .withEnvironment({ POSTGRES_USER: 'rampe', POSTGRES_PASSWORD: PASSWORD, POSTGRES_DB: 'rampe' })
    .withExposedPorts(5432)
    .withHealthCheck({
      test: ['CMD-SHELL', 'pg_isready -U rampe -d rampe -h 127.0.0.1'],
      interval: 500,
      timeout: 3000,
      retries: 60,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .start();
  return {
    container,
    url: `postgresql://rampe:${PASSWORD}@${container.getHost()}:${String(container.getMappedPort(5432))}/rampe`,
  };
}
