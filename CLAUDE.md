# Rampe

SaaS de pré-audit d'accessibilité web (RGAA 4.1.2) pour les PME françaises. Le robot parcourt un site, exécute les tests automatisables, rattache chaque défaut à un critère RGAA et suit l'évolution dans le temps.

- Le besoin complet : [docs/CAHIER-DES-CHARGES.md](docs/CAHIER-DES-CHARGES.md)
- Le plan, les jalons et leurs critères d'acceptation : [PLAN.md](PLAN.md)
- Chaque choix technique et sa raison : [DECISIONS.md](DECISIONS.md)

## Règles qui ne se discutent pas

- **Honnêteté.** Un test automatique ne prouve jamais la conformité RGAA. L'interface, les rapports et les e-mails disent « pré-audit automatique » et indiquent combien de critères restent à vérifier à la main. Le mot « conforme » n'apparaît jamais sur la seule base des tests automatiques.
- **Sécurité du robot.** Toute requête vers un site scanné passe par le proxy de sortie, qui bloque les adresses non publiques. Le navigateur tourne dans un conteneur sans accès au réseau interne. On ne contourne pas ces protections, même pour un test.
- **Tests.** Aucun test désactivé ou affaibli pour faire passer la CI. Aucune donnée factice dans le code de production.
- **Bibliothèques.** Vérifier chaque API dans les types installés (`node_modules`) ou la documentation avant de l'utiliser. Ne rien inventer.
- **Doute.** Une exigence impossible ou ambiguë : s'arrêter et le dire, ne pas la contourner. Un écart à la stack imposée se propose et attend un accord.

## Méthode de travail

Le projet avance par jalons, J0 à J6 (voir PLAN.md). Un jalon se développe sur sa branche (`j0-skeleton`, `j1-…`), fusionnée dans `main` une fois validée. Il n'est terminé que si :

1. lint, formatage, types, tests et build passent ;
2. `docker compose up` fonctionne depuis un clone neuf ;
3. chaque critère d'acceptation est démontré ;
4. CLAUDE.md et DECISIONS.md sont à jour ;
5. un commit conventionnel est fait.

Il se clôt par un résumé (ce qui marche, comment le vérifier, ce qui reste, les écarts au plan), puis on attend le feu vert avant le jalon suivant.

## Commandes

Prérequis : Node 26, pnpm 12, Docker avec Compose.

| Commande                                                                | Effet                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                                          | Installe les dépendances                                                                                                              |
| `docker compose up --build`                                             | Lance toute l'application : interface sur http://127.0.0.1:8080                                                                       |
| `pnpm lint`                                                             | ESLint, dont les règles d'accessibilité des gabarits Angular                                                                          |
| `pnpm format` / `pnpm format:check`                                     | Prettier                                                                                                                              |
| `pnpm typecheck`                                                        | Types de tout le dépôt, gabarits Angular compris                                                                                      |
| `pnpm test`                                                             | Tests unitaires. `packages/rules` échoue sous 100 % de couverture                                                                     |
| `pnpm test:integration`                                                 | Tests contre de vrais PostgreSQL et Valkey (Testcontainers, Docker requis)                                                            |
| `pnpm test:e2e`                                                         | Tests de bout en bout et d'accessibilité, contre l'application lancée par Compose                                                     |
| `pnpm build`                                                            | Compile tous les paquets                                                                                                              |
| `pnpm audit --audit-level high`                                         | Vulnérabilités connues des dépendances                                                                                                |
| `pnpm licenses:check`                                                   | Refuse GPL, AGPL et toute licence inconnue                                                                                            |
| `pnpm --filter @rampe/rules run generate`                               | Régénère les données RGAA et `docs/rgaa-4.1.2.md` depuis la source officielle et axe-core ; à lancer après une mise à jour d’axe-core |
| `pnpm --filter @rampe/api run test`                                     | Une commande dans un seul paquet                                                                                                      |
| `pnpm --filter @rampe/e2e run install-browser`                          | Installe Chromium pour les tests de bout en bout (une fois)                                                                           |
| `pnpm --filter @rampe/web start`                                        | Interface en rechargement à chaud sur http://localhost:4300 ; `/api` est relayé vers l'application lancée par Compose                 |
| `docker compose exec worker node dist/scan-cli.js http://fixture-site/` | Scanne un site et affiche le rapport en JSON ; options `--max-pages`, `--max-depth`, `--page-timeout-ms`, `--scan-timeout-ms`         |

## Structure

```
apps/
  web/            Angular 22, interface en français, servie par nginx
  api/            NestJS 12 : REST, OpenAPI, accès à PostgreSQL
  worker/         moteur de scan et ses trois points d'entrée :
                    dist/main.js                 consommateur des files BullMQ
                    dist/scan-cli.js             commande de scan (jusqu'à l'API, J3)
                    dist/egress/main.js          proxy de sortie, garde SSRF (conteneur egress-proxy)
                    dist/browser-server/main.js  Chromium isolé (conteneur browser)
  fixture-site/   site de test aux erreurs volontaires ; defects.json les liste
packages/
  rules/          code pur, sans I/O, couvert à 100 % :
                    src/rgaa/                  référentiel, correspondance avec axe-core, classement
                    src/rgaa/data/             données générées (ne pas modifier à la main)
                    src/content/fr/            textes de correction en français (contenu modifiable)
                    src/checks.ts, score.ts    score de pré-audit
                    src/conformity.ts          taux de conformité, méthode officielle
                    src/fingerprint.ts, diff.ts empreinte des défauts, comparaison de scans
                    data/sources/              fichier officiel des critères, figé par son empreinte
                    scripts/                   génération des données et du rapport
  shared/         schémas de validation et types partagés par toutes les applications
e2e/              tests Playwright de bout en bout, avec axe-core
test-support/     démarrage des conteneurs pour les tests d'intégration
docker/           Dockerfile unique (une cible par image), nginx, profil seccomp de Chromium
scripts/          contrôle des licences
```

Réseaux Docker : `front` (interface et API), `data` (PostgreSQL), `queue` (Valkey), `sandbox` (worker, navigateur et proxy de sortie), `egress` (proxy de sortie et site de test). Les réseaux `data`, `queue` et `sandbox` n'ont pas de route vers l'extérieur. Le worker n'a ni accès ni identifiants vers PostgreSQL. Le navigateur ne joint que le proxy de sortie, qui seul sort vers Internet.

**Chemin d'une requête du robot.** Chromium (conteneur `browser`) et le worker (robots.txt, sitemaps) envoient tout au proxy `egress-proxy`. Celui-ci n'accepte que http et https, ports 80 et 443, résout le nom une fois, refuse toute adresse non publique et se connecte à l'adresse qu'il a vérifiée. Ne jamais donner au navigateur ou au worker une autre route vers l'extérieur.

## Conventions

**Langues.** Code, identifiants, commentaires et messages de commit en anglais. Interface, textes de correction, descriptions OpenAPI et documents du dépôt en français.

**Modules.** Tout est en modules ES (`"type": "module"`). Hors de `apps/web`, les imports relatifs portent l'extension `.js`, comme l'exige Node (`import { x } from './x.js'`). Dans `apps/web`, pas d'extension : c'est le bundler d'Angular qui résout.

**TypeScript.** Mode strict complété par `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes`. Pas de `any` ; aux frontières (JSON reçu, corps de réponse), valider avec un schéma ou typer explicitement ce qu'on lit. `apps/web` a son propre `tsconfig.json`, parce qu'il cible le navigateur.

**Validation.** Toujours `import * as z from 'zod/mini'`, jamais `'zod'` : la version complète ajoute environ 450 kB au paquet du navigateur. ESLint le refuse. Les schémas partagés vivent dans `packages/shared`. NestJS 12 valide et documente nativement à partir de ces schémas (`standardSchema`).

**Configuration.** Chaque service valide son environnement une fois au démarrage avec `parseEnv`, et ne lit `process.env` nulle part ailleurs. Toute variable nouvelle est ajoutée à `.env.example`.

**Tests.**

- Unitaires : `*.spec.ts` à côté du code testé.
- Intégration : `test/*.int-spec.ts`, contre de vrais services démarrés par `test-support/containers.ts`, sur les images exactes de `docker-compose.yml`.
- Bout en bout : `e2e/tests/`, contre l'application lancée par Compose. Toute nouvelle page y reçoit un contrôle `expectNoAccessibilityViolations`. Les tests du moteur de scan pilotent les conteneurs avec `e2e/tests/support/compose.ts` et lisent le journal du site de test pour vérifier le comportement du robot.
- Site de test : toute erreur volontaire ajoutée est déclarée dans `apps/fixture-site/defects.json` ; les autres pages doivent rester sans violation, un test le vérifie.
- Jest tourne en modules ES : importer `describe`, `it`, `expect` et `jest` depuis `@jest/globals`. `jest.mock` ne fonctionne pas dans ce mode ; on injecte les dépendances et on passe des doublures.
- Un test porte le nom du comportement attendu, pas celui de la fonction.

**`packages/rules`.** Aucune entrée-sortie, aucune dépendance à l'horloge ou au réseau. Tout ce qui interprète un résultat de scan (score, correspondance RGAA, empreinte, comparaison) s'y trouve.

- Les fichiers `src/rgaa/data/*.generated.ts` et `docs/rgaa-4.1.2.md` ne se modifient qu'en relançant `generate` ; la CI vérifie qu'ils sont à jour.
- Un lien entre une règle et un critère n'est jamais affirmé sans ses deux sources : un lien « incertain » s'affiche « critère RGAA à confirmer ».
- Un critère ne devient « automatisable » que par une décision écrite et justifiée dans `src/rgaa/automatable.ts`. Un lien entre règle et critère ne se confirme, ne se rejette ou ne s'ajoute que par une revue écrite dans `src/rgaa/reviews.ts`, appuyée sur le libellé officiel du test.
- Toute règle exécutée a son texte dans `src/content/fr/corrections.ts`.

**Dépendances.** Versions exactes, sans `^`. pnpm refuse par défaut les scripts d'installation des dépendances ; chaque paquet est tranché dans `allowBuilds` de `pnpm-workspace.yaml`. Une dépendance sous une licence nouvelle doit passer `pnpm licenses:check`.

**Docker.** Images figées par leur empreinte `sha256`. Nos conteneurs tournent sans privilège, système de fichiers en lecture seule, sans capacité Linux. Les identifiants locaux de `docker-compose.yml` contiennent `local-only`, que les services refusent en production.

**Commits.** [Conventional Commits](https://www.conventionalcommits.org/) en anglais : `feat(worker): …`, `fix(api): …`, `docs: …`.
