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

## Jalon J1, 14 octobre 2026

### Protection SSRF

**Un proxy de sortie unique, sur le chemin réseau.** Le navigateur et le worker n'ont aucune route vers l'extérieur ; tout passe par `egress-proxy`. Vérifier une URL avant de naviguer ne suffirait pas : Chromium résout lui-même les noms, suit les redirections et charge des sous-ressources, et l'interception de Playwright ne voit que la première URL d'une chaîne de redirections.

**Une liste blanche d'adresses, pas une liste noire.** Seules passent les adresses que `ipaddr.js` classe `unicast`, c'est-à-dire publiques ordinaires. Tout le reste est refusé, y compris les formes IPv6 qui transportent une adresse IPv4 (encapsulée, NAT64, 6to4, Teredo) et les plages de documentation. Une plage oubliée est refusée plutôt qu'autorisée. Seules les formes canoniques sont acceptées (`1.1.1` ou `0x7f.1` sont refusées), après normalisation de l'hôte par l'analyseur d'URL WHATWG, comme le fait un navigateur.

**Une seule résolution DNS, et la connexion part vers l'adresse vérifiée.** Toutes les adresses d'un nom doivent être publiques. Un changement de réponse DNS entre la vérification et la connexion (DNS rebinding) n'a donc pas d'effet. Le proxy préfère une adresse IPv4, car les réseaux Docker routent rarement l'IPv6 vers l'extérieur.

**Une réponse muette pour la page, détaillée dans les journaux.** Une page scannée peut lire la réponse du proxy : elle reçoit « Blocked by the Rampe egress proxy. » et l'en-tête `x-rampe-egress: blocked`, jamais l'adresse interne en cause. Les journaux du proxy, en JSON, gardent l'hôte, le port, l'adresse et la raison, mais ni le chemin ni la requête, qui peuvent porter des données personnelles.

**WebSockets par CONNECT seulement.** C'est ce qu'utilise Chromium derrière un proxy. Une mise à niveau sur une requête HTTP simple est refusée.

### Navigateur isolé

**Un conteneur `browser` construit sur l'image officielle de Playwright**, piloté par le worker via `chromium.launchServer` sur un chemin secret. Un test vérifie que la version de l'image suit celle de `playwright-core`.

**Le bac à sable de Chromium reste actif.** Il faut trois choses : le profil seccomp de Playwright (celui de Docker interdit les espaces de noms), `cap_drop: ALL` puis `cap_add: SYS_CHROOT`, et rien sur l'hôte. `SYS_CHROOT` n'entre que dans l'ensemble limite : l'utilisateur `pwuser` n'a aucune capacité effective, et Chromium s'en sert dans l'espace de noms qu'il crée pour s'y enfermer. Un test vérifie que les processus de rendu tournent dans leur propre espace de noms utilisateur.

Mon premier diagnostic accusait la restriction AppArmor d'Ubuntu 24.04 (`kernel.apparmor_restrict_unprivileged_userns`), et je l'avais levée sur la VM Colima. Un témoin a montré que la cause était `cap_drop: ALL` ; la VM a été remise dans son état d'origine. Aucun réglage d'hôte n'est nécessaire.

**Un navigateur pour tous les scans, un contexte par scan.** Chaque scan a ses propres cookies et son propre stockage. Les fenêtres surgissantes sont fermées, les téléchargements et les service workers désactivés. WebRTC ne peut pas contourner le proxy en UDP.

### Exploration

**Débit (D1) : 1,1 s entre deux requêtes au même hôte, pour tous les scans.** La clé Valkey `rampe:politeness:<hôte>` vit un intervalle ; prendre son tour, c'est la créer (`SET … NX PX`). Le dixième de seconde de marge garde l'écart au-dessus d'une seconde côté serveur, malgré la gigue du réseau. robots.txt et les sitemaps comptent comme des navigations. Un `Crawl-delay` plus long est respecté.

**robots.txt selon la RFC 9309.** Le robot suit le groupe de `RampeBot` s'il existe, sinon le groupe générique. Une erreur 4xx autorise tout ; une erreur 5xx ou l'absence de réponse interdit tout. `robots-parser` est chargé par `require()` avec un typage local, car ses définitions de types ne se résolvent pas sous NodeNext.

**Un refus du proxy vaut absence de réponse, pas réponse du site.** Sans cela, le 403 du proxy sur le robots.txt d'une adresse interne aurait été lu comme une erreur 4xx du site, c'est-à-dire « tout est permis ». Le scan ne serait pas allé plus loin, puisque le proxy bloque aussi la page, mais l'interprétation aurait été fausse. Le scan échoue alors avec la raison `site-unreachable`, distincte de `disallowed-by-robots` : le client doit savoir si son site n'a pas répondu ou s'il interdit le robot.

**« Même domaine » signifie même origine** : même schéma, même hôte, même port que l'adresse scannée. C'est plus strict que « même hôte » prévu au plan : un lien en `http://` depuis un site en `https://` n'est pas suivi.

**Sitemaps.** Le robot lit `/sitemap.xml` et ceux que robots.txt annonce, sur la même origine seulement : cinq documents, 1 000 pages et 10 Mo au plus. Les `<loc>` relatifs, hors protocole, sont ignorés. Les sitemaps compressés en gzip ne sont pas lus. Le format est assez simple pour se passer d'un analyseur XML.

**La limite de pages compte les navigations, échecs compris** : elle borne ce que le robot demande au site. Les liens interdits par robots.txt et ceux d'autres sites ne comptent pas.

**Une page = l'événement `load`, puis axe-core sur les règles WCAG 2.1 A et AA.** Le délai de 30 s couvre le chargement et l'analyse. Chaque échec devient un résultat (`timeout`, `blocked`, `http-error`, `not-html`, `redirected-off-site`, `navigation-failed`) : une mauvaise page n'arrête jamais le scan.

**Le rapport ne garde que le nécessaire** : règle, gravité, critères WCAG, sélecteur et extrait HTML de 500 caractères au plus par élément, coupé sans casser un caractère. Les descriptions, résumés d'échec et textes de la page sont écartés, car ils peuvent contenir des données personnelles. Au-delà de 2 000 éléments en défaut, la page est marquée `truncated`. Pour les règles réussies ou indéterminées, seul l'identifiant est gardé.

**Le format du rapport, dans `packages/shared`, est le contrat avec l'API du J3.** La commande de scan le valide avant de l'écrire.

**Limite connue : une redirection vers un autre site est suivie par le navigateur.** La page d'arrivée est chargée, puis classée `redirected-off-site` sans être analysée. La protection SSRF n'est pas en cause : la destination passe par le proxy comme toute autre. Bloquer ce chargement demanderait d'intercepter chaque saut de redirection par le protocole de débogage de Chrome ; ce n'est pas fait.

### Tests

**Les critères d'acceptation du J1 sont des tests de bout en bout**, contre l'application lancée par Compose. Ils lisent le journal du site de test pour vérifier les manières du robot. Une marque déposée dans ce journal avant chaque scan délimite ses requêtes ; c'est plus sûr qu'un horodatage, car l'horloge de la machine de test et celle de l'hôte Docker peuvent différer.

**La limite de 15 minutes est démontrée avec une limite de 5 secondes**, par le même chemin de code ; la valeur par défaut est vérifiée par un test unitaire.

**Le site de test journalise aussi les requêtes abandonnées** (statut 0), pour que le test de parallélisme voie la page lente. Sa sonde de santé interroge `/__health`, que les tests écartent.

**`axe-core` est une dépendance de développement du worker**, pour ses types seulement ; l'exécution utilise la copie qu'apporte `@axe-core/playwright`. Le `tsconfig` du worker inclut les types du DOM, nécessaires aux fonctions exécutées dans la page.

## Jalon J2, 14 octobre 2026

### Données du référentiel

**Le fichier officiel des critères est versionné dans le dépôt, figé par son empreinte.** `packages/rules/data/sources/rgaa-4.1.2/criteres.json` vient du dépôt de la DINUM au commit `95d5ef3`, sous Licence Ouverte 2.0. Le générateur refuse de tourner si son empreinte sha256 change : une mise à jour du référentiel est une décision, jamais un accident. Les données se régénèrent sans réseau.

**Les données sont générées en TypeScript, pas en JSON.** `src/rgaa/data/*.generated.ts` est typé, se charge sans configuration dans Node, Jest et le bundler d'Angular, et chaque ligne garde sa source. La commande `pnpm --filter @rampe/rules run generate` les reproduit à l'octet près ; la CI échoue si le résultat diffère de ce qui est versionné, par exemple après une mise à jour d'axe-core.

**Le texte officiel est repris tel quel**, liens Markdown retirés, typographie française comprise (espace insécable avant « ? »).

### Correspondance entre règles et critères

**Deux sources recoupées, aucune inventée.** axe-core étiquette ses règles avec des tests RGAA (`RGAA-1.1.1`) : c'est une correspondance de Deque, non officielle. Le référentiel officiel donne, pour chaque critère, ses critères WCAG. Un lien est **confirmé** quand l'étiquette d'axe-core désigne un critère dont les références officielles partagent un critère WCAG avec la règle ; **incertain** sinon. Chaque lien porte sa source et la raison de son état.

**Les correspondances par WCAG seules ne sont jamais affirmées.** Un même critère WCAG renvoie à jusqu'à 24 critères RGAA. Pour les règles sans étiquette RGAA, Rampe ne propose que des critères candidats.

**Résultat avec axe-core 4.13.0, avant revue :** 64 règles actives, 54 liens confirmés, 4 incertains, 6 règles sans étiquette.

**Les désaccords sont tranchés par une troisième source officielle : le libellé du test RGAA.** Aucun outil ni éditeur ne publie de table de correspondance officielle, et les taux d'automatisation qu'annoncent les éditeurs commerciaux ne sont pas vérifiables. Chaque décision est écrite et justifiée dans `src/rgaa/reviews.ts`, appliquée par-dessus les données générées ; une décision qui ne correspond plus aux données (après une mise à jour d'axe-core) empêche le paquet de se charger.

- `area-alt` → 1.1 et `server-side-image-map` → 1.1 : **confirmés**. Les tests 1.1.2 et 1.1.4 décrivent exactement ce que vérifient ces règles ; seules les références WCAG différaient.
- `aria-meter-name` et `aria-progressbar-name` → 11.1 : **rejetés**. Le critère 11.1 porte sur les champs de formulaire, ce que ni une jauge ni une barre de progression ne sont.
- `audio-caption` → 4.1 (test 4.1.1) et `avoid-inline-spacing` → 10.12 (test 10.12.1) : **ajoutés**. Même critère WCAG et même objet. Pour `audio-caption`, une transcription adjacente satisfait le RGAA sans piste de sous-titres : le critère reste partiellement automatisable.
- Les quatre autres règles sans étiquette (`aria-braille-equivalent`, `aria-roledescription`, `aria-tooltip-name`, `summary-name`) relèvent de WCAG 4.1.2, qui renvoie à 17 critères : elles restent sans critère, avec des candidats.

**Après revue :** 58 liens confirmés, aucun incertain, 6 règles sans critère. Le détail, critère par critère, est dans [docs/rgaa-4.1.2.md](docs/rgaa-4.1.2.md), généré.

### Classement des critères

**Classement dérivé, sauf l'« automatisable », qui est une décision écrite.** Un critère sans règle confirmée est « manuel » ; avec au moins une, « partiellement automatisable ». « Automatisable » exige qu'une règle tranche le critère dans les deux sens : un succès prouve que le critère est respecté. Ce n'est vrai que du critère 8.5 (présence d'un titre de page), justifié dans `src/rgaa/automatable.ts`. Le critère 8.3, le plus proche, ne l'est pas : la seconde condition du test 8.3.1 admet une langue donnée sur chaque élément de texte, si bien qu'un échec de `html-has-lang` ne prouve pas un défaut. Le classement est délibérément prudent : 1 automatisable, 27 partiels, 78 manuels, donc 105 critères à vérifier à la main après un pré-audit.

### Indicateurs

**Une vérification = une règle sur une page ; le pire résultat l'emporte.** axe-core peut ranger une même règle dans plusieurs catégories quand ses éléments diffèrent. Un défaut sur un élément fait échouer la vérification ; un élément indéterminé l'empêche de réussir.

**Le taux de conformité suit la méthode officielle et reste muet tant que l'audit est incomplet.** Il vaut `null` tant qu'une évaluation manque, et aussi quand aucun critère ne s'applique, car cela ne prouverait rien. Une page où rien ne s'applique est écartée du taux moyen. Les états suivent la déclaration d'accessibilité : totale à 100 %, partielle à partir de 50 %, non conforme en dessous.

**Un défaut n'est « corrigé » que si sa page a été analysée en entier dans les deux scans.** Les pages en échec, non atteintes ou tronquées n'entrent pas dans la comparaison.

### Empreinte d'un défaut

**Règle, chemin de la page, sélecteur normalisé, et rang en cas d'égalité.** Les sélecteurs observés sur le site de test montrent qu'axe-core décrit un élément par sa position quand rien d'autre ne le distingue (`img:nth-child(2)`). La normalisation retire les positions, les noms générés par les outils (classes CSS-in-JS, attributs d'Angular et de Vue, modules CSS, identifiants numérotés) et garde le reste. Des défauts devenus identiques sont départagés par leur ordre dans la page.

**Le compromis :** si l'un de deux défauts identiques est corrigé, celui qui reste prend le premier rang, et la comparaison peut désigner le mauvais des deux comme corrigé. Les comptes restent justes. L'empreinte est une chaîne lisible, sans hachage : elle se lit dans les journaux et en base.

### Textes de correction

**64 textes en français, un par règle exécutée**, dans `src/content/fr/corrections.ts` : ce qui ne va pas, qui en est gêné, comment corriger. C'est un fichier de contenu, modifiable sans toucher au code ; un test vérifie qu'aucune règle n'en manque et qu'aucun texte ne parle de conformité.

### Outillage

**Les scripts de génération tournent avec le retrait de types natif de Node 26**, sans outil supplémentaire. Le rapport lit le paquet compilé, d'où l'ordre : données, compilation, rapport.

**La commande de scan écrit chaque étape, horodatée, sur la sortie d'erreur** (robots.txt, sitemaps, connexion au navigateur, chaque page, fermeture). Les tests de bout en bout l'affichent quand un scan échoue ou dépasse son délai.

**Les tests de bout en bout ferment l'entrée standard de `docker compose exec`.** La commande la transmet toujours au conteneur. Pendant le J2, la suite complète s'est bloquée deux fois sur le même test, que rien d'autre ne reproduisait, ni à la main ni isolé. Depuis cette correction, trois passages complets consécutifs ont réussi. C'est la cause la plus probable, sans preuve formelle.

## Jalon J3, 14 octobre 2026

### Données

**Prisma 7.10 sur PostgreSQL, avec l'adaptateur `pg`.** Le client est généré en TypeScript dans `apps/api/src/generated/`, jamais versionné : la vérification des types, les tests et le build le régénèrent. Les migrations sont versionnées dans `apps/api/prisma/migrations` et appliquées par un service `migrate` avant que l'API démarre. Le moteur de migration est téléchargé à la construction de l'image, car le réseau de la base n'a pas de sortie.

**Toute table d'une organisation porte `organization_id`, avec suppression en cascade.** La suppression d'une organisation efface tout ce qui lui appartient ; un test le vérifie table par table, en lisant le schéma de la base.

**Identifiants UUID v7**, générés par Prisma : triés dans le temps, sans révéler de compteur.

### Authentification

**Sessions en base, dans un cookie `HttpOnly`, `SameSite=Lax`.** Seul le hachage SHA-256 du jeton est stocké, comme pour les jetons envoyés par e-mail. Une session dure 7 jours. Une réinitialisation de mot de passe les ferme toutes. `Secure` est obligatoire en production ; seule l'application locale, servie en HTTP, s'en passe.

**Protection CSRF par double cookie, le schéma que l'`HttpClient` d'Angular gère tout seul :** le cookie lisible `XSRF-TOKEN` doit être répété dans l'en-tête `X-XSRF-TOKEN` de toute requête qui modifie quelque chose.

**argon2id avec les réglages par défaut de la bibliothèque** (64 Mio, 3 passes), au-dessus du minimum de l'OWASP. Une connexion avec une adresse inconnue vérifie quand même un hachage, pour durer autant qu'avec une adresse connue.

**Aucune réponse ne révèle si une adresse a un compte.** L'inscription et la demande de réinitialisation répondent toujours 202. Une adresse déjà inscrite reçoit un rappel par e-mail.

**L'inscription crée aussi l'organisation**, dont la personne devient propriétaire : une PME commence ainsi en une étape.

**Limitation de débit maison, dans Valkey, au lieu de `@nestjs/throttler`.** Ce paquet, en CommonJS, importe NestJS, en modules ES : Node l'accepte, mais Jest refuse ce cycle de chargement. Le garde fait une soixantaine de lignes et un script Lua atomique ; les compteurs sont partagés entre instances. Les routes d'authentification tolèrent 10 essais par minute et par adresse IP, puis bloquent 5 minutes. Sans Valkey, l'API répond 503 plutôt que de laisser passer des tentatives sans limite ; seule la route de santé n'est pas limitée.

**`trust proxy` vaut 1** : exactement un proxy, nginx, précède l'API, et son `X-Forwarded-For` donne l'adresse du client.

### Organisations et isolation

**Un garde global contrôle chaque route qui a un paramètre `:org`** et répond 404 à un non-membre, comme pour une organisation inexistante. Les services filtrent ensuite chaque requête sur l'organisation. Un test lit toutes les routes dans l'OpenAPI et appelle chacune comme membre d'une autre organisation : d'abord sur l'organisation d'autrui, puis sur la sienne avec les identifiants d'autrui. Une route ajoutée plus tard est couverte d'office, et un paramètre de chemin inconnu du test le fait échouer.

**Une organisation garde toujours au moins un propriétaire.** Une invitation n'est acceptable que par le compte qui a l'adresse invitée.

### Sites et vérification de propriété

**DNS : un enregistrement TXT `_rampe-verification.<hôte>` de valeur `rampe-verification=<jeton>`.** Un nom dédié évite de toucher aux enregistrements existants et fonctionne même sous un CNAME. L'API lit le DNS elle-même : cela n'ouvre aucune connexion vers le site.

**Fichier : `/.well-known/rampe-verification.txt`, lu par le worker à travers le proxy de sortie.** L'API ne se connecte jamais au site d'un client. Elle dépose une demande dans la file `site-checks` et attend la réponse, 30 s au plus.

**La preuve est revérifiée avant chaque scan.** Si elle a disparu, le site redevient « non vérifié » et le scan est refusé.

### Scans

**Le worker publie un message par page, puis un message de clôture, dans la file `scan-events`.** Aucun message n'est gros, quelle que soit la taille du site. Les identifiants de message dérivent de celui du scan, donc un message reçu deux fois n'est enregistré qu'une fois. La clôture est rejetée tant que toutes les pages ne sont pas enregistrées, et la file la retente avec un délai croissant. Un plantage du moteur est publié aussi : un scan ne reste jamais « en cours » pour toujours.

**L'API interprète, le worker ne fait que rapporter.** Correspondance RGAA, empreintes, score et comparaison avec le scan précédent sont calculés à l'enregistrement, avec `packages/rules`. Le message du worker est validé par son schéma : il franchit une frontière de confiance.

**Un seul scan à la fois par site, et par worker.** Le navigateur est la ressource rare.

### Robustesse

**Les files BullMQ de l'API écoutent leurs erreurs.** Sans écouteur, la première coupure de Valkey aurait arrêté l'API : un test d'intégration l'a révélé.

**Toute fermeture de connexion est bornée dans le temps.** Un client dont le serveur a disparu peut ne jamais finir de se fermer ; il ne doit pas empêcher le processus de s'arrêter.

**Les pannes se simulent en mettant les conteneurs en pause**, pas en les arrêtant : c'est une vraie panne vue des clients, dont on teste aussi le retour.

### Démonstration

**`docker compose up` prépare la démonstration avec un script séparé, `seed-demo`, qui refuse de tourner en production.** Il crée le compte `demo@rampe.local` et le site de test, puis passe par la vraie API : connexion, vérification de propriété par le fichier (que le site de test sert avec un jeton de démonstration), lancement du scan. Rien n'est factice dans le résultat : c'est un vrai scan.

## Jalon J4, 15 octobre 2026

### Interface

**Aucun style de composant : toute la CSS est dans les feuilles globales** (`apps/web/src/styles/`). Angular injecte les styles de composants dans des éléments `<style>` au moment de l'exécution, ce qu'une politique de sécurité du contenu stricte interdit. Sans eux, la politique peut rester `style-src 'self'`, sans nonce ni `unsafe-inline`. Un test de bout en bout vérifie qu'un style injecté est bien refusé.

**Politique de sécurité du contenu stricte dans nginx :** `default-src 'none'`, puis `'self'` pour les scripts, les styles, les images, les polices et les appels à l'API ; `frame-ancestors 'none'`. Le build n'insère aucun script en ligne (décision du J0). Chaque page est visitée en CI avec cette politique, et toute violation fait échouer le test.

**Pas d'Angular CDK, contrairement au plan.** Il était prévu pour la gestion du focus et les annonces. Son annonceur injecte ses propres styles, ce qui casserait la politique de sécurité. Les besoins sont minces : une zone `aria-live` unique dans la coquille (`core/announcer.ts`) et le déplacement du focus (`core/focus.ts`). Aucune fenêtre modale, donc pas de piège à focus à écrire.

**Après chaque changement de page, le focus va au titre `h1`**, que le lecteur d'écran annonce. Une application monopage ne recharge rien : sans cela, rien ne signale le changement. Un simple changement de paramètre de requête, comme le regroupement des défauts, garde le focus là où il est. Chaque page a son titre d'onglet, précisé avec le nom du site ou du défaut une fois les données chargées.

**Lectures avec `httpResource`, validées par les schémas partagés.** C'est l'API stable d'Angular 22 pour lire des données sous forme de signaux. Son option `parse` valide chaque réponse avec le schéma Zod de `@rampe/shared` : l'API est aussi une frontière de confiance pour le navigateur.

**Formulaires sans `@angular/forms`.** Les valeurs sont lues à l'envoi (`FormData`) et validées avec les schémas que l'API applique : aucune requête que l'API refuserait n'est envoyée. Chaque champ invalide reçoit son propre message, relié par `aria-describedby`, et le premier reçoit le focus. Le bouton d'envoi n'est jamais désactivé, puisqu'un bouton désactivé perd le focus ; un second envoi est ignoré pendant que le premier est en cours.

**Les chemins des pages vivent dans `@rampe/shared` (`WEB_ROUTES`).** Le routeur, les liens des e-mails de l'API et les tests de bout en bout les lisent au même endroit. Un test unitaire vérifie que le routeur déclare exactement ces chemins. Le test d'accessibilité est indexé sur `WebRoute` : une page ajoutée sans visite ne compile pas.

**Les textes de correction viennent de `packages/rules`, par l'API.** Leurs passages de code, notés entre accents graves, sont rendus en `<code>` par des nœuds de texte, jamais par `innerHTML`. Un test lit toutes les sources de l'interface et échoue si l'un de ces textes y est recopié, ou si le mot « conforme » y apparaît.

**Le score ne s'affiche que par le composant `rampe-score`**, qui porte l'attribut `data-score`. Le test de bout en bout en déduit, page par page, que l'avertissement de pré-audit (`rampe-pre-audit-notice`) et le nombre de critères à vérifier manuellement sont présents.

**Le graphique est un SVG maison, doublé d'un tableau.** Une seule série : pas de légende, échelle toujours de 0 à 100 % pour qu'un petit écart ne paraisse pas grand, trait de 2 px, points de 10 px. Le SVG porte un résumé textuel (`role="img"`). Le tableau qui suit donne chaque valeur, ce qui remplace l'infobulle au survol, inaccessible au clavier.

**Les défauts sont groupés derrière des boutons de divulgation**, chargés à la première ouverture : un grand site peut en avoir des milliers. Le regroupement choisi est dans l'adresse (`?groupe=gravite`), qu'on peut donc partager.

### API

**Ajouts au contrat :** le titre en français de chaque défaut dans les listes ; l'intitulé officiel de chaque critère nommé dans le détail d'un défaut ; le filtre `criterion=none` pour les défauts sans critère certain ; le nombre de critères à vérifier manuellement dans le dernier scan de chaque site.

### Tests

**Le site de test répond sous un second nom, `fixture-site-e2e`.** Pour Rampe, c'est un autre site : le parcours de bout en bout l'ajoute à un nouveau compte, comme le ferait un client. Il y publie le jeton affiché par l'interface par un port de contrôle qui n'écoute que dans le conteneur (`docker compose exec`). Le nom est ajouté à la liste d'hôtes privés autorisés du proxy (D3), toujours refusée en production.

**Le parcours complet est joué deux fois : à la souris, puis au clavier seul.** Au clavier, chaque cible est atteinte par la touche Tab, et chaque arrêt du focus doit montrer un contour visible d'au moins 2 px. À la souris, chaque étape passe aussi par axe-core, ce qui couvre les états qu'une visite page par page n'atteint pas : formulaire envoyé, vérification échouée, scan en cours.

**Les tests ouvrent une seule session du compte de démonstration**, partagée par cookie. La connexion est limitée à 10 essais par minute et par adresse IP : les tests ne doivent pas déclencher la protection qu'ils exercent.

## Jalon J5, 16 octobre 2026

### Rapport PDF

**L'API écrit le HTML du rapport, le worker l'imprime en PDF balisé dans le navigateur isolé** (`page.pdf({ tagged: true, outline: true })`). Le HTML vient d'une fonction pure (`apps/api/src/reports/report-html.ts`), testée seule. Le rapport cite le site scanné (adresses, titres, extraits de code) : l'API échappe tout ce qu'elle cite, et le worker l'imprime JavaScript coupé, contexte hors ligne et toute requête refusée. Le PDF n'est jamais conservé ; le job qui le transporte est supprimé dès qu'il est rendu.

**Le PDF est balisé : arbre de structure, titres, tableaux à en-têtes, listes, langue `fr`.** Le test de bout en bout le lit avec pdfjs (Mozilla, Apache-2.0, en dépendance des tests seulement) comme le ferait un lecteur d'écran : texte, rôles de la structure, marquage et langue.

**Les occurrences d'une règle sont listées 25 au plus par critère**, les suivantes comptées. L'explication de la correction est donnée une fois par règle. La limite de pages n'apparaît pas dans le périmètre : elle n'est pas enregistrée avec le scan, et celle du site a pu changer depuis.

### Planification

**Une tâche par minute démarre les scans dus, d'après `sites.next_scan_at`.** L'état est en base, donc un redémarrage ne perd rien. Chaque site dû est « réclamé » par une mise à jour conditionnelle : plusieurs instances de l'API ne lancent jamais deux fois le même scan. Le prochain passage se compte à partir du lancement, pas de l'échéance manquée : un site oublié pendant une panne n'est pas scanné plusieurs fois de suite. Un site dont la preuve de propriété a disparu saute son tour et redevient « non vérifié ».

**Les tâches périodiques sont des planificateurs BullMQ (`upsertJobScheduler`) d'une file `maintenance`** : le démarrage des scans dus chaque minute, la purge chaque nuit à 3 h, heure de Paris. Un planificateur n'existe qu'une fois dans Valkey, quel que soit le nombre d'instances de l'API.

**Une horloge injectable (`Clock`).** La planification et la purge lisent l'heure par elle ; les tests d'intégration avancent l'horloge d'un jour, d'une semaine ou d'un an au lieu d'attendre.

**La planification se règle par `PATCH /orgs/:org/sites/:site`, pas par un `PUT …/schedule` dédié** comme le prévoyait le plan : la route existait déjà depuis le J3 pour la limite de pages, et un seul formulaire règle les deux.

### Alertes

**Une régression, c'est au moins un défaut nouveau sur une page analysée dans les deux scans.** Le premier scan d'un site, ou un scan sans défaut nouveau, n'envoie rien. Les défauts corrigés sont mentionnés dans l'alerte, jamais seuls.

**L'alerte part au plus une fois par scan**, vers chaque membre à l'adresse confirmée, un e-mail par personne : les adresses ne sont pas montrées aux autres. Une ligne de `notifications`, unique par scan, est écrite avant l'envoi. Si le serveur de messagerie tombe à ce moment, l'alerte est perdue plutôt qu'envoyée deux fois, et le journal le dit. L'enregistrement du scan ne dépend jamais de l'envoi.

### Conservation et suppression

**La purge supprime les scans plus anciens que la durée de conservation de leur organisation**, comptée en mois civils, avec leurs pages, défauts et alertes. Un scan en cours n'est jamais supprimé.

**Les jobs ne gardent plus de données après usage.** Un scan terminé et un message du worker enregistré sont retirés de Valkey aussitôt, puisque ces messages contiennent des extraits de pages. Un job en échec est gardé une semaine, pour l'exploitant. L'enregistrement des messages est idempotent : un message renvoyé après son retrait ne fait aucun dégât.

**Supprimer une organisation retire aussi ses jobs de Valkey** : scans en attente, messages du worker non traités ou en échec. Un scan en cours d'exécution ne peut pas être interrompu ; ses messages ne trouvent plus de scan et sont ignorés. Un test vérifie, table par table et file par file, qu'il ne reste rien.

### Interface

**Les libellés français des codes du moteur** (motifs d'arrêt, erreurs de page, gravités) vivent dans `@rampe/shared` : l'interface, le rapport et les e-mails disent la même chose.

**Une page « Paramètres de l'organisation »** : nom, durée de conservation, suppression confirmée par le mot de passe. Les membres qui ne sont pas propriétaires la voient sans les formulaires.

## Jalon J6, 16 octobre 2026

### Audit manuel

**Un audit part d'un scan terminé, sur un échantillon de pages que l'auditeur compose** parmi les pages du scan, ou hors du scan (aucune proposition automatique pour celles-là). Chacun des 106 critères reçoit, sur chaque page, un statut (conforme, non conforme, non applicable) et une note. Retirer une page de l'échantillon supprime ses évaluations ; une page gardée garde les siennes.

**Les propositions automatiques suivent le tableau du §4.2 du plan, avec une lecture stricte de la règle d'honnêteté.** La logique est une fonction pure de `packages/rules` (`audit.ts`), couverte à 100 % :

- un défaut à la correspondance confirmée donne « non conforme », un statut qui compte. L'auditeur peut l'infirmer, mais l'API exige alors une note : un faux positif s'explique ;
- un défaut à la correspondance incertaine donne un indice, jamais un statut ;
- un critère automatisable dont les règles ont toutes réussi sur la page reçoit une proposition « conforme », qui **ne compte pas tant que l'auditeur ne l'a pas retenue**. Le plan validé laissait ce statut compter seul. Je l'ai refusé : la règle d'honnêteté veut que l'interface n'affiche jamais « conforme » sur la seule base des tests automatiques ;
- les critères manuels ou partiellement automatisables ne reçoivent rien : l'auditeur décide.

Aucune règle active n'a aujourd'hui de correspondance incertaine : les revues du J2 les ont toutes tranchées. Le cas de l'indice est testé dans `packages/rules`, faute de pouvoir le produire de bout en bout.

**Le taux de conformité et le taux moyen suivent la méthode officielle** (`conformity.ts`, écrit au J2). Ils n'existent que lorsque chaque critère a un statut sur chaque page ; avant, l'API et l'interface donnent le nombre d'évaluations restantes. Un exemple calculé à la main est vérifié en intégration et de bout en bout : 2 critères respectés sur 3 applicables, soit 66,7 %, et un taux moyen de 75 %.

**La grille se parcourt par thématique, un formulaire par critère.** Le statut est un groupe de boutons radio, enregistré par un bouton qui nomme le critère, jamais à chaque flèche. Un filtre montre les seuls critères à évaluer ; quand un critère enregistré en sort, l'enregistrement est annoncé et le focus revient au titre de la thématique.

**Le mot « conforme » apparaît dans les vues d'audit**, puisqu'il y désigne le statut choisi par l'auditeur. Le contrôle des sources et celui de chaque page l'interdisent toujours dans les vues de pré-audit. Un test vérifie qu'aucune vue d'audit n'affiche de score automatique.

### Déclaration d'accessibilité

**Le texte suit le modèle officiel**, consulté le 16 octobre 2026 sur accessibilite.numerique.gouv.fr. Il comprend l'engagement, l'état de conformité et les résultats des tests, les contenus non accessibles (non-conformités, dérogations, contenus non soumis), l'établissement de la déclaration (technologies, environnement de test avec les technologies d'assistance, outils, pages vérifiées), le retour d'information et le contact, et les voies de recours. Les phrases fixes vérifiées sur le modèle sont reprises telles quelles, dont les trois voies vers le Défenseur des droits.

**La déclaration est générée par l'API, en blocs** (paragraphes, listes avec liens), à partir de l'audit et de ce que la personne complète. Ce qui manque apparaît « [À compléter : …] ». Tant que l'audit n'est pas complet, c'est un brouillon : son titre et son premier paragraphe le disent, et elle ne donne ni état de conformité ni taux.

### API

**Le test d'isolation couvre aussi les routes PUT**, qu'il ignorait jusqu'ici, et les ressources d'un audit (audit, page de l'échantillon, critère).

**`GET /referentials/rgaa-4.1.2/criteria`**, prévu au plan, est livré : les 106 critères et leur classement, sans session.
