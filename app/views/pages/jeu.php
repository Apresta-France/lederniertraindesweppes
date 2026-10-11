<section class="banner"><img src="<?= e(asset('assets/img/gare-nuit.png')) ?>" alt=""><div class="shade-v"></div><div class="wrap banner-c"><div class="eyebrow rise d1">Le jeu</div><h1 class="h1 rise d2" style="max-width:820px">Une nuit d'orage, une gare qui tombe, une horloge qui repart.</h1></div></section>
<section class="wrap sec"><div class="split">
  <div class="stack"><div class="eyebrow">L'histoire</div><h2 class="h2">Fournes-en-Weppes, nuit du 1<sup style="font-size:.55em">er</sup> au 2 novembre 2026</h2>
  <p class="body">Sous un orage d'une violence rare, la vieille gare de Fournes s'effondre. Le lendemain, à la résidence des Weppes, l'horloge de la chambre de Gisèle s'est remise en marche toute seule, puis s'est arrêtée.</p>
  <p class="body">Dans les Weppes, les anciens disaient « au weppe » pour dire « au soir ». C'est l'heure où l'on rentre les bêtes, où l'on ferme les volets. L'heure où, parfois, ce qui est parti revient.</p>
  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px"><span class="chip">Acte 1 · L'aller</span><span class="chip">Chapitre 1 · La panne</span></div></div>
  <div class="frame" style="aspect-ratio:16/10"><img src="<?= e(asset('assets/img/horloge.png')) ?>" alt="L'horloge de la gare"></div>
</div></section>
<section class="band"><div class="wrap sec stack" style="gap:36px"><div class="stack" style="max-width:720px"><div class="eyebrow">Les lieux</div><h2 class="h2">Un territoire bien réel</h2><p class="body">Les Weppes, commune après commune. Le premier chapitre s'ouvre dans trois de ces lieux.</p></div>
<button type="button" class="zoom territory" aria-label="Agrandir la carte des Weppes"><img src="<?= e(asset('jouer/shared/maps/2026.jpg')) ?>" alt="Carte des Weppes, édition 2026"></button>
<div class="grid">
<?php foreach (site_content()['places'] as $place): ?>
  <div class="card"><img src="<?= e(asset($place['src'])) ?>" alt="" loading="lazy"><div class="card-b"><h3 class="h3"><?= e($place['title']) ?></h3><p class="small"><?= e($place['text']) ?></p></div></div>
<?php endforeach; ?>
</div></div></section>
<section class="wrap sec stack" style="gap:36px"><div class="stack-s"><div class="eyebrow">Les personnages</div><h2 class="h2">Ceux qui restent, ceux qui reviennent</h2></div>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))">
  <div class="person"><div><img src="<?= e(asset('assets/img/gisele.png')) ?>" alt="Gisèle dans son fauteuil" style="width:92%;display:block"></div><div class="stack-s" style="gap:8px"><h3 class="h3" style="font-size:22px">Gisèle</h3><p class="small">Résidente de la résidence des Weppes. Elle a toujours vécu ici, et se souvient de la gare quand les trains s'y arrêtaient encore.</p></div></div>
  <div class="person"><div style="align-items:center"><img src="<?= e(asset('assets/img/rose.png')) ?>" alt="La photo de Rose" style="height:88%;display:block"></div><div class="stack-s" style="gap:8px"><h3 class="h3" style="font-size:22px">Rose</h3><p class="small">Une jeune femme sur une vieille photo, devant un moulin. Un prénom au dos, d'une écriture fine. Personne ne sait plus qui elle était.</p></div></div>
</div></section>
<?php
$cursors = [
    ['id' => 'fleche', 'label' => 'Flèche', 'text' => 'Pointeur, quand rien n\'est proposé.'],
    ['id' => 'loupe', 'label' => 'Examiner', 'text' => 'Regarder de plus près.'],
    ['id' => 'montrer', 'label' => 'Montrer', 'text' => 'Désigner un objet.'],
    ['id' => 'parler', 'label' => 'Parler', 'text' => 'Engager la conversation.'],
    ['id' => 'marcher', 'label' => 'Marcher', 'text' => 'Aller vers cet endroit.'],
    ['id' => 'gauche', 'label' => 'À gauche', 'text' => 'Changer de vue.'],
    ['id' => 'droite', 'label' => 'À droite', 'text' => 'Changer de vue.'],
    ['id' => 'prendre', 'label' => 'Prendre', 'text' => 'Ramasser l\'objet.'],
    ['id' => 'interdit', 'label' => 'Interdit', 'text' => 'On ne peut pas, ici.'],
];
?>
<section class="band"><div class="wrap sec stack" style="gap:32px"><div class="stack" style="max-width:720px"><div class="eyebrow">Comment on joue</div><h2 class="h2">Un point &amp; click, à la souris ou au doigt</h2><p class="body">Le curseur dit l'action possible. Neuf gestes, les mêmes que dans le jeu.</p></div>
<ul class="cursors">
<?php foreach ($cursors as $cursor): ?>
  <li><img src="<?= e(asset('jouer/shared/cursors/' . $cursor['id'] . '.png')) ?>" alt="" width="64" height="64"><strong><?= e($cursor['label']) ?></strong><span><?= e($cursor['text']) ?></span></li>
<?php endforeach; ?>
</ul>
<p class="small">La partie reste dans le navigateur. Un compte permet de la reprendre sur un autre appareil.</p>
</div></section>
<div class="lb" role="dialog" aria-label="Image agrandie"><img alt=""><div class="lb-bar"><button class="prev" type="button" aria-label="Précédente">←</button><span class="cap"></span><button class="next" type="button" aria-label="Suivante">→</button></div></div>
