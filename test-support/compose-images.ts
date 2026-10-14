import { readFileSync } from 'node:fs';

const composeFile = new URL('../docker-compose.yml', import.meta.url);

/**
 * Returns the pinned image of a docker-compose service, so that integration
 * tests run against exactly the version the application runs with.
 */
export function composeImage(service: string): string {
  const lines = readFileSync(composeFile, 'utf8').split('\n');
  const start = lines.indexOf(`  ${service}:`);
  if (start === -1) {
    throw new Error(`No service "${service}" in docker-compose.yml`);
  }
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}\S/.test(line)) {
      break;
    }
    const image = /^ {4}image: (\S+)$/.exec(line)?.[1];
    if (image !== undefined) {
      return image;
    }
  }
  throw new Error(`Service "${service}" has no image in docker-compose.yml`);
}
