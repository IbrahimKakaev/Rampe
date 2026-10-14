import { ROBOTS_TOKEN } from './robots.js';

/**
 * The User-Agent of the scanner. It follows the usual form of crawlers, names
 * the product token that robots.txt rules can target, and links to a page that
 * explains what the robot does and how to block it.
 */
export function buildUserAgent(botInfoUrl: string): string {
  return `Mozilla/5.0 (compatible; ${ROBOTS_TOKEN}/1.0; +${botInfoUrl})`;
}
