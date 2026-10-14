# Rampe

Rampe est un outil de pré-audit d'accessibilité web pour les PME françaises. Il parcourt un site, exécute les tests d'accessibilité automatisables, rattache chaque défaut au critère du RGAA 4.1.2 concerné et suit l'évolution dans le temps.

Un test automatique ne prouve jamais la conformité au RGAA : Rampe parle de « pré-audit automatique » et indique toujours ce qui reste à vérifier à la main.

**État du projet :** jalon J1, le moteur de scan. Il explore un site, l'analyse avec axe-core et produit un rapport ; l'API qui l'enregistrera arrive au jalon J3. Voir [PLAN.md](PLAN.md).

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

Aucune configuration n'est nécessaire. Les identifiants par défaut sont réservés au poste de développement ; [.env.example](.env.example) explique comment les changer.

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
