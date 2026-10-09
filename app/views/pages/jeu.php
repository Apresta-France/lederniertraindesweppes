<section class="banner"><img src="<?= e(asset('assets/img/gare-nuit.png')) ?>" alt=""><div class="shade-v"></div><div class="wrap banner-c"><div class="eyebrow rise d1">Le jeu</div><h1 class="h1 rise d2" style="max-width:820px">Une nuit d'orage, une gare qui tombe, une horloge qui repart.</h1></div></section>
<section class="wrap sec"><div class="split">
  <div class="stack"><div class="eyebrow">L'histoire</div><h2 class="h2">Fournes-en-Weppes, nuit du 1<sup style="font-size:.55em">er</sup> au 2 novembre 2026</h2>
  <p class="body">Sous un orage d'une violence rare, la vieille gare de Fournes s'effondre. Le lendemain, à la résidence des Weppes, l'horloge de la chambre de Gisèle s'est remise en marche toute seule, puis s'est arrêtée.</p>
  <p class="body">Dans les Weppes, les anciens disaient « au weppe » pour dire « au soir ». C'est l'heure où l'on rentre les bêtes, où l'on ferme les volets. L'heure où, parfois, ce qui est parti revient.</p>
  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px"><span class="chip">Acte 1 · L'aller</span><span class="chip">Chapitre 1 · La panne</span></div></div>
  <div class="frame" style="aspect-ratio:16/10"><img src="<?= e(asset('assets/img/horloge.png')) ?>" alt="L'horloge de la gare"></div>
</div></section>
<section class="band"><div class="wrap sec stack" style="gap:36px"><div class="stack-s"><div class="eyebrow">Les lieux</div><h2 class="h2">Un territoire bien réel</h2></div><div class="grid">
<?php foreach (site_content()['places'] as $place): ?>
  <div class="card"><img src="<?= e(asset($place['src'])) ?>" alt="" loading="lazy"><div class="card-b"><h3 class="h3"><?= e($place['title']) ?></h3><p class="small"><?= e($place['text']) ?></p></div></div>
<?php endforeach; ?>
</div></div></section>
<section class="wrap sec stack" style="gap:36px"><div class="stack-s"><div class="eyebrow">Les personnages</div><h2 class="h2">Ceux qui restent, ceux qui reviennent</h2></div>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))">
  <div class="person"><div><img src="<?= e(asset('assets/img/gisele.png')) ?>" alt="Gisèle dans son fauteuil" style="width:92%;display:block"></div><div class="stack-s" style="gap:8px"><h3 class="h3" style="font-size:22px">Gisèle</h3><p class="small">Résidente de la résidence des Weppes. Elle a toujours vécu ici, et se souvient de la gare quand les trains s'y arrêtaient encore.</p></div></div>
  <div class="person"><div style="align-items:center"><img src="<?= e(asset('assets/img/rose.png')) ?>" alt="La photo de Rose" style="height:88%;display:block"></div><div class="stack-s" style="gap:8px"><h3 class="h3" style="font-size:22px">Rose</h3><p class="small">Une jeune femme sur une vieille photo, devant un moulin. Un prénom au dos, d'une écriture fine. Personne ne sait plus qui elle était.</p></div></div>
</div></section>
<section class="band"><div class="wrap sec stack" style="gap:36px"><div class="stack-s"><div class="eyebrow">Comment on joue</div><h2 class="h2">Un point &amp; click, à la souris ou au doigt</h2></div><div class="pillars"><div><div class="num">I</div><h3 class="h3">Observer</h3><p class="small">Survolez le décor : les objets s'éclairent et révèlent leur nom.</p></div><div><div class="num">II</div><h3 class="h3">Examiner</h3><p class="small">Cliquez pour lire, allumer, ouvrir. Certains objets changent d'état.</p></div><div><div class="num">III</div><h3 class="h3">Comprendre</h3><p class="small">Reliez les indices pour reconstituer ce que la nuit de l'orage a réveillé.</p></div><div><div class="num">IV</div><h3 class="h3">Reprendre</h3><p class="small">Sauvegarde sur le navigateur, ou compte pour continuer sur un autre appareil.</p></div></div></div></section>
<section class="wrap sec stack" id="editeur" style="gap:36px">
  <div class="split" style="align-items:start">
    <div class="stack"><div class="eyebrow">Dans les coulisses</div><h2 class="h2">Un éditeur maison pour construire le jeu</h2>
    <p class="body">Pour créer les scènes et les cinématiques, nous avons développé notre propre éditeur. Il fonctionne lui aussi dans le navigateur et produit directement les fichiers que lit le jeu : ce que l'on règle dans l'éditeur est ce que le joueur verra.</p>
    <p class="body">Plus besoin de retoucher le code à chaque idée : on place un objet, on ajuste une lumière, on recadre un plan, puis on clique sur « Tester » pour jouer la scène aussitôt.</p></div>
    <div class="pillars" style="grid-template-columns:1fr">
      <div><h3 class="h3">Les scènes d'exploration</h3><p class="small">Placer les objets cliquables et les personnages sur le décor, dessiner les lumières et les ombres, et décider de ce qui s'affiche selon l'état de la pièce : une télévision allumée, une lampe éteinte.</p></div>
      <div><h3 class="h3">Les cinématiques</h3><p class="small">Monter les plans sur une ligne de temps, avec mouvements de caméra, fondus enchaînés, cartons, musique et bruitages. Chaque plan peut recevoir une audiodescription, lue par les lecteurs d'écran.</p></div>
      <div><h3 class="h3">Le travail à plusieurs</h3><p class="small">Chaque membre de l'équipe travaille sur sa scène sans écraser celle des autres, et l'éditeur vérifie chaque scène avant qu'elle n'arrive dans le jeu.</p></div>
    </div>
  </div>
  <div class="gallery">
    <button type="button"><img src="<?= e(asset('assets/img/editeur-cinematique.jpg')) ?>" alt="L'éditeur de cinématiques et sa ligne de temps" loading="lazy"><span>L'éditeur de cinématiques et sa ligne de temps</span></button>
    <button type="button"><img src="<?= e(asset('assets/img/editeur-scene.jpg')) ?>" alt="La chambre de Gisèle dans l'éditeur de scènes" loading="lazy"><span>La chambre de Gisèle dans l'éditeur de scènes</span></button>
    <button type="button"><img src="<?= e(asset('assets/img/editeur-lumieres.jpg')) ?>" alt="Le réglage des lumières et des ombres" loading="lazy"><span>Le réglage des lumières et des ombres</span></button>
  </div>
</section>
<div class="lb" role="dialog" aria-label="Image agrandie"><img alt=""><div class="lb-bar"><button class="prev" type="button" aria-label="Précédente">←</button><span class="cap"></span><button class="next" type="button" aria-label="Suivante">→</button></div></div>
