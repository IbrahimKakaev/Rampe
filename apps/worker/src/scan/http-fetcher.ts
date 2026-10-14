import { fetch, ProxyAgent } from 'undici';

export interface FetchedText {
  readonly status: number;
  /** Where the request landed after redirects. */
  readonly url: string;
  readonly body: string;
}

/** Fetches a small text resource; `null` when it cannot be fetched or is larger than `maxBytes`. */
export type TextFetcher = (url: string, maxBytes: number) => Promise<FetchedText | null>;

/**
 * Fetches robots.txt and sitemaps the way the browser fetches pages: through
 * the egress proxy, so that the same address policy applies, and with the same
 * User-Agent.
 */
export function createProxiedFetcher(options: {
  readonly proxyUrl: string;
  readonly userAgent: string;
  readonly timeoutMs: number;
}): { fetchText: TextFetcher; close: () => Promise<void> } {
  const dispatcher = new ProxyAgent(options.proxyUrl);
  return {
    fetchText: async (url, maxBytes) => {
      try {
        const response = await fetch(url, {
          dispatcher,
          headers: { 'user-agent': options.userAgent, accept: '*/*' },
          redirect: 'follow',
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        const chunks: Uint8Array[] = [];
        let size = 0;
        // undici types the chunks as any; the Fetch standard makes them Uint8Array.
        const reader = response.body?.getReader() as
          ReadableStreamDefaultReader<Uint8Array> | undefined;
        for (;;) {
          const chunk = await reader?.read();
          if (chunk === undefined || chunk.done) {
            break;
          }
          size += chunk.value.byteLength;
          if (size > maxBytes) {
            await reader?.cancel();
            return null;
          }
          chunks.push(chunk.value);
        }
        return {
          status: response.status,
          url: response.url,
          body: Buffer.concat(chunks).toString('utf8'),
        };
      } catch {
        return null;
      }
    },
    close: () => dispatcher.close(),
  };
}
