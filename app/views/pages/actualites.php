<?php $site = site_content(); ?>
<section class="wrap stack" style="padding-top:clamp(56px,8vw,100px);gap:16px"><div class="eyebrow rise d1">Actualités</div><h1 class="h1 rise d2" style="font-size:clamp(32px,5vw,60px)">Carnet de développement</h1><p class="small rise d3" style="font-size:clamp(16px,1.6vw,19px)">Les coulisses du jeu, au fil des étapes.</p>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px"><button class="pill on" type="button" data-filter="Tout">Tout</button><?php foreach ($site['categories'] as $category): ?><button class="pill" type="button" data-filter="<?= e($category) ?>"><?= e($category) ?></button><?php endforeach; ?></div></section>
<section class="wrap" style="padding-top:36px;padding-bottom:clamp(72px,10vw,120px)"><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))">
<?php foreach ($site['articles'] as $article): ?>
  <a class="card" href="/actualites/<?= e($article['slug']) ?>" data-cat="<?= e($article['category']) ?>"><img src="<?= e(asset($article['image'])) ?>" alt="" loading="lazy"><div class="card-b"><div class="meta"><?= e($article['date_label']) ?> · <?= e($article['category']) ?></div><h3 class="h3"><?= e($article['title']) ?></h3><p class="small"><?= e($article['excerpt']) ?></p><div class="link" style="margin-top:4px">Lire l'article →</div></div></a>
<?php endforeach; ?>
</div></section>
