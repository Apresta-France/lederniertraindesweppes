<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Connexion — Administration</title>
<link rel="icon" href="/assets/img/logo-tercium.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Marcellus&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body>
<main class="wrap" style="max-width:480px;padding-top:12vh;padding-bottom:80px">
  <a class="brand" href="/"><b><?= e(app_name()) ?></b><small>Administration</small></a>
  <h1 class="h2" style="margin-top:28px">Connexion</h1>
  <?php if (!empty($error)): ?><p class="err" style="margin-top:16px"><?= e($error) ?></p><?php endif; ?>
  <form method="post" action="/admin/connexion" class="panel stack" style="margin-top:20px">
    <?= csrf_field() ?>
    <input type="hidden" name="redirect" value="/admin/connexion">
    <label class="field">E-mail<input type="email" name="email" value="<?= e($email) ?>" autocomplete="username" required></label>
    <label class="field">Mot de passe<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn" type="submit">Entrer</button>
  </form>
</main>
</body>
</html>
