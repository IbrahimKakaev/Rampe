import { type APIRequestContext, request } from '@playwright/test';

export const BASE_URL = process.env['BASE_URL'] ?? 'http://127.0.0.1:8080';
const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://127.0.0.1:8025';

export const DEMO = { email: 'demo@rampe.local', password: 'demo-local-only' } as const;

export type Send = (
  method: 'post' | 'patch' | 'delete',
  path: string,
  data?: object,
) => ReturnType<APIRequestContext['post']>;

/**
 * Calls the API as the browser does: cookies kept, CSRF token repeated in the
 * header. Works on a standalone request context or on a browser context's
 * `request`, which shares the cookies of its pages.
 */
export async function apiSession(context: APIRequestContext): Promise<Send> {
  await context.get('/api/v1/health');
  const { cookies } = await context.storageState();
  const token = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  return (method, path, data) =>
    context[method](`/api/v1${path}`, { data, headers: { 'x-xsrf-token': token } });
}

/** A browser-like session of its own on the API. */
export async function session(): Promise<{ context: APIRequestContext; send: Send }> {
  const context = await request.newContext({ baseURL: BASE_URL });
  return { context, send: await apiSession(context) };
}

/**
 * The link of the last e-mail Mailpit received for an address whose path is
 * `path`, waiting for it to arrive.
 */
export async function linkFromMailpit(to: string, path = ''): Promise<string> {
  const mail = await request.newContext({ baseURL: MAILPIT });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = (await (
      await mail.get(`/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    ).json()) as { messages: { ID: string }[] };
    for (const { ID } of search.messages) {
      const message = (await (await mail.get(`/api/v1/message/${ID}`)).json()) as {
        Text: string;
      };
      const link = message.Text.split(/\s+/).find(
        (word) =>
          word.startsWith('http') &&
          new URL(word).pathname.startsWith(path) &&
          word.includes('jeton='),
      );
      if (link !== undefined) {
        return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No e-mail with a link to ${path} for ${to} in Mailpit`);
}

/** The single-use token of the last e-mail Mailpit received for an address. */
export async function tokenFromMailpit(to: string): Promise<string> {
  return new URL(await linkFromMailpit(to)).searchParams.get('jeton') ?? '';
}

type Cookies = Awaited<ReturnType<APIRequestContext['storageState']>>['cookies'];
let demoSession: Promise<Cookies> | undefined;

/**
 * The cookies of a session of the demonstration account, opened once per
 * test process and shared: sign-in is rate limited (10 attempts a minute per
 * address), and the tests must not trip the protection they run against.
 */
export function demoCookies(): Promise<Cookies> {
  demoSession ??= (async () => {
    const { context, send } = await session();
    const login = await send('post', '/auth/login', DEMO);
    if (login.status() !== 200) {
      throw new Error(`The demonstration account could not sign in: ${String(login.status())}`);
    }
    return (await context.storageState()).cookies;
  })();
  return demoSession;
}
