<?php
$related = [];
foreach (site_content()['articles'] as $other) {
    if ($other['slug'] !== $article['slug']) {
        $related[] = $other;
    }
}
?>
<article class="article">
  <a class="link" href="/actualites" style="color:var(--muted);align-self:flex-start">← Toutes les actualités</a>
  <div class="meta"><?= e($article['date_label']) ?> · <?= e($article['category']) ?></div>
  <h1><?= e($article['title']) ?></h1>
  <img class="wide" src="<?= e(asset($article['image'])) ?>" alt="<?= e($article['image_alt']) ?>">
  <?= $article['body'] ?>
  <div style="display:flex;align-items:center;gap:12px;margin-top:24px"><div style="flex:1;height:1px;background:rgba(217,183,122,.35)"></div><div style="width:7px;height:7px;transform:rotate(45deg);border:1px solid var(--gold)"></div><div style="flex:1;height:1px;background:rgba(217,183,122,.35)"></div></div>
  <div class="stack-s" style="gap:14px"><div class="eyebrow">À lire aussi</div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px">
    <?php foreach ($related as $other): ?>
      <a class="more" href="/actualites/<?= e($other['slug']) ?>"><img src="<?= e(asset($other['image'])) ?>" alt="" loading="lazy"><span style="font-family:'Cinzel',serif;font-weight:600;font-size:15px;line-height:1.35"><?= e($other['title']) ?></span></a>
    <?php endforeach; ?>
  </div></div>
</article>
