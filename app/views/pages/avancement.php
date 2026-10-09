<?php
$site = site_content();
$statusLabel = ['done' => 'Terminé', 'now' => 'En cours', 'next' => 'À venir'];
?>
<section class="banner"><img src="<?= e(asset('assets/img/quai.png')) ?>" alt=""><div class="shade-v"></div><div class="wrap banner-c"><div class="eyebrow rise d1">Avancement</div><h1 class="h1 rise d2" style="max-width:820px">Le voyage est en cours</h1><p class="lead rise d3">Le jeu se construit étape par étape. Voici où nous en sommes.</p></div></section>
<section class="wrap" style="padding-top:clamp(48px,6vw,80px)"><div class="version"><div class="stack-s" style="gap:6px"><div class="meta" style="letter-spacing:.24em">Version actuelle</div><div style="font-family:'Cinzel',serif;font-weight:600;font-size:clamp(20px,2.2vw,28px)"><?= e($site['version']) ?></div></div><a class="btn" href="#waitlist" style="font-size:13px;padding:13px 22px">Accès anticipé</a></div></section>
<section class="wrap" style="padding-top:clamp(48px,6vw,80px);padding-bottom:clamp(72px,10vw,120px)"><div class="tl">
<?php foreach ($site['steps'] as $step): ?>
  <?php if ($step['status'] === 'next'): ?>
    <div class="tl-i"><div class="dot"></div><div class="tl-c next"><div class="st">À venir</div><h2 class="h3" style="font-size:22px;color:var(--text)"><?= e($step['title']) ?></h2><p class="small" style="color:var(--dim)"><?= e($step['detail']) ?></p></div></div>
  <?php else: ?>
    <div class="tl-i"><div class="dot <?= e($step['status']) ?>"></div><div class="tl-c <?= e($step['status']) ?>"><div class="stack-s" style="gap:10px"><div class="st <?= e($step['status']) ?>" style="padding:0"><?= e($statusLabel[$step['status']]) ?></div><h2 class="h3" style="font-size:22px"><?= e($step['title']) ?></h2><ul>
      <?php foreach ($step['points'] as $point): ?><li><?= e($point) ?></li><?php endforeach; ?>
    </ul></div><img src="<?= e(asset($step['image'])) ?>" alt="" loading="lazy"></div></div>
  <?php endif; ?>
<?php endforeach; ?>
</div></section>
