# Cahier des charges de Rampe

Texte intégral de la demande initiale du 14 octobre 2026, recopié sans modification. C'est la référence en cas de doute ; [PLAN.md](../PLAN.md) en découle.

---

Tu es l'ingénieur principal de Rampe, un SaaS d'audit d'accessibilité web pour les PME françaises. Tu le construis de zéro dans ce dépôt vide, par jalons validés. La qualité prime sur la vitesse.

## 1. Contexte produit
- Depuis le 28 juin 2025, les services de commerce en ligne, de banque et de transport doivent être accessibles aux personnes handicapées (European Accessibility Act, transposé en droit français). La preuve attendue est un audit RGAA 4.1.2 (106 critères).
- Rampe parcourt un site, exécute les tests d'accessibilité automatisables, rattache chaque défaut au critère RGAA concerné, explique la correction en français, suit l'évolution dans le temps et alerte en cas de régression.
- Utilisateurs : PME qui vendent en ligne, agences web (plusieurs sites clients), et un auditeur humain qui complète les critères non automatisables.
- Règle d'honnêteté absolue : un test automatique ne prouve jamais la conformité RGAA. L'interface n'affiche jamais « conforme » sur la seule base des tests automatiques. Elle parle de « pré-audit automatique » et indique toujours combien de critères restent à vérifier manuellement.

## 2. Stack imposée
- Monorepo pnpm, TypeScript strict partout.
- apps/web : Angular (dernière version stable), interface en français.
- apps/api : NestJS, API REST documentée en OpenAPI.
- apps/worker : moteur de scan avec Playwright (Chromium headless) et axe-core (@axe-core/playwright).
- packages/rules : correspondance WCAG ↔ RGAA 4.1.2 et calcul des scores, en code pur sans I/O, couvert à 100 % par les tests.
- packages/shared : types et schémas de validation partagés.
- PostgreSQL avec Prisma (migrations versionnées), Redis avec BullMQ (file de scans et planification).
- Docker Compose pour tout l'environnement local, GitHub Actions pour la CI.
- Tests : Jest (unitaires et intégration), Playwright (bout en bout).
Si tu veux dévier de cette stack, propose-le avec une justification et attends mon accord.

## 3. Fonctionnalités du MVP

### Comptes et organisations
- Inscription et connexion par e-mail et mot de passe (argon2id), réinitialisation par e-mail (Mailpit en local).
- Organisations à plusieurs membres (rôles owner et member). Isolation stricte entre organisations, couverte par des tests.

### Sites et vérification de propriété
- Ajout d'un site par son URL racine.
- Aucun scan avant vérification de propriété : enregistrement DNS TXT ou fichier /.well-known/rampe-verification.txt contenant un jeton.

### Moteur de scan
- Exploration en largeur du même domaine, depuis la page d'accueil et sitemap.xml s'il existe. Respect de robots.txt. Limite configurable (25 pages par défaut), profondeur maximale 3.
- User-Agent identifiable : RampeBot/1.0 avec l'URL d'une page d'information.
- Politesse : 1 requête par seconde maximum par domaine, 2 pages en parallèle maximum par scan, 30 s maximum par page, 15 min maximum par scan.
- Pour chaque page : chargement complet, exécution d'axe-core sur les règles WCAG 2.1 A et AA, collecte des violations (règle, gravité, sélecteur, extrait HTML tronqué à 500 caractères, critères WCAG).
- Empreinte stable pour chaque défaut (règle + sélecteur normalisé + chemin de page), pour le suivre d'un scan à l'autre.
- Sécurité du robot, non négociable : protection SSRF complète (http et https uniquement, ports 80 et 443, résolution DNS puis blocage des IP privées, loopback, link-local et 169.254.169.254, nouvelle vérification à chaque redirection). Navigateur dans un conteneur isolé sans accès au réseau interne, avec limites CPU et mémoire.

### Règles RGAA et score
- Construis la correspondance WCAG 2.1 ↔ critères RGAA 4.1.2 à partir des sources officielles (accessibilite.numerique.gouv.fr), dans un fichier de données versionné qui cite la source de chaque ligne. Classe chaque critère : automatisable, partiellement automatisable ou manuel. Signale toute correspondance incertaine au lieu de l'inventer.
- Deux indicateurs distincts :
  1. le score de pré-audit automatique, c'est-à-dire la part des vérifications automatiques réussies ;
  2. le taux de conformité RGAA, calculé selon la méthode officielle du RGAA, affiché uniquement quand tous les critères applicables ont été évalués (automatique et manuel).

### Tableau de bord (Angular)
- Liste des sites avec leur dernier score et leur tendance.
- Résultats d'un scan : défauts groupés par critère RGAA, par gravité et par page. Le détail de chaque défaut montre l'extrait de code, l'emplacement et la correction expliquée en français clair. Ces textes vivent dans un fichier de contenus éditable, pas en dur dans les composants.
- Graphique d'évolution du score dans le temps.
- L'application elle-même doit être accessible : 0 violation axe de gravité « serious » ou « critical » sur toutes ses pages, navigation complète au clavier, contrastes AA. Vérifié en CI.

### Rapports
- Export PDF du pré-audit généré depuis un gabarit HTML : page de garde, synthèse, défauts par critère, critères à vérifier manuellement, date et périmètre.

### Suivi continu et alertes
- Re-scan planifié (quotidien ou hebdomadaire, au choix) et déclenchable par l'API.
- Comparaison avec le scan précédent (nouveaux défauts, défauts corrigés) et e-mail d'alerte en cas de régression.

### Audit manuel (dernier jalon du MVP)
- Grille des 106 critères RGAA par page de l'échantillon : conforme, non conforme ou non applicable, avec une note. Combinée aux résultats automatiques pour calculer le taux de conformité.
- Génération d'un brouillon de déclaration d'accessibilité, marqué « brouillon » tant que l'audit n'est pas complet.

Hors périmètre du MVP (ne pas coder, mais ne pas bloquer) : paiement Stripe, marque blanche pour les agences, intégration dans la CI des clients.

## 4. Exigences non fonctionnelles
- Sécurité :
  - validation de toutes les entrées ;
  - contrôle d'autorisation par organisation sur chaque endpoint ;
  - limitation de débit sur l'authentification et en-têtes de sécurité ;
  - aucun secret dans le dépôt (fournir .env.example) ;
  - audit des dépendances en CI, avec des licences compatibles avec un SaaS commercial (pas de GPL ni d'AGPL).
- RGPD : ne stocker des pages scannées que le strict nécessaire (pas de captures d'écran complètes dans le MVP), durée de conservation configurable (12 mois par défaut), suppression complète d'une organisation à la demande.
- Qualité : lint, formatage, vérification des types et tests au vert en CI. Aucun test désactivé ou affaibli pour passer. Aucune donnée factice dans le code de production.
- Site de test local (apps/fixture-site) contenant des erreurs volontaires connues : image sans alternative, champ sans étiquette, contraste insuffisant, lien vide, langue absente, titre manquant. Les tests de bout en bout vérifient que chaque erreur est détectée et rattachée au bon critère.
- `docker compose up` depuis un clone neuf lance toute l'application avec un compte et un site de démonstration.

## 5. Méthode de travail
1. Lis ce document en entier et pose d'abord tes questions bloquantes, s'il y en a.
2. Rédige PLAN.md : architecture (diagramme Mermaid), modèle de données, endpoints, découpage en jalons avec critères d'acceptation et risques. Attends ma validation avant d'écrire du code.
3. Crée CLAUDE.md (conventions, commandes, structure) et DECISIONS.md (chaque choix technique et sa raison), et tiens-les à jour.
4. Jalons :
   - J0 squelette et CI ;
   - J1 moteur de scan et site de test ;
   - J2 règles RGAA et score ;
   - J3 API, base de données et vérification de propriété ;
   - J4 tableau de bord ;
   - J5 rapports, suivi et alertes ;
   - J6 audit manuel et déclaration.
5. Un jalon n'est terminé que si le lint, la vérification des types, les tests et le build passent, que `docker compose up` fonctionne, que les critères d'acceptation sont démontrés et qu'un commit conventionnel est fait. Termine chaque jalon par un résumé : ce qui marche, comment le vérifier, ce qui reste et les écarts au plan. Puis attends mon feu vert.
6. Vérifie les API des bibliothèques dans leur documentation ou dans les types installés, et n'invente aucune fonction. Si une exigence est impossible ou ambiguë, arrête-toi et dis-le plutôt que de la contourner.

Commence par l'étape 1.
