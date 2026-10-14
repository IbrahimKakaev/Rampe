/**
 * Explanations of the defects found by the automated rules, in French, for the
 * people who fix them: what is wrong, who it hinders, how to fix it.
 *
 * This is content, not code: edit it freely. Every rule Rampe runs must have
 * an entry; a test checks it. The interface, the PDF reports and the e-mails
 * all read this file.
 */
export interface Correction {
  /** Short name of the defect, as listed in the results. */
  readonly title: string;
  /** Who the defect hinders, and how. */
  readonly impact: string;
  /** What to change. */
  readonly fix: string;
}

export const CORRECTIONS_FR: Readonly<Record<string, Correction>> = {
  'area-alt': {
    title: "Zone d'image cliquable sans alternative",
    impact:
      "Un lecteur d'écran ne peut pas annoncer où mène une zone cliquable d'une image réactive : la personne aveugle ne sait pas sur quoi elle clique.",
    fix: 'Donnez à chaque élément `<area>` un attribut `alt` qui décrit la destination du lien, par exemple `alt="Agences de Toulouse"`.',
  },
  'aria-allowed-attr': {
    title: 'Attribut ARIA non prévu pour cet élément',
    impact:
      "Les technologies d'assistance peuvent annoncer un état ou une propriété qui ne correspond pas à la nature de l'élément, ce qui égare la personne qui les utilise.",
    fix: "Retirez l'attribut ARIA, ou placez-le sur un élément dont le rôle l'autorise. La spécification WAI-ARIA liste les attributs permis pour chaque rôle.",
  },
  'aria-braille-equivalent': {
    title: 'Équivalent braille sans texte correspondant',
    impact:
      'Un nom ou une description de rôle réservés au braille laissent sans information les personnes qui utilisent une synthèse vocale.',
    fix: 'Avant `aria-braillelabel` ou `aria-brailleroledescription`, donnez à l’élément un nom accessible ordinaire (son texte, `aria-label`) ou une description de rôle (`aria-roledescription`).',
  },
  'aria-command-name': {
    title: 'Commande ARIA sans nom',
    impact:
      "Un élément de rôle `button`, `link` ou `menuitem` sans nom est annoncé sans que l'on sache quelle action il déclenche.",
    fix: 'Donnez-lui un texte visible, ou un `aria-label` ou `aria-labelledby` qui décrit son action, par exemple `aria-label="Fermer la fenêtre"`.',
  },
  'aria-conditional-attr': {
    title: 'Attribut ARIA utilisé hors de ses conditions',
    impact:
      "Certains attributs ARIA ne valent que pour certains rôles ou certains états. Mal placés, ils annoncent un état faux aux technologies d'assistance.",
    fix: "Respectez les conditions de l'attribut. Par exemple, n'ajoutez pas `aria-checked` à une case à cocher native `<input type=\"checkbox\">`, qui annonce déjà son état, et n'utilisez les attributs de ligne que dans une grille ou un tableau arborescent.",
  },
  'aria-deprecated-role': {
    title: 'Rôle ARIA obsolète',
    impact:
      "Un rôle retiré de la spécification n'est plus reconnu de façon fiable : l'élément peut perdre son sens pour les technologies d'assistance.",
    fix: "Remplacez ce rôle par l'élément HTML natif équivalent, ou par le rôle ARIA actuel qui le remplace.",
  },
  'aria-hidden-body': {
    title: "Page entière masquée aux technologies d'assistance",
    impact:
      'Avec `aria-hidden="true"` sur l’élément `<body>`, un lecteur d’écran ne perçoit plus rien de la page.',
    fix: 'Retirez l’attribut `aria-hidden` de l’élément `<body>`. Pour masquer temporairement une partie de la page (derrière une fenêtre modale, par exemple), appliquez-le aux seuls éléments concernés.',
  },
  'aria-hidden-focus': {
    title: 'Élément masqué mais atteignable au clavier',
    impact:
      "La navigation au clavier s'arrête sur un élément qu'un lecteur d'écran ne peut pas annoncer : la personne ne sait pas où elle se trouve.",
    fix: 'Rendez inatteignables au clavier les éléments focalisables qu’il contient (`tabindex="-1"`, `disabled` ou attribut `inert` sur le conteneur), ou retirez `aria-hidden` s’ils doivent rester utilisables.',
  },
  'aria-input-field-name': {
    title: 'Champ de saisie ARIA sans nom',
    impact:
      'Un champ de rôle `combobox`, `listbox`, `searchbox`, `slider`, `spinbutton` ou `textbox` sans nom est annoncé sans dire ce qu’il faut y saisir.',
    fix: 'Reliez-le à son étiquette visible avec `aria-labelledby`, ou donnez-lui un `aria-label`. Mieux encore : utilisez un champ HTML natif avec un élément `<label>`.',
  },
  'aria-meter-name': {
    title: 'Jauge sans nom',
    impact:
      'Une jauge (`role="meter"`) sans nom est annoncée sans dire ce qu’elle mesure : la valeur seule n’a pas de sens.',
    fix: 'Donnez-lui un nom avec `aria-label` ou `aria-labelledby`, par exemple `aria-label="Espace de stockage utilisé"`.',
  },
  'aria-progressbar-name': {
    title: 'Barre de progression sans nom',
    impact: 'Une barre de progression sans nom est annoncée sans dire quelle opération avance.',
    fix: 'Donnez-lui un nom avec `aria-label` ou `aria-labelledby`, par exemple `aria-label="Envoi du fichier"`.',
  },
  'aria-prohibited-attr': {
    title: 'Nom accessible interdit sur cet élément',
    impact:
      'Un `aria-label` placé sur un élément qui ne peut pas porter de nom (un `<div>` ou un `<span>` sans rôle, par exemple) n’est pas annoncé de façon fiable : l’information se perd.',
    fix: 'Mettez le texte dans le contenu visible de l’élément, donnez à l’élément un rôle qui accepte un nom, ou retirez l’attribut.',
  },
  'aria-required-attr': {
    title: 'Attribut ARIA obligatoire manquant',
    impact:
      'Un composant ARIA privé de ses attributs obligatoires n’annonce pas son état : une case à cocher (`role="checkbox"`) sans `aria-checked` ne dit pas si elle est cochée.',
    fix: 'Ajoutez les attributs que le rôle exige, ou remplacez le composant par l’élément HTML natif équivalent, qui gère cet état tout seul.',
  },
  'aria-required-children': {
    title: 'Composant ARIA sans les éléments attendus',
    impact:
      'Une liste, un menu ou un groupe d’onglets construit en ARIA sans ses éléments du bon rôle est annoncé comme vide ou incohérent.',
    fix: 'Placez dans le conteneur des enfants du rôle attendu, par exemple `role="option"` dans `role="listbox"` ou `role="tab"` dans `role="tablist"`, ou retirez le rôle du conteneur.',
  },
  'aria-required-parent': {
    title: 'Élément ARIA hors de son conteneur',
    impact:
      'Un élément comme `role="option"`, `role="tab"` ou `role="menuitem"` n’a de sens que dans son conteneur ; isolé, il est mal annoncé.',
    fix: 'Placez-le dans un élément du rôle parent attendu (`listbox`, `tablist`, `menu`…), ou retirez son rôle.',
  },
  'aria-roledescription': {
    title: 'Description de rôle sur un élément sans rôle',
    impact:
      '`aria-roledescription` remplace l’annonce du rôle. Sur un élément sans rôle sémantique, elle n’est pas annoncée, ou l’est de façon incompréhensible.',
    fix: 'N’utilisez `aria-roledescription` que sur un élément qui a un rôle, natif ou explicite, et gardez une description courte et compréhensible.',
  },
  'aria-roles': {
    title: 'Rôle ARIA invalide',
    impact:
      'Un rôle mal orthographié ou inexistant est ignoré : l’élément perd le sens que vous vouliez lui donner.',
    fix: 'Corrigez la valeur de l’attribut `role` avec un rôle WAI-ARIA existant, ou utilisez l’élément HTML natif qui a ce sens.',
  },
  'aria-tab-name': {
    title: 'Onglet sans nom',
    impact: 'Un onglet (`role="tab"`) sans nom est annoncé sans dire quel contenu il affiche.',
    fix: 'Donnez à chaque onglet un texte visible, ou un `aria-label` ou `aria-labelledby`.',
  },
  'aria-toggle-field-name': {
    title: 'Interrupteur ou case à cocher ARIA sans nom',
    impact:
      'Un élément de rôle `checkbox`, `menuitemcheckbox`, `radio` ou `switch` sans nom annonce son état sans dire à quoi il s’applique.',
    fix: 'Reliez-le à son texte visible avec `aria-labelledby`, ou donnez-lui un `aria-label`. Un `<input type="checkbox">` natif avec un `<label>` évite le problème.',
  },
  'aria-tooltip-name': {
    title: 'Infobulle sans nom',
    impact:
      'Une infobulle (`role="tooltip"`) sans contenu ni nom n’apporte rien aux technologies d’assistance.',
    fix: 'Mettez le texte de l’infobulle dans l’élément lui-même, ou donnez-lui un `aria-label` ou `aria-labelledby`.',
  },
  'aria-valid-attr-value': {
    title: 'Valeur d’attribut ARIA invalide',
    impact:
      'Une valeur invalide (une référence vers un identifiant absent, `aria-expanded="oui"` au lieu de `"true"`…) est ignorée ou mal interprétée.',
    fix: 'Corrigez la valeur selon la spécification : `true` ou `false` pour les états, identifiants existants pour les références comme `aria-labelledby` ou `aria-controls`.',
  },
  'aria-valid-attr': {
    title: 'Attribut ARIA inexistant',
    impact:
      'Un attribut ARIA mal orthographié est ignoré : l’état ou la propriété voulus ne sont jamais annoncés.',
    fix: 'Corrigez le nom de l’attribut (par exemple `aria-labelledby` et non `aria-labeledby`), ou retirez-le.',
  },
  'audio-caption': {
    title: 'Fichier audio sans transcription',
    impact:
      'Les personnes sourdes ou malentendantes n’ont pas accès au contenu d’un enregistrement sonore.',
    fix: 'Proposez une transcription textuelle du son, à côté du lecteur ou par un lien juste après lui.',
  },
  'autocomplete-valid': {
    title: 'Valeur d’autocomplétion invalide',
    impact:
      'Le navigateur ne peut pas proposer les données de la personne (nom, adresse, e-mail…) : la saisie est plus longue et plus difficile, notamment avec un handicap moteur ou cognitif.',
    fix: 'Utilisez une valeur de la liste HTML, comme `autocomplete="email"`, `"given-name"`, `"postal-code"` ou `"tel"`, ou `"off"` pour désactiver l’autocomplétion.',
  },
  'avoid-inline-spacing': {
    title: 'Espacement du texte impossible à adapter',
    impact:
      'Un espacement imposé avec `!important` dans l’attribut `style` empêche les personnes dyslexiques ou malvoyantes d’agrandir l’espace entre les lettres, les mots ou les lignes.',
    fix: 'Retirez `!important` des propriétés `letter-spacing`, `word-spacing` et `line-height` écrites dans l’attribut `style`, ou déplacez-les dans une feuille de style.',
  },
  blink: {
    title: 'Texte clignotant',
    impact:
      'Un texte qui clignote est difficile à lire et gêne les personnes qui ont des troubles de l’attention ; il peut aussi être dangereux pour les personnes épileptiques.',
    fix: 'Retirez l’élément `<blink>`, qui est obsolète. Pour attirer l’attention, utilisez un style fixe : couleur, gras, encadré.',
  },
  'button-name': {
    title: 'Bouton sans intitulé',
    impact:
      'Un lecteur d’écran annonce seulement « bouton » : la personne ne sait pas ce qu’il fait. C’est fréquent avec les boutons qui ne contiennent qu’une icône.',
    fix: 'Mettez un texte dans le bouton. Pour un bouton à icône, ajoutez un texte masqué visuellement ou un `aria-label`, par exemple `<button aria-label="Rechercher">`.',
  },
  bypass: {
    title: 'Aucun moyen d’aller directement au contenu',
    impact:
      'Au clavier, il faut traverser tout le menu sur chaque page avant d’atteindre le contenu, ce qui épuise les personnes qui naviguent ainsi.',
    fix: 'Ajoutez en tout début de page un lien d’évitement « Aller au contenu » vers le contenu principal, et balisez celui-ci avec l’élément `<main>`.',
  },
  'color-contrast': {
    title: 'Contraste de couleur insuffisant',
    impact:
      'Un texte trop pâle sur son fond est difficile ou impossible à lire pour les personnes malvoyantes, les personnes âgées, ou en plein soleil sur un téléphone.',
    fix: 'Foncez le texte ou éclaircissez le fond jusqu’à un rapport de contraste d’au moins 4,5:1, ou 3:1 pour un texte de grande taille (24 px, ou 18,5 px en gras). Un outil comme le Colour Contrast Analyser donne le rapport.',
  },
  'definition-list': {
    title: 'Liste de définitions mal construite',
    impact:
      'Un lecteur d’écran annonce mal les termes et leurs définitions quand la liste `<dl>` contient autre chose que des paires `<dt>` et `<dd>`.',
    fix: 'Ne placez dans `<dl>` que des groupes `<dt>` puis `<dd>`, éventuellement enveloppés chacun dans un `<div>`.',
  },
  dlitem: {
    title: 'Terme ou définition hors d’une liste de définitions',
    impact:
      'Un élément `<dt>` ou `<dd>` isolé perd son sens : rien ne relie le terme à sa définition.',
    fix: 'Placez les éléments `<dt>` et `<dd>` dans un élément `<dl>`.',
  },
  'document-title': {
    title: 'Page sans titre',
    impact:
      'Le titre est la première information qu’annonce un lecteur d’écran et celle qui identifie l’onglet du navigateur : sans lui, impossible de savoir sur quelle page on se trouve.',
    fix: 'Ajoutez dans `<head>` un élément `<title>` qui décrit la page, par exemple `<title>Contact — Boulangerie Martin</title>`.',
  },
  'duplicate-id-aria': {
    title: 'Identifiant utilisé deux fois par une étiquette ou un attribut ARIA',
    impact:
      'Quand une étiquette ou un attribut ARIA pointe vers un identifiant présent plusieurs fois, les technologies d’assistance prennent le premier élément trouvé, qui n’est pas forcément le bon.',
    fix: 'Rendez unique chaque identifiant `id` référencé par un attribut `for`, `aria-labelledby`, `aria-describedby` ou `aria-controls`.',
  },
  'form-field-multiple-labels': {
    title: 'Champ avec plusieurs étiquettes',
    impact:
      'Les technologies d’assistance n’annoncent pas toutes les étiquettes d’un champ qui en a plusieurs : une partie de l’information se perd.',
    fix: 'Gardez un seul élément `<label>` par champ. Pour une consigne complémentaire, reliez-la avec `aria-describedby`.',
  },
  'frame-focusable-content': {
    title: 'Cadre retiré de la navigation au clavier',
    impact:
      'Un cadre qui contient des éléments interactifs mais porte `tabindex="-1"` est inutilisable au clavier.',
    fix: 'Retirez `tabindex="-1"` de l’élément `<iframe>`.',
  },
  'frame-title-unique': {
    title: 'Cadres portant le même titre',
    impact:
      'Plusieurs cadres au même titre ne peuvent pas être distingués dans la liste des cadres d’un lecteur d’écran.',
    fix: 'Donnez à chaque `<iframe>` un attribut `title` qui décrit son propre contenu, par exemple « Carte de l’agence » et « Vidéo de présentation ».',
  },
  'frame-title': {
    title: 'Cadre sans titre',
    impact:
      'Un lecteur d’écran annonce un cadre sans pouvoir dire ce qu’il contient : vidéo, carte, formulaire de paiement…',
    fix: 'Ajoutez à l’élément `<iframe>` un attribut `title` qui décrit son contenu, par exemple `title="Plan d’accès au magasin"`.',
  },
  'html-has-lang': {
    title: 'Langue de la page non indiquée',
    impact:
      'Sans langue déclarée, la synthèse vocale lit le texte avec la prononciation de sa langue par défaut : un texte français lu « à l’anglaise » devient incompréhensible.',
    fix: 'Ajoutez l’attribut `lang` à l’élément racine : `<html lang="fr">`.',
  },
  'html-lang-valid': {
    title: 'Code de langue de la page invalide',
    impact:
      'Un code de langue erroné empêche la synthèse vocale de choisir la bonne prononciation.',
    fix: 'Utilisez un code de langue valide sur l’élément `<html>`, comme `fr`, `fr-FR`, `en` ou `oc` pour l’occitan.',
  },
  'html-xml-lang-mismatch': {
    title: 'Langues contradictoires sur l’élément html',
    impact:
      'Quand `lang` et `xml:lang` indiquent deux langues différentes, les technologies d’assistance peuvent choisir la mauvaise.',
    fix: 'Donnez la même langue aux attributs `lang` et `xml:lang`, ou retirez `xml:lang`, inutile en HTML.',
  },
  'image-alt': {
    title: 'Image sans alternative textuelle',
    impact:
      'Une personne aveugle ne sait pas ce que montre l’image. Si l’image est un lien ou un bouton, elle ne sait pas non plus où il mène.',
    fix: 'Ajoutez un attribut `alt` qui transmet l’information de l’image, par exemple `alt="Plan d’accès depuis la gare"`. Si l’image est purement décorative, mettez `alt=""` pour qu’elle soit ignorée.',
  },
  'input-button-name': {
    title: 'Bouton de formulaire sans intitulé',
    impact:
      'Un `<input type="button">`, `"submit"` ou `"reset"` sans valeur est annoncé sans que l’on sache ce qu’il fait.',
    fix: 'Donnez-lui un attribut `value` explicite, comme `value="Envoyer la demande"`, ou un `aria-label`.',
  },
  'input-image-alt': {
    title: 'Bouton image sans alternative',
    impact:
      'Un bouton fait d’une image (`<input type="image">`) sans alternative n’indique pas son action à un lecteur d’écran.',
    fix: 'Ajoutez un attribut `alt` qui décrit l’action, par exemple `alt="Valider la commande"`.',
  },
  label: {
    title: 'Champ de formulaire sans étiquette',
    impact:
      'Un lecteur d’écran annonce « zone de saisie » sans dire ce qu’il faut y écrire. Sans étiquette cliquable, la cible est aussi plus difficile à atteindre pour les personnes qui ont un handicap moteur.',
    fix: 'Associez une étiquette visible à chaque champ : `<label for="email">Adresse e-mail</label>` et `<input id="email" type="email">`. Un texte d’exemple dans `placeholder` ne remplace pas l’étiquette.',
  },
  'link-in-text-block': {
    title: 'Lien distingué du texte par la couleur seule',
    impact:
      'Les personnes qui ne perçoivent pas bien les couleurs ne voient pas qu’un mot du paragraphe est un lien.',
    fix: 'Soulignez les liens dans le texte, ou distinguez-les autrement que par la couleur (gras, icône), ou donnez-leur un contraste d’au moins 3:1 avec le texte qui les entoure et un soulignement au survol et au focus.',
  },
  'link-name': {
    title: 'Lien sans intitulé',
    impact:
      'Un lecteur d’écran annonce seulement « lien » : la personne ne sait pas où il mène. C’est fréquent avec les liens qui ne contiennent qu’une icône ou une image sans alternative.',
    fix: 'Mettez un texte dans le lien. Pour un lien à icône ou à image, donnez à l’image une alternative qui décrit la destination, ou ajoutez au lien un `aria-label`.',
  },
  list: {
    title: 'Liste mal construite',
    impact:
      'Un lecteur d’écran annonce le nombre d’éléments d’une liste et permet de la parcourir ; une liste `<ul>` ou `<ol>` qui contient autre chose que des `<li>` est mal annoncée.',
    fix: 'Ne placez directement dans `<ul>` et `<ol>` que des éléments `<li>`. Mettez le reste à l’intérieur des `<li>`.',
  },
  listitem: {
    title: 'Élément de liste hors d’une liste',
    impact: 'Un élément `<li>` isolé n’est pas annoncé comme faisant partie d’une liste.',
    fix: 'Placez les éléments `<li>` dans un élément `<ul>` ou `<ol>`.',
  },
  marquee: {
    title: 'Texte défilant',
    impact:
      'Un texte qui défile seul est difficile, voire impossible, à lire pour les personnes malvoyantes, dyslexiques ou qui ont des troubles de l’attention.',
    fix: 'Retirez l’élément `<marquee>`, qui est obsolète, et affichez le texte de façon fixe. Si un défilement est indispensable, proposez un bouton pour l’arrêter.',
  },
  'meta-refresh': {
    title: 'Rechargement ou redirection automatique',
    impact:
      'Une page qui se recharge ou change d’adresse d’elle-même interrompt la lecture, et ramène un lecteur d’écran au début de la page.',
    fix: 'Retirez la balise `<meta http-equiv="refresh">`. Pour une redirection, utilisez une redirection côté serveur (code HTTP 301 ou 302).',
  },
  'meta-viewport': {
    title: 'Zoom bloqué sur mobile',
    impact:
      'Les personnes malvoyantes ne peuvent pas agrandir la page sur un téléphone ou une tablette.',
    fix: 'Dans la balise `<meta name="viewport">`, retirez `user-scalable=no` et toute valeur de `maximum-scale` inférieure à 2. `content="width=device-width, initial-scale=1"` suffit.',
  },
  'nested-interactive': {
    title: 'Élément interactif dans un autre',
    impact:
      'Un bouton dans un lien, ou un lien dans un bouton, est annoncé de façon confuse, et l’élément intérieur peut être inatteignable au clavier.',
    fix: 'Séparez les deux éléments : placez-les côte à côte plutôt que l’un dans l’autre.',
  },
  'no-autoplay-audio': {
    title: 'Son lancé automatiquement',
    impact:
      'Un son qui démarre seul couvre la synthèse vocale du lecteur d’écran : la personne n’entend plus la page qu’elle essaie de parcourir.',
    fix: 'Retirez l’attribut `autoplay`, ou coupez le son par défaut (`muted`), ou limitez la lecture automatique à 3 secondes au plus. Proposez toujours un bouton pour arrêter le son.',
  },
  'object-alt': {
    title: 'Objet intégré sans alternative',
    impact:
      'Le contenu d’un élément `<object>` sans alternative est inaccessible à un lecteur d’écran.',
    fix: 'Donnez à l’élément `<object>` une alternative : un texte à l’intérieur de l’élément, un attribut `aria-label` ou `title`.',
  },
  'role-img-alt': {
    title: 'Image ARIA sans alternative',
    impact:
      'Un élément déclaré comme image (`role="img"`) sans nom n’est annoncé que comme « image », sans son contenu.',
    fix: 'Donnez-lui une alternative avec `aria-label` ou `aria-labelledby`. Si l’image est décorative, retirez le rôle et masquez-la avec `aria-hidden="true"`.',
  },
  'scrollable-region-focusable': {
    title: 'Zone défilante inaccessible au clavier',
    impact:
      'Le contenu d’une zone qui défile ne peut pas être lu par les personnes qui naviguent au clavier : elles ne peuvent pas le faire défiler.',
    fix: 'Rendez la zone focalisable avec `tabindex="0"` et donnez-lui un nom (`aria-label`), ou faites en sorte qu’elle contienne un élément focalisable.',
  },
  'select-name': {
    title: 'Liste déroulante sans étiquette',
    impact: 'Un lecteur d’écran annonce une liste de choix sans dire à quoi elle sert.',
    fix: 'Associez une étiquette à l’élément `<select>` : `<label for="pays">Pays</label>` et `<select id="pays">`.',
  },
  'server-side-image-map': {
    title: 'Image réactive côté serveur',
    impact:
      'Les zones d’une image réactive côté serveur (attribut `ismap`) ne sont atteignables qu’à la souris, et leurs destinations ne sont pas annoncées.',
    fix: 'Remplacez-la par une image réactive côté client (`<map>` et `<area>` avec des alternatives), ou par une liste de liens.',
  },
  'summary-name': {
    title: 'Résumé de section dépliable sans texte',
    impact:
      'Un élément `<summary>` vide est annoncé sans dire ce que la section contient : la personne ne sait pas si elle doit la déplier.',
    fix: 'Mettez dans l’élément `<summary>` un texte qui annonce le contenu de la section, par exemple « Conditions de livraison ».',
  },
  'svg-img-alt': {
    title: 'Image SVG sans alternative',
    impact:
      'Une image SVG déclarée comme image (`role="img"`) sans nom n’est annoncée que comme « image ».',
    fix: 'Ajoutez un élément `<title>` en premier enfant du `<svg>`, ou un attribut `aria-label`. Si l’image est décorative, retirez `role="img"` et ajoutez `aria-hidden="true"`.',
  },
  'td-headers-attr': {
    title: 'Cellule de tableau reliée à un en-tête absent',
    impact:
      'L’attribut `headers` d’une cellule pointe vers un en-tête qui n’existe pas dans le tableau : un lecteur d’écran ne peut pas annoncer à quoi correspond la donnée.',
    fix: 'Faites pointer l’attribut `headers` vers les `id` d’éléments `<th>` du même tableau.',
  },
  'th-has-data-cells': {
    title: 'En-tête de tableau sans données',
    impact:
      'Un en-tête qui ne se rattache à aucune cellule laisse penser que le tableau est mal construit, et les données sont mal annoncées.',
    fix: 'Vérifiez la structure du tableau : chaque `<th>` doit porter sur une ligne ou une colonne de cellules `<td>`. Retirez les en-têtes vides ou inutiles.',
  },
  'valid-lang': {
    title: 'Code de langue invalide sur un passage',
    impact:
      'Un passage en langue étrangère avec un code invalide est lu avec une mauvaise prononciation.',
    fix: 'Utilisez un code de langue valide dans l’attribut `lang` du passage, par exemple `<span lang="en">` ou `<span lang="es">`.',
  },
  'video-caption': {
    title: 'Vidéo sans sous-titres',
    impact:
      'Les personnes sourdes ou malentendantes n’ont pas accès aux paroles et aux sons de la vidéo.',
    fix: 'Ajoutez des sous-titres synchronisés avec un élément `<track kind="captions" srclang="fr">` dans l’élément `<video>`.',
  },
};
