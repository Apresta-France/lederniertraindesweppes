<?php
$field = static function (string $postKey, string $envKey) use ($input, $config): string {
    if (is_array($input) && array_key_exists($postKey, $input)) {
        return (string) $input[$postKey];
    }
    return (string) ($config[$envKey] ?? '');
};
?>
<?php if ($errors): ?>
  <div class="err"><?php foreach ($errors as $error): ?><div><?= e($error) ?></div><?php endforeach; ?></div>
<?php endif; ?>
<form method="post" action="/admin/environnement" class="stack" style="gap:22px">
  <?= csrf_field() ?>
  <input type="hidden" name="redirect" value="/admin/environnement">
  <section class="panel stack">
    <h2 class="h3">Site</h2>
    <p class="small">Clé interne définie. Elle n'est pas affichée.</p>
    <label class="field">Nom<input name="app_name" value="<?= e($field('app_name', 'APP_NAME')) ?>" maxlength="80"></label>
    <label class="field">Adresse<input name="app_url" value="<?= e($field('app_url', 'APP_URL')) ?>"></label>
    <label class="field">Environnement
      <select name="app_env">
        <option value="local"<?= $field('app_env', 'APP_ENV') === 'local' ? ' selected' : '' ?>>Local</option>
        <option value="production"<?= $field('app_env', 'APP_ENV') === 'production' ? ' selected' : '' ?>>Production</option>
      </select>
    </label>
  </section>
  <section class="panel stack">
    <h2 class="h3">Jeu</h2>
    <p class="small">Le mode debug affiche dans le jeu un panneau (touche ²) pour passer directement d'une scène à l'autre. En automatique, il est actif seulement en environnement local.</p>
    <?php if (!empty($gameDebugLocked)): ?>
      <p class="small">Attention : GAME_DEBUG est défini dans jouer/.env et prend le pas sur ce réglage.</p>
    <?php endif; ?>
    <label class="field">Mode debug
      <select name="game_debug">
        <?php $gameDebug = $field('game_debug', 'GAME_DEBUG') ?: 'auto'; ?>
        <?php foreach (['auto' => 'Automatique', 'on' => 'Activé', 'off' => 'Désactivé'] as $key => $label): ?>
          <option value="<?= e($key) ?>"<?= $gameDebug === $key ? ' selected' : '' ?>><?= e($label) ?></option>
        <?php endforeach; ?>
      </select>
    </label>
  </section>
  <section class="panel stack">
    <h2 class="h3">Courriel</h2>
    <p class="small">Laissez le mot de passe vide pour conserver celui déjà enregistré. Le serveur log écrit les messages dans storage/logs.</p>
    <label class="field">Serveur SMTP<input name="smtp_host" value="<?= e($field('smtp_host', 'SMTP_HOST')) ?>"></label>
    <div class="split" style="align-items:end">
      <label class="field">Port<input name="smtp_port" value="<?= e($field('smtp_port', 'SMTP_PORT')) ?>"></label>
      <label class="field">Chiffrement
        <select name="smtp_encryption">
          <?php foreach (['tls' => 'TLS', 'ssl' => 'SSL', 'none' => 'Aucun'] as $key => $label): ?>
            <option value="<?= e($key) ?>"<?= $field('smtp_encryption', 'SMTP_ENCRYPTION') === $key ? ' selected' : '' ?>><?= e($label) ?></option>
          <?php endforeach; ?>
        </select>
      </label>
    </div>
    <label class="field">Identifiant<input name="smtp_user" value="<?= e($field('smtp_user', 'SMTP_USER')) ?>" autocomplete="off"></label>
    <label class="field">Mot de passe<input type="password" name="smtp_pass" autocomplete="new-password" placeholder="Inchangé si vide"></label>
    <label class="field">Adresse d'expédition<input type="email" name="mail_from_address" value="<?= e($field('mail_from_address', 'MAIL_FROM_ADDRESS')) ?>"></label>
    <label class="field">Nom d'expédition<input name="mail_from_name" value="<?= e($field('mail_from_name', 'MAIL_FROM_NAME')) ?>"></label>
    <label class="field">Réception des messages<input type="email" name="mail_to" value="<?= e($field('mail_to', 'MAIL_TO')) ?>"></label>
  </section>
  <section class="panel stack">
    <h2 class="h3">Mentions</h2>
    <label class="field">Éditeur<input name="legal_name" value="<?= e($field('legal_name', 'LEGAL_NAME')) ?>"></label>
    <label class="field">E-mail de contact<input type="email" name="legal_email" value="<?= e($field('legal_email', 'LEGAL_EMAIL')) ?>"></label>
    <label class="field">Adresse postale<input name="legal_address" value="<?= e($field('legal_address', 'LEGAL_ADDRESS')) ?>"></label>
    <label class="field">Hébergeur<input name="legal_host" value="<?= e($field('legal_host', 'LEGAL_HOST')) ?>"></label>
    <button class="btn" type="submit">Enregistrer</button>
  </section>
</form>
<form method="post" action="/admin/environnement/essai" class="panel stack">
  <?= csrf_field() ?>
  <input type="hidden" name="redirect" value="/admin/environnement">
  <h2 class="h3">Essai</h2>
  <p class="small">Envoie le modèle par défaut à <?= e($admin['email'] ?? '') ?>, avec la configuration déjà enregistrée.</p>
  <button class="btn-ghost" type="submit">Envoyer un message d'essai</button>
</form>
<form method="post" action="/admin/compte" class="panel stack">
  <?= csrf_field() ?>
  <input type="hidden" name="redirect" value="/admin/environnement">
  <h2 class="h3">Compte</h2>
  <label class="field">E-mail<input type="email" name="admin_email" value="<?= e($admin['email'] ?? '') ?>" autocomplete="username"></label>
  <label class="field">Mot de passe actuel<input type="password" name="current_password" autocomplete="current-password" required></label>
  <label class="field">Nouveau mot de passe<input type="password" name="new_password" autocomplete="new-password" placeholder="Vide pour ne pas le changer"></label>
  <label class="field">Confirmation<input type="password" name="new_password_confirm" autocomplete="new-password"></label>
  <button class="btn" type="submit">Mettre à jour le compte</button>
</form>
