<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= e($title) ?> — Administration</title>
<link rel="icon" href="/assets/img/logo-tercium.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Marcellus&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin">
<header class="admin-top">
  <a class="brand" href="/admin"><b><?= e(app_name()) ?></b><small>Administration</small></a>
  <nav class="admin-nav" aria-label="Administration">
    <?php
    $links = [
        'dashboard' => ['/admin', 'Tableau de bord'],
        'inscrits' => ['/admin/inscrits', 'Inscrits'],
        'messages' => ['/admin/messages', 'Messages'],
        'statistiques' => ['/admin/statistiques', 'Statistiques'],
        'environnement' => ['/admin/environnement', 'Environnement'],
    ];
    if (game_editor_enabled()) {
        $links['editeur'] = ['/jouer/editor/', 'Éditeur de scènes'];
    }
    foreach ($links as $key => [$href, $label]): ?>
      <a href="<?= e($href) ?>"<?= $section === $key ? ' aria-current="page"' : '' ?>><?= e($label) ?></a>
    <?php endforeach; ?>
  </nav>
  <form method="post" action="/admin/deconnexion">
    <?= csrf_field() ?>
    <input type="hidden" name="redirect" value="/admin/connexion">
    <button class="text-btn" type="submit">Sortir</button>
  </form>
</header>
<main class="admin-main">
  <?php $flashOk = flash('ok'); $flashErr = flash('err'); ?>
  <?php if ($flashOk): ?><p class="ok"><?= e($flashOk) ?></p><?php endif; ?>
  <?php if ($flashErr): ?><p class="err"><?= e($flashErr) ?></p><?php endif; ?>
  <h1 class="h2"><?= e($title) ?></h1>
  <?= $content ?>
</main>
<script src="/js/admin.js"></script>
</body>
</html>
