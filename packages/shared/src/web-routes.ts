/**
 * Paths of the pages of the web application, without the leading slash. The
 * router, the links sent by e-mail and the end-to-end tests read them here, so
 * that they cannot drift apart: a test checks that the router declares exactly
 * these paths, and the accessibility test visits every one of them.
 */
export const WEB_ROUTES = {
  home: '',
  login: 'connexion',
  register: 'inscription',
  verifyEmail: 'verifier-email',
  forgotPassword: 'mot-de-passe-oublie',
  resetPassword: 'reinitialiser-mot-de-passe',
  acceptInvitation: 'invitations',
  robot: 'robot',
  dashboard: 'tableau-de-bord',
  organization: 'organisations/:org/parametres',
  members: 'organisations/:org/membres',
  sites: 'organisations/:org/sites',
  newSite: 'organisations/:org/sites/nouveau',
  site: 'organisations/:org/sites/:site',
  siteVerification: 'organisations/:org/sites/:site/verification',
  scan: 'organisations/:org/scans/:scan',
  finding: 'organisations/:org/scans/:scan/defauts/:finding',
  audit: 'organisations/:org/audits/:audit',
  auditPage: 'organisations/:org/audits/:audit/pages/:page',
  statement: 'organisations/:org/audits/:audit/declaration',
  /** Any other address: the "page not found" page. */
  notFound: '**',
} as const;

export type WebRoute = keyof typeof WEB_ROUTES;

/** Query parameter that carries the single-use token of the links sent by e-mail. */
export const LINK_TOKEN_PARAMETER = 'jeton';

/** Query parameter of the sign-in page: where to go back once signed in. */
export const RETURN_PARAMETER = 'retour';

/** The names of the `:parameters` of a path: "a/:org/b/:site" gives "org" | "site". */
export type PathParameters<Path extends string> =
  Path extends `${string}:${infer Name}/${infer Rest}`
    ? Name | PathParameters<Rest>
    : Path extends `${string}:${infer Name}`
      ? Name
      : never;

type ParametersOf<Route extends WebRoute> = PathParameters<(typeof WEB_ROUTES)[Route]>;

/**
 * The absolute path of a page, its parameters filled in and encoded:
 * `webPath('site', { org, site })` gives "/organisations/…/sites/…".
 */
export function webPath<Route extends Exclude<WebRoute, 'notFound'>>(
  route: Route,
  ...parameters: [ParametersOf<Route>] extends [never]
    ? []
    : [Readonly<Record<ParametersOf<Route>, string>>]
): string {
  const values: Readonly<Record<string, string>> = parameters[0] ?? {};
  const path = WEB_ROUTES[route].replace(/:(\w+)/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined || value === '') {
      throw new Error(`Missing parameter "${name}" for the page "${route}"`);
    }
    return encodeURIComponent(value);
  });
  return `/${path}`;
}
