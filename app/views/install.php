<?php
$val = static function (string $key) use ($input): string {
    return e((string) ($input[$key] ?? ''));
};
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Installation — Le Dernier Train des Weppes</title>
<link rel="icon" href="/assets/img/logo-tercium.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Marcellus&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body>
<main class="wrap" style="max-width:820px;padding-top:clamp(40px,7vw,80px);padding-bottom:80px">
  <a class="brand" href="/installation"><b>Le Dernier Train des Weppes</b><small>Installation</small></a>
  <div class="stack" style="margin-top:36px">
    <div class="eyebrow">Premier lancement</div>
    <h1 class="h1" style="font-size:clamp(32px,5vw,56px)">Mettre le site sur les rails</h1>
    <p class="body">Le fichier d'environnement n'est pas encore en place. Indiquez le compte d'administration et la voie d'envoi des messages. En local, l'adresse est lederniertraindesweppes.test. En production, lederniertraindesweppes.fr.</p>
  </div>
  <?php if (!$storageOk): ?>
    <p class="err" style="margin-top:24px">Le dossier storage n'est pas accessible en écriture. L'installation ne peut pas créer la base ni le fichier d'environnement.</p>
  <?php endif; ?>
  <?php if ($errors): ?>
    <div class="err" style="margin-top:24px"><?php foreach ($errors as $error): ?><div><?= e($error) ?></div><?php endforeach; ?></div>
  <?php endif; ?>
  <?php if ($existingEmail): ?>
    <p class="small" style="margin-top:24px">Un compte existe déjà (<?= e($existingEmail) ?>). Confirmez son mot de passe pour régénérer la configuration, sans effacer les inscriptions.</p>
  <?php endif; ?>
  <form method="post" action="/installation" class="stack" style="margin-top:28px;gap:22px" novalidate>
    <?= csrf_field() ?>
    <section class="panel stack">
      <h2 class="h3">Le site</h2>
      <label class="field">Nom<input name="app_name" value="<?= $val('app_name') ?>" maxlength="80" required></label>
      <label class="field">Adresse<input name="app_url" value="<?= $val('app_url') ?>" placeholder="https://lederniertraindesweppes.fr" required></label>
      <label class="field">Environnement
        <select name="app_env">
          <option value="local"<?= ($input['app_env'] ?? '') === 'local' ? ' selected' : '' ?>>Local</option>
          <option value="production"<?= ($input['app_env'] ?? '') === 'production' ? ' selected' : '' ?>>Production</option>
        </select>
      </label>
    </section>
    <section class="panel stack">
      <h2 class="h3">Compte administrateur</h2>
      <label class="field">E-mail<input type="email" name="admin_email" value="<?= $val('admin_email') ?>" autocomplete="username" maxlength="180" required></label>
      <label class="field"><?= $existingEmail ? 'Mot de passe du compte existant' : 'Mot de passe' ?><input type="password" name="admin_password" autocomplete="<?= $existingEmail ? 'current-password' : 'new-password' ?>" required></label>
      <?php if (!$existingEmail): ?>
        <label class="field">Confirmation<input type="password" name="admin_password_confirm" autocomplete="new-password" required></label>
        <p class="small">Au moins 10 caractères.</p>
      <?php endif; ?>
    </section>
    <section class="panel stack">
      <h2 class="h3">Courriel</h2>
      <p class="small">Le serveur <strong>log</strong> n'envoie rien sur le réseau : chaque message est écrit dans storage/logs. En production, utilisez le SMTP de votre messagerie. L'adresse d'expédition doit être autorisée par ce serveur, sinon les filtres rejettent le message.</p>
      <label class="field">Serveur SMTP<input name="smtp_host" value="<?= $val('smtp_host') ?>" placeholder="log" required></label>
      <div class="split" style="align-items:end">
        <label class="field">Port<input name="smtp_port" inputmode="numeric" value="<?= $val('smtp_port') ?>" required></label>
        <label class="field">Chiffrement
          <select name="smtp_encryption">
            <?php foreach (['tls' => 'TLS (port 587)', 'ssl' => 'SSL (port 465)', 'none' => 'Aucun'] as $key => $label): ?>
              <option value="<?= e($key) ?>"<?= ($input['smtp_encryption'] ?? '') === $key ? ' selected' : '' ?>><?= e($label) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
      </div>
      <label class="field">Identifiant<input name="smtp_user" value="<?= $val('smtp_user') ?>" autocomplete="off"></label>
      <label class="field">Mot de passe<input type="password" name="smtp_pass" autocomplete="new-password"></label>
      <label class="field">Adresse d'expédition<input type="email" name="mail_from_address" value="<?= $val('mail_from_address') ?>" required></label>
      <label class="field">Nom d'expédition<input name="mail_from_name" value="<?= $val('mail_from_name') ?>" maxlength="80" required></label>
      <label class="field">Réception des messages<input type="email" name="mail_to" value="<?= $val('mail_to') ?>" placeholder="Même adresse que l'administrateur si vide"></label>
      <label class="small" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" name="send_test" value="1"<?= ($input['send_test'] ?? '') === '1' ? ' checked' : '' ?>> Envoyer un message d'essai à l'administrateur</label>
    </section>
    <section class="panel stack">
      <h2 class="h3">Mentions</h2>
      <p class="small">Ces champs alimentent les mentions légales et le pied des e-mails. Laissez vides ceux que vous ne connaissez pas : rien ne sera inventé.</p>
      <label class="field">Éditeur<input name="legal_name" value="<?= $val('legal_name') ?>" maxlength="120"></label>
      <label class="field">E-mail de contact<input type="email" name="legal_email" value="<?= $val('legal_email') ?>"></label>
      <label class="field">Adresse postale<input name="legal_address" value="<?= $val('legal_address') ?>" maxlength="240"></label>
      <label class="field">Hébergeur<input name="legal_host" value="<?= $val('legal_host') ?>" maxlength="180"></label>
    </section>
    <button class="btn" type="submit"<?= $storageOk ? '' : ' disabled' ?>>Installer le site</button>
  </form>
</main>
</body>
</html>
