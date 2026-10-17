# Rampe

Rampe est un outil de pré-audit d'accessibilité web pour les PME françaises. Il parcourt un site, exécute les tests d'accessibilité automatisables, rattache chaque défaut au critère du RGAA 4.1.2 concerné et suit l'évolution dans le temps.

Un test automatique ne prouve jamais la conformité au RGAA : Rampe parle de « pré-audit automatique » et indique toujours ce qui reste à vérifier à la main.

**État du projet :** jalon J6, dernier jalon du MVP. Le tableau de bord permet de créer un compte, d'ajouter un site et d'en prouver la propriété, de lancer un scan et d'en lire les résultats, groupés par critère RGAA, par gravité ou par page, puis d'en télécharger le rapport PDF. Un site peut être rescanné chaque jour ou chaque semaine ; les membres reçoivent un e-mail quand de nouveaux défauts apparaissent. Un audit manuel évalue les 106 critères du RGAA sur un échantillon de pages, calcule le taux de conformité selon la méthode officielle et produit le brouillon de la déclaration d'accessibilité. Les propriétaires invitent leurs collègues et gèrent les rôles depuis la page « Membres ». Voir [PLAN.md](PLAN.md).

## Lancer l'application

Il faut Docker avec Compose. Depuis un clone neuf :

```sh
docker compose up --build
```

| Adresse                             | Contenu                             |
| ----------------------------------- | ----------------------------------- |
| http://127.0.0.1:8080               | Interface                           |
| http://127.0.0.1:8080/api/v1/health | État de l'API et de ses dépendances |
| http://127.0.0.1:8080/api/v1/docs   | Documentation OpenAPI               |
| http://127.0.0.1:8025               | Boîte de réception locale (Mailpit) |

Aucune configuration n'est nécessaire. Au premier lancement, un compte de démonstration est créé : `demo@rampe.local`, mot de passe `demo-local-only`. Son site de test est vérifié et scanné tout seul, en une minute environ : connectez-vous sur http://127.0.0.1:8080/connexion pour voir ses résultats. Ces identifiants sont réservés au poste de développement ; [.env.example](.env.example) explique comment les changer.

## Scanner un site

Une fois l'application lancée, cette commande scanne le site de test, qui contient six erreurs d'accessibilité volontaires, et affiche le rapport en JSON (environ 45 secondes) :

```sh
docker compose exec worker node dist/scan-cli.js http://fixture-site/
```

Le robot ne sort que par le proxy de sortie, qui refuse toute adresse non publique. Le site de test fait exception, en développement seulement, parce qu'il tourne sur une adresse privée de Docker.

## Développer

Il faut Node 26 et pnpm 12. Les tests d'intégration démarrent de vrais PostgreSQL et Valkey : Docker doit tourner.

```sh
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build
```

Les tests de bout en bout visent l'application lancée par Docker Compose. La deuxième ligne n'est utile qu'une fois, pour installer Chromium :

```sh
docker compose up --build --detach --wait
pnpm --filter @rampe/e2e run install-browser
pnpm test:e2e
docker compose down
```

Les conventions, toutes les commandes et la structure du dépôt sont dans [CLAUDE.md](CLAUDE.md). Les choix techniques et leurs raisons sont dans [DECISIONS.md](DECISIONS.md).

## Mise en ligne

Une démonstration se met en ligne gratuitement, sur un serveur Oracle Cloud « Always Free » avec HTTPS automatique : voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).
