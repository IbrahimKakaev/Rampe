import { Component } from '@angular/core';
import { HTML_SNIPPET_MAX_LENGTH, SCAN_DEFAULTS, SCAN_MAX_PAGES_LIMIT } from '@rampe/shared';

/**
 * The page the robot's User-Agent links to. A site owner who sees RampeBot in
 * their logs learns here what it does and how to stop it. Every figure comes
 * from the settings the robot actually uses.
 */
@Component({
  selector: 'rampe-robot-page',
  template: `
    <h1>RampeBot, le robot de Rampe</h1>
    <div class="prose">
      <p class="page-intro">
        RampeBot visite des sites web pour en réaliser un pré-audit automatique d’accessibilité. Il
        se présente avec cet identifiant (User-Agent) :
      </p>
      <pre><code>Mozilla/5.0 (compatible; RampeBot/1.0; +adresse de cette page)</code></pre>

      <h2>Quels sites il visite</h2>
      <p>
        RampeBot ne visite que les sites dont le propriétaire a prouvé qu’ils lui appartiennent, en
        publiant un jeton dans un enregistrement DNS ou dans un fichier du site. La preuve est
        vérifiée de nouveau avant chaque visite. Si RampeBot visite votre site, c’est qu’une
        personne qui le gère l’a demandé.
      </p>

      <h2>Comment il se comporte</h2>
      <ul>
        <li>
          Il ouvre au plus une page toutes les {{ intervalSeconds }} secondes sur un même site, tous
          scans confondus, et respecte un délai plus long si votre robots.txt en fixe un
          (<code>Crawl-delay</code>).
        </li>
        <li>
          Il visite {{ defaults.maxPages }} pages par scan par défaut, {{ maxPagesLimit }} au plus,
          en suivant les liens jusqu’à {{ defaults.maxDepth }} clics de la page d’accueil et les
          pages de votre sitemap.xml, sans quitter l’adresse du site : les autres sous-domaines ne
          sont pas suivis.
        </li>
        <li>
          Il charge chaque page comme un navigateur, puis l’analyse, sans cliquer, sans remplir ni
          envoyer aucun formulaire. Il lit aussi votre robots.txt et votre sitemap.xml.
        </li>
        <li>Il ne se connecte à aucun compte : seules les pages publiques sont visitées.</li>
        <li>
          Il ne prend aucune capture d’écran. Il ne garde des pages que de courts extraits de code,
          {{ snippetLength }} caractères au plus, autour de chaque défaut détecté.
        </li>
      </ul>

      <h2>Comment le bloquer</h2>
      <p>
        RampeBot respecte le fichier robots.txt de votre site. Pour lui interdire tout le site,
        ajoutez :
      </p>
      <pre><code>User-agent: RampeBot
Disallow: /</code></pre>
      <p>
        Si le fichier robots.txt ne répond pas à cause d’une erreur du serveur, RampeBot considère
        que tout lui est interdit et ne visite rien.
      </p>
    </div>
  `,
})
export class RobotPage {
  protected readonly defaults = SCAN_DEFAULTS;
  protected readonly maxPagesLimit = SCAN_MAX_PAGES_LIMIT;
  protected readonly snippetLength = HTML_SNIPPET_MAX_LENGTH;
  protected readonly intervalSeconds = new Intl.NumberFormat('fr-FR').format(
    SCAN_DEFAULTS.navigationIntervalMs / 1000,
  );
}
