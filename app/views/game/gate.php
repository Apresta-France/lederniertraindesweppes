<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Accès réservé — <?= e(app_name()) ?></title>
<link rel="icon" href="/assets/img/logo-tercium.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Marcellus&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
<main class="wrap" style="max-width:520px;padding-top:12vh;padding-bottom:80px">
  <a class="brand" href="/"><b><?= e(app_name()) ?></b><small>Prototype</small></a>
  <h1 class="h2" style="margin-top:28px">Accès réservé</h1>
  <p class="small" style="margin-top:12px">Le prototype est ouvert aux personnes invitées. Ouvrez le lien reçu par e-mail ou saisissez votre clé d'accès.</p>
  <?php if (!empty($error)): ?><p class="err" style="margin-top:16px"><?= e($error) ?></p><?php endif; ?>
  <form method="post" action="/jouer/" class="stack" style="margin-top:20px">
    <?= csrf_field() ?>
    <input type="hidden" name="redirect" value="/jouer/">
    <label class="field">Clé d'accès<input name="cle" placeholder="LDTW-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" required></label>
    <button class="btn" type="submit">Monter à bord</button>
  </form>
  <p class="small" style="margin-top:28px">Pas encore d'invitation ? <a class="link" href="/#waitlist">Rejoindre la liste d'attente</a></p>
  <p class="small"><a class="link" href="/jouer/?admin=1">Accès administrateur</a></p>
</main>
</body>
</html>
