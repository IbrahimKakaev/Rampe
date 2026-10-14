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
