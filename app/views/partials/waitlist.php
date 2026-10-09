<?php
$wlOk = flash('waitlist_ok');
$wlErr = flash('waitlist_err') ?? flash('err');
?>
<section class="waitlist" id="waitlist">
  <img src="<?= e(asset('assets/img/plaine.png')) ?>" alt="" loading="lazy">
  <div class="wrap">
    <div class="eyebrow">Liste d'attente</div>
    <h2 class="h2">Soyez parmi les premiers à monter à bord</h2>
    <p class="body" style="font-size:17px;line-height:1.6">Le prototype n'est pas encore ouvert au public. Inscrivez-vous pour y accéder en avant-première et suivre l'avancement du jeu.</p>
    <form class="wl" method="post" action="/liste-attente" novalidate<?= $wlOk ? ' hidden' : '' ?>>
      <?= csrf_field() ?>
      <?= honeypot_field() ?>
      <input type="hidden" name="redirect" value="<?= e(return_path()) ?>">
      <input type="email" name="email" placeholder="Votre adresse e-mail" aria-label="Adresse e-mail" autocomplete="email" maxlength="180">
      <button class="btn" type="submit">M'inscrire</button>
    </form>
    <div class="err"><?= e($wlErr ?? '') ?></div>
    <div class="ok"<?= $wlOk ? '' : ' hidden' ?>><?= e($wlOk ?? 'Merci. Ouvrez le message que nous venons d\'envoyer pour confirmer votre place.') ?></div>
  </div>
</section>
