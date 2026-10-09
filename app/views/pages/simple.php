<section class="wrap sec" style="max-width:760px">
  <div class="stack" style="align-items:flex-start">
    <div class="eyebrow"><?= e($eyebrow) ?></div>
    <h1 class="h1" style="font-size:clamp(32px,4.6vw,56px)"><?= e($heading) ?></h1>
    <p class="body"><?= e($text) ?></p>
    <?php if (!empty($actionHref)): ?>
      <a class="btn" href="<?= e($actionHref) ?>"><?= e($actionLabel) ?></a>
    <?php endif; ?>
  </div>
</section>
