# Décisions techniques

Chaque choix technique de Rampe et sa raison. Une décision qu'on change n'est pas effacée : on la marque remplacée et on ajoute la nouvelle. Les décisions de cadrage D1 à D10 sont détaillées dans [PLAN.md](PLAN.md).

## Cadrage, validé le 14 octobre 2026

| #   | Décision                                                                                                | Raison                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D1  | Le débit du robot se compte en navigations de page : une par seconde et par domaine                     | À la lettre, « 1 requête par seconde » est incompatible avec un chargement complet de page en 30 s |
| D2  | Valkey remplace Redis                                                                                   | Redis 8 est sous RSALv2, SSPLv1 ou AGPLv3 ; le projet exclut l'AGPL. Valkey est resté sous BSD-3   |
| D3  | Le proxy de sortie accepte une liste d'hôtes privés autorisés, vide par défaut et refusée en production | Le site de test tourne sur une adresse privée de Docker, que la protection SSRF bloque             |
| D4  | Prisma 7.10 plutôt que 8.0                                                                              | Sur npm, `latest` pointe vers une version candidate de la 8.0                                      |
| D5  | L'adresse e-mail est vérifiée à l'inscription                                                           | Alertes et invitations ne doivent pas partir vers une adresse que personne n'a prouvé posséder     |
| D6  | Pas de rôle « auditeur » : l'auditeur est membre de l'organisation du client                            | Un rôle qui traverse les organisations affaiblirait leur isolation                                 |
| D7  | Le scan se déclenche par un endpoint REST authentifié par la session ; pas de jetons d'API dans le MVP  | Les jetons servent à l'intégration dans la CI des clients, hors périmètre                          |
| D8  | La CI tourne sur GitHub Actions ; elle sera démontrée quand le dépôt distant existera                   | Ni dépôt distant ni `gh` au démarrage du projet                                                    |
| D9  | Code et commits en anglais ; interface et documents en français                                         | Convention courante ; les documents servent au rapport de M2                                       |
| D10 | pnpm 12 installé globalement avec npm                                                                   | pnpm et corepack étaient absents du poste                                                          |

## Jalon J0, 14 octobre 2026

### Langage et modules

**Node 26, TypeScript 6.0, modules ES partout.** Node 26 devient la version LTS le 28 octobre 2026. TypeScript 7 existe mais Angular 22 exige la 6.0, et ts-jest refuse la 7. NestJS 12 est publié en modules ES : garder un seul système de modules pour tout le dépôt évite les ponts entre CommonJS et ES.

**`apps/web` a son propre `tsconfig.json`.** Il cible le navigateur et un bundler (`module: preserve`, bibliothèques DOM), là où le reste cible Node (`module: NodeNext`). Les options de rigueur sont les mêmes des deux côtés.

**Les paquets internes se résolvent vers leurs sources pour les types et les tests, vers `dist` à l'exécution.** Ainsi `pnpm typecheck` et `pnpm test` n'exigent aucun build préalable. `pnpm build` compile dans l'ordre des dépendances.

### Tests

**Jest en mode modules ES, comme l'exige la stack.** NestJS 12 n'étant plus chargeable en CommonJS, Jest tourne avec `--experimental-vm-modules` et ts-jest en mode ES. C'est la configuration du gabarit officiel de NestJS 12 pour Jest. Conséquence : `jest.mock` est indisponible, on injecte les dépendances.

**Jest pour Angular passe par `jest-preset-angular`.** Le lanceur par défaut d'Angular 22 est Vitest, mais le préréglage déclare le support d'Angular 22 et fonctionne. Risque R5 du plan levé.

**Tests d'intégration avec Testcontainers, sur les images de `docker-compose.yml`.** Les tests lisent la référence d'image dans le fichier Compose : impossible de tester une version et d'en faire tourner une autre. Testcontainers ne cherche Docker qu'au socket par défaut ; `test-support/container-runtime.ts` le pointe vers le contexte Docker actif, ce qui couvre Colima, OrbStack ou Rancher Desktop sans réglage par poste.

**Les tests de bout en bout exigent zéro violation axe, pas seulement zéro « serious » ou « critical ».** Plus strict que le cahier des charges et plus simple à tenir. Un test plante volontairement une image sans alternative pour prouver que le contrôle regarde vraiment la page.

### Validation et API

**`zod/mini` partout, jamais `zod`.** Mesuré sur le même schéma : 454 kB minifiés avec la version complète, 13 kB avec `zod/mini`. Le paquet initial de l'interface est passé de 692 kB à 250 kB. Une seule variante pour tout le dépôt, imposée par ESLint, plutôt qu'une règle par paquet.

**Validation et OpenAPI par le support natif de NestJS 12, sans composant maison.** NestJS 12 fournit `StandardSchemaValidationPipe` et l'option `standardSchema` de `@nestjs/swagger`. Cela remplace le `ZodValidationPipe` maison prévu au plan et `nestjs-zod`, qui ne déclare pas le support de NestJS 12.

**Un convertisseur OpenAPI maison pour `zod/mini`** (`apps/api/src/openapi/zod-schema-converter.ts`). `@nestjs/swagger` attend que le schéma porte son propre convertisseur JSON Schema, ce que seule la version complète de Zod fait. Le convertisseur appelle `z.toJSONSchema` avec la cible `openapi-3.0`.

**`GET /api/v1/health` répond 503 quand une dépendance est tombée**, avec le même corps que le 200. Les sondes de Docker et d'un futur répartiteur de charge lisent le code HTTP ; l'interface lit le corps. La raison de la panne reste dans les journaux, jamais dans la réponse.

**La base est jointe avec le pilote `pg` jusqu'au J3.** Prisma arrive avec le schéma de données ; son adaptateur PostgreSQL s'appuie sur ce même pilote.

**L'API attend sa première connexion à Valkey avant d'écouter, deux secondes au plus.** Les commandes échouent tout de suite hors connexion, pour qu'une sonde réponde « hors ligne » au lieu d'attendre. Sans cette attente, la première requête après le démarrage échouait à tort.

**`bullmq` n'entre dans l'API qu'au J3**, quand elle déposera des jobs. Au J0 elle ne fait que vérifier Valkey.

### Sécurité et dépendances

**Scripts d'installation des dépendances refusés par défaut.** pnpm 12 exige une décision par paquet (`allowBuilds`). Tous sont refusés : `esbuild`, `lmdb`, `msgpackr-extract`, `unrs-resolver` et les autres livrent des binaires précompilés et fonctionnent sans. Moins de code tiers exécuté à l'installation.

**Politique de licences dans `scripts/check-licenses.mjs`.** Liste blanche de licences permissives ; tout le reste échoue, y compris l'inconnu. MPL-2.0 est accepté pour des paquets nommés seulement (axe-core, imposé par la stack, et lightningcss, outil de build d'Angular) : c'est un copyleft limité aux fichiers du paquet, qu'on ne modifie pas.

**Identifiants locaux marqués `local-only`.** `docker compose up` doit marcher sur un clone neuf, donc le fichier Compose contient des mots de passe par défaut. Ils sont publics : l'API et le worker refusent de démarrer en production avec une valeur qui contient ce marqueur.

**Conteneurs durcis dès le squelette.** Utilisateur non privilégié, système de fichiers en lecture seule, aucune capacité Linux, `no-new-privileges`, limite de mémoire. Ports publiés sur `127.0.0.1` seulement.

**Topologie réseau posée dès le J0.** Cinq réseaux, dont trois sans route vers l'extérieur. Le worker ne partage aucun réseau avec PostgreSQL. Les services `browser` et `egress-proxy` arrivent au J1 avec leur code.

**Images figées par empreinte.** PostgreSQL 18.6, Valkey 9.1.2, nginx 1.30.5, Mailpit 1.31.5, Node 26.11.1. Actions GitHub figées par commit.

**L'API ne dévoile pas son framework** (`X-Powered-By` retiré). **Le build de l'interface n'insère aucun script en ligne** (`inlineCritical` désactivé), pour qu'une politique de sécurité du contenu stricte reste possible au J4.

### Interface

**Angular sans zone.js, composants autonomes, CSS maison.** C'est la configuration par défaut d'Angular 22. Les couleurs sont des variables CSS, toutes vérifiées au contraste AA.

**Le lien d'évitement déplace le focus par code.** Avec `<base href="/">`, un lien `#contenu` renverrait à l'accueil depuis toute autre route.

**Le serveur de développement Angular écoute sur le port 4300**, pas sur le 4200 par défaut, déjà occupé par un autre projet sur le poste de développement.

### Dépôt

**Une branche par jalon, fusionnée dans `main` après validation.** `main` ne contient que des jalons validés.

**Un Dockerfile unique à plusieurs cibles.** Les dépendances sont installées et le dépôt compilé une seule fois pour toutes les images.
