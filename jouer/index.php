<?php

declare(strict_types=1);

require __DIR__ . '/config.php';

$game = json_decode((string) @file_get_contents(__DIR__ . '/game.json'), true) ?: [];
$version = (string) ($game['version'] ?? '0');
$debug = jeu_debug_enabled();
$asset = static fn (string $path): string => htmlspecialchars($path . '?v=' . rawurlencode($version), ENT_QUOTES, 'UTF-8');

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

$motes = static function (int $count): string {
    $html = '';
    for ($i = 0; $i < $count; $i++) {
        $size = 2 + $i % 3;
        $html .= sprintf(
            '<i style="left:%d%%;top:%d%%;width:%dpx;height:%dpx;animation-delay:%.1fs;animation-duration:%.1fs"></i>',
            (11 + $i * 37) % 100,
            30 + ($i * 53) % 64,
            $size,
            $size,
            fmod($i * 0.7, 5),
            7 + ($i % 5) * 1.6
        );
    }
    return $html;
};
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Le Dernier Train des Weppes</title>
<link rel="icon" href="/assets/img/logo-tercium.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Marcellus&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= $asset('engine/css/shell.css') ?>">
<link rel="stylesheet" href="<?= $asset('engine/css/cinematic.css') ?>">
<link rel="stylesheet" href="<?= $asset('engine/css/explore.css') ?>">
</head>
<body data-debug="<?= $debug ? 'on' : 'off' ?>">
<div id="app">

  <!-- 01 Accueil -->
  <section id="screen-consent" class="screen active" aria-label="Accueil">
    <img class="consent-bg" src="shared/branding/gare_intro.png" alt="">
    <div class="card">
      <div class="card-head">
        <div class="eyebrow" id="greeting">Avant le départ</div>
        <h1 class="card-title">Le Dernier Train des Weppes</h1>
        <div class="ornament" aria-hidden="true"><span></span><i></i><span></span></div>
        <p class="lead">Deux réglages avant le départ. Vous pourrez les modifier à tout moment dans les Options.</p>
      </div>
      <div class="rows">
        <button type="button" class="row" data-toggle="sound" role="switch" aria-checked="true">
          <span class="row-text"><span class="row-title">Son</span><span class="row-desc">Musique d'ambiance et effets sonores. Le casque est recommandé.</span></span>
          <span class="switch" data-switch="sound" aria-hidden="true"><span class="knob"></span></span>
        </button>
        <button type="button" class="row" data-toggle="consent" role="switch" aria-checked="true">
          <span class="row-text"><span class="row-title">Sauvegarde</span><span class="row-desc">Un cookie reconnaît votre partie et la sauvegarde sur cet appareil. Sans lui, la progression est perdue en quittant.</span></span>
          <span class="switch" data-switch="consent" aria-hidden="true"><span class="knob"></span></span>
        </button>
      </div>
      <button type="button" class="btn-primary" id="btn-start">Monter à bord</button>
      <div class="note">Appuyez sur Entrée pour commencer</div>
    </div>
    <div class="consent-foot">
      <div>Propulsé par <a href="https://tercium.fr" target="_blank" rel="noopener">Groupe Tercium</a></div>
      <div>Build v<?= htmlspecialchars($version, ENT_QUOTES, 'UTF-8') ?></div>
    </div>
  </section>

  <!-- 02 Groupe Tercium -->
  <section id="screen-studio" class="screen skippable" aria-label="Groupe Tercium présente">
    <div class="cover">
      <img class="kenburns" src="shared/branding/fond_intro.png" alt="">
      <div class="studio-signal"></div>
      <div class="studio-shade"></div>
      <div class="motes"><?= $motes(18) ?></div>
      <div class="studio-bloom"></div>
      <div class="studio-logo">
        <img src="shared/branding/logo_intro_seul.png" alt="Groupe Tercium">
        <div class="studio-sweep-box"><div class="studio-sweep"></div></div>
        <div class="studio-flare"></div>
      </div>
      <div class="studio-presente"><span></span><div>présente</div><span></span></div>
    </div>
    <div class="skip-hint">Cliquer pour passer</div>
  </section>

  <!-- 03 Logo -->
  <section id="screen-logo" class="screen skippable" aria-label="Le Dernier Train des Weppes">
    <div class="logo-fog"></div>
    <div class="motes warm"><?= $motes(22) ?></div>
    <div class="logo-push">
      <div class="logo-wrap">
        <img class="soft-mask" src="shared/branding/logo_intro.png" alt="Le Dernier Train des Weppes">
        <div class="logo-beam"></div>
        <div class="logo-headlight"></div>
        <div class="logo-flare"></div>
        <div class="logo-sweep-box"><div class="logo-sweep"></div></div>
      </div>
    </div>
    <div class="logo-letterbox"></div>
    <div class="skip-hint">Cliquer pour passer</div>
  </section>

  <!-- 04 Menu -->
  <section id="screen-menu" class="screen" aria-label="Menu principal">
    <div class="cover">
      <div class="drift">
        <img src="shared/branding/gare_intro.png" alt="">
        <div class="menu-headlight"></div>
        <div class="menu-lamp"></div>
      </div>
      <div class="fog"></div>
    </div>
    <div class="leaves" id="leaves" aria-hidden="true">
      <div class="leaf" style="left:30%;width:12px;height:8px;background:#b8582a;animation-duration:13s;animation-delay:0s"></div>
      <div class="leaf" style="left:52%;width:9px;height:6px;background:#8c3f1f;animation-duration:17s;animation-delay:3s"></div>
      <div class="leaf" style="left:68%;width:14px;height:9px;background:#c9772f;animation-duration:15s;animation-delay:6s"></div>
      <div class="leaf" style="left:82%;width:10px;height:7px;background:#a24a22;animation-duration:12s;animation-delay:2s"></div>
      <div class="leaf" style="left:92%;width:13px;height:8px;background:#b8582a;animation-duration:19s;animation-delay:8s"></div>
      <div class="leaf" style="left:44%;width:8px;height:6px;background:#d08a3a;animation-duration:16s;animation-delay:10s"></div>
    </div>
    <div class="menu-shade"></div>

    <div class="ui">
      <img class="menu-logo soft-mask" src="shared/branding/logo_intro.png" alt="Le Dernier Train des Weppes">
      <nav class="menu" id="menu" aria-label="Menu principal">
        <button type="button" class="item" data-id="new"><i class="arrow"></i><span>Nouvelle partie</span></button>
        <button type="button" class="item" data-id="continue"><i class="arrow"></i><span>Continuer</span></button>
        <button type="button" class="item" data-id="load"><i class="arrow"></i><span>Charger une partie</span></button>
        <button type="button" class="item" data-id="options"><i class="arrow"></i><span>Options</span></button>
        <button type="button" class="item" data-id="credits"><i class="arrow"></i><span>Crédits</span></button>
        <button type="button" class="item" data-id="quit"><i class="arrow"></i><span>Quitter</span></button>
      </nav>
      <div class="corner">
        <button type="button" class="chip" id="sound-chip" data-toggle="sound">Son activé</button>
        <div class="version">Prototype v<?= htmlspecialchars($version, ENT_QUOTES, 'UTF-8') ?></div>
      </div>

      <div class="panel" id="panel" role="dialog" aria-labelledby="panel-title" hidden>
        <div class="panel-head">
          <h2 class="panel-title" id="panel-title"></h2>
          <button type="button" class="panel-close" data-close>Fermer · Échap</button>
        </div>
        <div class="rule"></div>

        <div class="panel-body" data-panel="options">
          <button type="button" class="opt-row" data-toggle="sound" role="switch" aria-checked="true"><span>Son</span><span class="switch" data-switch="sound" aria-hidden="true"><span class="knob"></span></span></button>
          <label class="opt-slider"><span class="opt-line"><span>Musique d'ambiance</span><span class="muted" id="music-val">60</span></span><input type="range" min="0" max="100" id="music"></label>
          <label class="opt-slider"><span class="opt-line"><span>Voix</span><span class="muted" id="voice-val">100</span></span><input type="range" min="0" max="100" id="voice"></label>
          <label class="opt-slider"><span class="opt-line"><span>Effets</span><span class="muted" id="sfx-val">80</span></span><input type="range" min="0" max="100" id="sfx"></label>
          <button type="button" class="opt-row" data-toggle="reduceMotion" role="switch" aria-checked="false"><span class="opt-stack"><span>Réduire les effets visuels</span><span class="small muted">Atténue les éclairs, secousses et animations</span></span><span class="switch" data-switch="reduceMotion" aria-hidden="true"><span class="knob"></span></span></button>
          <label class="opt-slider"><span class="opt-line"><span>Taille des textes</span><span class="muted" id="text-scale-val">100 %</span></span><input type="range" min="100" max="160" step="10" id="text-scale"></label>
          <button type="button" class="opt-row" data-toggle="consent" role="switch" aria-checked="true"><span class="opt-stack"><span>Cookie de sauvegarde</span><span class="small muted">Reconnaît et sauvegarde votre partie</span></span><span class="switch" data-switch="consent" aria-hidden="true"><span class="knob"></span></span></button>
          <button type="button" class="btn-danger" id="btn-erase">Effacer les sauvegardes</button>
        </div>

        <div class="panel-body" data-panel="newgame">
          <div class="ng-step" data-step="choice" role="radiogroup" aria-label="Où garder votre progression">
            <p class="muted">Où souhaitez-vous garder votre progression ?</p>
            <div class="choice" id="ng-account" data-mode="account" role="radio" tabindex="0" aria-checked="false">
              <div class="choice-title"><span class="radio"></span>Créer un compte <span class="tag">Recommandé</span></div>
              <ul class="choice-list"><li>Moins d'une minute</li><li>Reprenez votre partie sur n'importe quel appareil</li><li>Progression conservée en cas de problème</li></ul>
            </div>
            <div class="choice selected" id="ng-local" data-mode="local" role="radio" tabindex="0" aria-checked="true">
              <div class="choice-title"><span class="radio"></span>Sur ce navigateur uniquement</div>
              <ul class="choice-list"><li>Aucun compte nécessaire</li><li>Partie jouable seulement sur cet appareil et ce navigateur</li><li class="warn">Progression perdue si les données du navigateur sont effacées</li></ul>
            </div>
            <div class="quit-actions"><button type="button" class="btn-gold" id="ng-go">Commencer</button></div>
          </div>
          <form class="ng-step" data-step="account" id="ng-form" novalidate>
            <p class="muted">Créez votre compte pour retrouver votre partie partout.</p>
            <label class="field"><span>Pseudo</span><input name="pseudo" autocomplete="nickname" maxlength="24"></label>
            <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email"></label>
            <label class="field"><span>Mot de passe</span><input name="pass" type="password" autocomplete="new-password" placeholder="6 caractères minimum"></label>
            <div class="form-error" id="ng-error" role="alert"></div>
            <div class="quit-actions">
              <button type="submit" class="btn-gold">Créer et jouer</button>
              <button type="button" class="btn-ghost" id="ng-back">Retour</button>
            </div>
          </form>
        </div>

        <div class="panel-body" data-panel="load">
          <form class="login" id="login-form" novalidate>
            <p class="muted">Vous avez un compte ? Connectez-vous pour retrouver votre partie sur n'importe quel appareil.</p>
            <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email"></label>
            <label class="field"><span>Mot de passe</span><input name="pass" type="password" autocomplete="current-password"></label>
            <div class="form-error" id="login-error" role="alert"></div>
            <div class="quit-actions"><button type="submit" class="btn-gold">Se connecter</button></div>
          </form>
          <div class="account-bar" id="account-bar"><span>Connecté : <strong id="account-name"></strong></span><button type="button" class="link" id="btn-logout">Se déconnecter</button></div>
          <div class="section-label" id="slots-label">Sur ce navigateur</div>
          <div class="slots" id="slots"></div>
        </div>

        <div class="panel-body" data-panel="credits">
          <div class="credit"><div class="label">Une production</div><div>Groupe Tercium</div></div>
          <div class="credit"><div class="label">Jeu</div><div>Le Dernier Train des Weppes</div></div>
          <div class="credit"><div class="label">Version</div><div>Prototype navigateur · 2026</div></div>
        </div>

        <div class="panel-body" data-panel="quit">
          <p>Quitter le jeu et revenir à l'écran d'accueil ? <span id="quit-note"></span></p>
          <div class="quit-actions">
            <button type="button" class="btn-gold" id="btn-quit">Quitter</button>
            <button type="button" class="btn-ghost" data-close>Rester</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 05 Scènes du jeu (scenes/<id>/scene.json) -->
  <section id="screen-game" class="screen" aria-label="Jeu">
    <div id="stage"></div>
  </section>

  <div id="fade"></div>
  <div id="sr-status" class="sr-only" role="status" aria-live="polite"></div>
  <div id="sr-alert" class="sr-only" role="alert" aria-live="assertive"></div>
</div>
<script type="module" src="<?= $asset('engine/main.js') ?>"></script>
</body>
</html>
