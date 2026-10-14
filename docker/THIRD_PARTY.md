# Fichiers tiers

| Fichier                 | Origine                                                                                                                                                                                  | Licence                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `seccomp-chromium.json` | Profil seccomp de Playwright, [`utils/docker/seccomp_profile.json`](https://github.com/microsoft/playwright/blob/v1.64.0/utils/docker/seccomp_profile.json), version 1.64.0, non modifié | [Apache 2.0](https://github.com/microsoft/playwright/blob/v1.64.0/LICENSE), © Microsoft Corporation |

Le profil seccomp par défaut de Docker interdit la création des espaces de noms dont le bac à sable de Chromium a besoin ; celui de Playwright les autorise. Il est appliqué au seul conteneur `browser`.
