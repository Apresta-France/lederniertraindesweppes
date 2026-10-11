<?php $site = site_content(); ?>
<section class="banner"><img src="<?= e(asset('assets/img/gare-nuit.png')) ?>" alt=""><div class="shade-v"></div><div class="wrap banner-c"><div class="eyebrow rise d1">Galerie</div><h1 class="h1 rise d2" style="max-width:820px">Scènes, personnages, objets</h1><p class="lead rise d3">Les images du jeu, rangées par famille. Touchez-en une pour l'agrandir.</p></div></section>
<section class="wrap" style="padding-top:clamp(28px,4vw,40px)"><div style="display:flex;flex-wrap:wrap;gap:8px"><button class="pill on" type="button" data-filter="Tout">Tout</button><?php foreach ($site['art_categories'] as $category): ?><button class="pill" type="button" data-filter="<?= e($category) ?>"><?= e($category) ?></button><?php endforeach; ?></div></section>
<section class="wrap" style="padding-top:28px;padding-bottom:clamp(72px,10vw,120px)"><div class="gallery">
<?php foreach ($site['art'] as $piece): ?>
  <button type="button" data-cat="<?= e($piece['cat']) ?>"<?= !empty($piece['fit']) ? ' class="' . e($piece['fit']) . '"' : '' ?>><img src="<?= e(asset($piece['src'])) ?>" alt="<?= e($piece['alt']) ?>" loading="lazy"><span><?= e($piece['alt']) ?></span></button>
<?php endforeach; ?>
</div></section>
<div class="lb" role="dialog" aria-label="Image agrandie"><img alt=""><div class="lb-bar"><button class="prev" type="button" aria-label="Précédente">←</button><span class="cap"></span><button class="next" type="button" aria-label="Suivante">→</button></div></div>
