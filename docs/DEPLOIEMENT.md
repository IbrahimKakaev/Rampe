# Mettre Rampe en ligne

Ce guide met en ligne une **démonstration** de Rampe, gratuitement :

- un serveur **Oracle Cloud « Always Free »** : 4 cœurs ARM, 24 Go de mémoire, gratuit sans limite de durée ;
- une adresse **DuckDNS**, avec un certificat HTTPS Let's Encrypt que Caddy obtient et renouvelle seul ;
- l'envoi des e-mails par **Brevo**, gratuit jusqu'à 300 e-mails par jour.

Ce n'est pas un service de production : il n'y a ni garantie de disponibilité ni sauvegarde hors du serveur, et Oracle peut récupérer une machine gratuite inactive. La même procédure fonctionne chez tout hébergeur qui offre une machine Linux avec Docker et au moins 8 Go de mémoire.

## 1. Le serveur

1. Créez un compte sur [cloud.oracle.com](https://www.oracle.com/cloud/free/). Une carte bancaire est demandée pour vérifier l'identité ; l'offre « Always Free » ne débite rien.
2. Créez une instance : image **Ubuntu 24.04**, forme **VM.Standard.A1.Flex** avec 4 OCPU et 24 Go de mémoire. Ajoutez votre clé SSH publique. Si la région n'a plus de place, réessayez plus tard ou dans une autre zone de disponibilité.
3. Ouvrez les ports 80 et 443. Dans le réseau virtuel de l'instance, ajoutez à sa liste de sécurité deux règles d'entrée TCP depuis `0.0.0.0/0`, ports 80 et 443. Puis, sur l'instance, dont le pare-feu ne laisse passer que SSH :

   ```sh
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

4. Installez Docker, avec le script officiel, puis reconnectez-vous :

   ```sh
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker "$USER"
   ```

## 2. L'adresse

1. Sur [duckdns.org](https://www.duckdns.org), connectez-vous et choisissez un sous-domaine, par exemple `rampe-demo`.
2. Donnez-lui l'adresse IP publique de l'instance.

## 3. Les e-mails

1. Créez un compte sur [brevo.com](https://www.brevo.com).
2. Dans « Expéditeurs », ajoutez et vérifiez l'adresse qui enverra les e-mails.
3. Dans « SMTP et API », créez une clé SMTP. Notez l'identifiant de connexion et la clé.

## 4. L'application

Sur l'instance :

```sh
git clone https://github.com/IbrahimKakaev/Rampe.git
cd Rampe
cp .env.prod.example .env.prod
```

Remplissez `.env.prod` : l'adresse DuckDNS, votre e-mail, l'URL SMTP de Brevo, l'expéditeur vérifié. Générez chaque secret avec :

```sh
openssl rand -base64 32 | tr -d '/+='
```

Puis lancez :

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

La première construction prend une dizaine de minutes. Ensuite, `https://<votre sous-domaine>.duckdns.org` sert l'application ; Caddy obtient le certificat à la première visite.

Les services refusent de démarrer avec un identifiant qui contient `local-only`, avec des cookies non sécurisés ou avec une exception d'adresse privée pour le robot : une erreur au démarrage dit laquelle. `docker compose … logs api` la montre.

## 5. La démonstration

En production, le site de test local n'existe pas : le robot ne joint que des sites publics. Pour une démonstration :

1. Créez votre compte sur l'application en ligne ; l'e-mail de confirmation arrive par Brevo.
2. Publiez un site que vous contrôlez, par exemple sur GitHub Pages (`<utilisateur>.github.io`), avec quelques erreurs volontaires.
3. Ajoutez-le dans Rampe et prouvez qu'il vous appartient par le fichier `.well-known/rampe-verification.txt`. Sur GitHub Pages, ajoutez aussi un fichier vide `.nojekyll` à la racine, sans quoi le dossier `.well-known` n'est pas publié.
4. Lancez le scan, puis invitez les personnes à qui vous montrez Rampe depuis la page « Membres ».

## 6. Entretien

Mettre à jour :

```sh
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Sauvegarder la base, à copier ensuite hors du serveur :

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U rampe rampe | gzip > "rampe-$(date +%F).sql.gz"
```

## Avant un vrai service

Une démonstration suffit pour présenter le projet. Un service ouvert à des clients demande en plus : un hébergement avec garantie de disponibilité, des sauvegardes hors du serveur et testées, une supervision, un nom de domaine à soi, et les documents juridiques (mentions légales, conditions d'utilisation, politique de confidentialité, registre des traitements RGPD).
