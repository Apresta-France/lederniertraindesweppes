<section class="wrap sec" style="max-width:720px">
  <div class="stack" style="align-items:flex-start">
    <div class="eyebrow"><?= e($eyebrow) ?></div>
    <h1 class="h1" style="font-size:clamp(32px,4.6vw,56px)"><?= e($heading) ?></h1>
    <p class="body"><?= $textHtml ?></p>
    <?php if (!empty($error)): ?><div class="err"><?= e($error) ?></div><?php endif; ?>
    <?php if (!empty($showForm)): ?>
      <form method="post" action="<?= e($action) ?>" class="stack" style="align-items:flex-start">
        <?= csrf_field() ?>
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <input type="hidden" name="redirect" value="<?= e($action . '?token=' . $token) ?>">
        <button class="btn" type="submit"><?= e($button) ?></button>
      </form>
    <?php else: ?>
      <a class="btn" href="/">Retour à l'accueil</a>
    <?php endif; ?>
  </div>
</section>
