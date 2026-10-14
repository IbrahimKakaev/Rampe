# Rampe

Rampe est un outil de pré-audit d'accessibilité web pour les PME françaises. Il parcourt un site, exécute les tests d'accessibilité automatisables, rattache chaque défaut au critère du RGAA 4.1.2 concerné et suit l'évolution dans le temps.

Un test automatique ne prouve jamais la conformité au RGAA : Rampe parle de « pré-audit automatique » et indique toujours ce qui reste à vérifier à la main.

**État du projet :** jalon J0, le squelette. L'application démarre et affiche l'état de ses services ; le moteur de scan arrive au jalon J1. Voir [PLAN.md](PLAN.md).

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

## Développer

Il faut Node 26 et pnpm 12.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration   # démarre de vrais PostgreSQL et Valkey, Docker requis
pnpm --filter @rampe/e2e run install-browser   # une fois
pnpm test:e2e           # contre l'application lancée par docker compose
```

Les conventions, toutes les commandes et la structure du dépôt sont dans [CLAUDE.md](CLAUDE.md). Les choix techniques et leurs raisons sont dans [DECISIONS.md](DECISIONS.md).
