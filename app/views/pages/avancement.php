<?php
$crafts = [
    ['num' => 'I', 'title' => 'La recherche', 'text' => 'Retrouver les archives, suivre le tracé de la ligne et comprendre le quotidien de ceux qui la prenaient.'],
    ['num' => 'II', 'title' => 'Le scénario', 'text' => 'Écrire l\'histoire, les personnages et les dialogues. La nuit d\'orage est une fiction. Les lieux, non.'],
    ['num' => 'III', 'title' => 'La cohérence', 'text' => 'Vérifier que chaque lieu, chaque époque et chaque détail tiennent debout, et respectent l\'histoire locale.'],
    ['num' => 'IV', 'title' => 'La direction artistique', 'text' => 'Choisir le style. Garder, corriger ou écarter ce qui ne convient pas.'],
    ['num' => 'V', 'title' => 'La construction', 'text' => 'Assembler décors, scènes et sons pour en faire une partie que l\'on peut jouer.'],
];
$tools = [
    ['k' => 'Visuels', 'text' => 'Nos photographies et les archives historiques sont transformées dans un style graphique unique. Le point de départ est toujours une image réelle.'],
    ['k' => 'Musiques', 'text' => 'Elles sont générées, puis choisies et placées par nous, selon l\'ambiance de chaque scène.'],
    ['k' => 'Voix', 'text' => 'Elles sont générées à partir des textes que nous avons écrits. Le ton, les mots et le silence restent les nôtres.'],
];
$pairs = [
    [
        'before' => ['src' => 'assets/img/route-weppes.jpg', 'alt' => 'Photographie d\'une route bordée d\'arbres dans les Weppes'],
        'after' => ['src' => 'assets/img/aurelie-route.jpg', 'alt' => 'La même route au crépuscule, Aurélie au volant, dans le jeu'],
        'legend' => 'Même alignement d\'arbres, mêmes bandes cyclables. La photographie est prise de jour. Le rendu place Aurélie au volant, un soir de pluie.',
    ],
];
$sources = [
    ['k' => 'Commune', 'label' => 'Fournes-en-Weppes, petite histoire de la ligne Michon', 'href' => 'https://www.fournes-en-weppes.fr/v2/histoire/1279-petite-histoire-de-la-ligne-michon'],
    ['k' => 'Archives', 'label' => 'Archives départementales du Nord, pour consulter les documents d\'origine', 'href' => 'https://archivesdepartementales.lenord.fr/'],
    ['k' => 'Notice', 'label' => 'Ligne de Don-Sainghin à Fromelles, dite ligne Michon', 'href' => 'https://fr.wikipedia.org/wiki/Chemin_de_fer_de_Don-Sainghin_%C3%A0_Fromelles'],
];
?>
<section class="banner"><img src="<?= e(asset('assets/img/quai.png')) ?>" alt=""><div class="shade-v"></div><div class="wrap banner-c"><div class="eyebrow rise d1">Coulisses</div><h1 class="h1 rise d2" style="max-width:920px">Comment nous avons créé Le Dernier Train des Weppes</h1><p class="lead rise d3">Une ligne disparue, des photographies, des archives, et une petite équipe. Voici ce qui est fait à la main, et ce que nous confions à l'intelligence artificielle.</p></div></section>

<section class="wrap sec"><div class="split">
  <div class="stack">
    <div class="eyebrow">Le point de départ</div>
    <h2 class="h2">Une histoire vraie, un territoire réel</h2>
    <p class="body">Le Dernier Train des Weppes est né d'une envie : faire revivre la ligne Michon, le tortillard des Weppes. Ouverte en 1906, longue de dix-huit kilomètres, elle reliait Don-Sainghin à Fromelles en desservant Sainghin-en-Weppes, Fournes-en-Weppes, Herlies, Wicres, Marquillies, Illies et Aubers. Elle a fermé en 1951.</p>
    <p class="body">Les rails ont presque disparu. Les lieux sont toujours là. Les décors partent de photographies de ces lieux, quand ils existent encore, et d'archives de la ligne et des villages. Une gare, une rue, un paysage a une origine que nous pouvons retracer.</p>
  </div>
  <div class="frame" style="aspect-ratio:16/10"><img src="<?= e(asset('assets/img/plaine.png')) ?>" alt="La plaine des Weppes sous l'orage, dans le jeu"></div>
</div></section>

<section class="band"><div class="wrap sec" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:clamp(36px,6vw,80px);align-items:start">
  <div class="stack"><div class="eyebrow">À la main</div><h2 class="h2">Ce que nous faisons, nous</h2><p class="body">Le cœur du jeu est un travail de personnes. L'outil vient après.</p></div>
  <ol class="craft">
    <?php foreach ($crafts as $craft): ?>
      <li><span class="num"><?= e($craft['num']) ?></span><div class="stack-s" style="gap:6px"><h3 class="h3" style="font-size:20px"><?= e($craft['title']) ?></h3><p class="small"><?= e($craft['text']) ?></p></div></li>
    <?php endforeach; ?>
  </ol>
</div></section>

<section class="wrap sec stack" style="gap:36px">
  <div class="stack" style="max-width:720px"><div class="eyebrow">L'outil</div><h2 class="h2">Ce que fait l'intelligence artificielle</h2><p class="body">Nous l'assumons. L'intelligence artificielle est un outil, pas un auteur. Elle interprète ce que nous lui donnons.</p></div>
  <div class="tools">
    <?php foreach ($tools as $tool): ?>
      <article class="tool"><div class="k"><?= e($tool['k']) ?></div><p class="small" style="font-size:16px"><?= e($tool['text']) ?></p></article>
    <?php endforeach; ?>
  </div>
  <blockquote class="pull">Elle ne décide de rien. Nous gardons le dernier mot sur tout ce qui apparaît dans le jeu.</blockquote>
</section>

<section class="band"><div class="wrap sec stack" style="gap:36px">
  <div class="stack" style="max-width:760px"><div class="eyebrow">Les images</div><h2 class="h2">Avant, après</h2><p class="body">Chaque décor part d'un lieu réel. Ici, une route des Weppes photographiée, puis réinterprétée pour le jeu.</p></div>
  <div class="pairs">
    <?php foreach ($pairs as $pair): ?>
      <article class="pair compare">
        <figure>
          <button type="button"><img src="<?= e(asset($pair['before']['src'])) ?>" alt="<?= e($pair['before']['alt']) ?>" loading="lazy"></button>
          <figcaption class="meta">Photographie</figcaption>
        </figure>
        <figure>
          <button type="button"><img src="<?= e(asset($pair['after']['src'])) ?>" alt="<?= e($pair['after']['alt']) ?>" loading="lazy"></button>
          <figcaption class="meta">Dans le jeu</figcaption>
        </figure>
      </article>
      <p class="small pair-legend"><?= e($pair['legend']) ?></p>
    <?php endforeach; ?>
  </div>
</div></section>

<section class="wrap sec"><div class="split" style="align-items:start">
  <div class="stack">
    <div class="eyebrow">Le choix</div>
    <h2 class="h2">Pourquoi ce choix</h2>
    <p class="body">Nous sommes une petite équipe, sans budget de studio. Sans cet outil, le projet n'aurait pas pu exister sous cette forme : un jeu gratuit, jouable dans un navigateur, qui redonne une présence à des lieux dont on a enlevé les rails.</p>
    <p class="body">L'avancement du chantier, scène après scène, est raconté dans le <a href="/actualites">carnet de développement</a>.</p>
  </div>
  <div class="reasons">
    <div><div class="num">01</div><div class="stack-s" style="gap:6px"><h3 class="h3">Gratuit</h3><p class="small">Le jeu sera accessible sans achat, pour celles et ceux qui voudront y monter.</p></div></div>
    <div><div class="num">02</div><div class="stack-s" style="gap:6px"><h3 class="h3">Dans le navigateur</h3><p class="small">Rien à installer. Une page, et la partie commence.</p></div></div>
    <div><div class="num">03</div><div class="stack-s" style="gap:6px"><h3 class="h3">Pour tout le monde</h3><p class="small">Sur l'ordinateur comme sur le téléphone, à Fournes ou ailleurs.</p></div></div>
  </div>
</div></section>

<section class="wrap" style="padding-bottom:clamp(56px,8vw,110px)"><aside class="note">
  <div class="eyebrow">À garder en tête</div>
  <h2 class="h2">Une interprétation, pas un document historique</h2>
  <p class="body">Les images du jeu sont des interprétations artistiques. Elles s'inspirent des lieux et des archives. Elles ne remplacent pas les documents d'origine. Pour les voir, les Archives départementales du Nord et la page d'histoire de la commune de Fournes-en-Weppes sont de bons points de départ.</p>
</aside></section>

<section class="band"><div class="wrap sec recall">
  <div class="stack" style="max-width:680px"><div class="eyebrow">Mémoire locale</div><h2 class="h2">Participez à l'histoire</h2><p class="body">Vous avez des photos de famille, des cartes postales ou des souvenirs liés à la ligne Michon ou aux villages des Weppes ? Écrivez-nous. S'ils entrent dans le jeu, votre nom figurera dans les crédits.</p></div>
  <a class="btn" href="/contact?sujet=souvenir">Partager un souvenir</a>
</div></section>

<section class="wrap sec stack" style="gap:28px">
  <div class="stack-s"><div class="eyebrow">Repères</div><h2 class="h2">Sources et remerciements</h2><p class="small" style="font-size:17px;max-width:680px">Ces pages racontent la ligne. Elles ne sont pas les images du jeu. Les photographes et les familles qui nous confient un document seront nommés ici, et dans les crédits.</p></div>
  <div class="sources">
    <?php foreach ($sources as $source): ?>
      <a href="<?= e($source['href']) ?>" target="_blank" rel="noopener"><span class="meta"><?= e($source['k']) ?></span><span><?= e($source['label']) ?></span></a>
    <?php endforeach; ?>
  </div>
</section>
<div class="lb" role="dialog" aria-label="Image agrandie"><img alt=""><div class="lb-bar"><button class="prev" type="button" aria-label="Précédente">←</button><span class="cap"></span><button class="next" type="button" aria-label="Suivante">→</button></div></div>
