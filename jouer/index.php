<?php

declare(strict_types=1);

require __DIR__ . '/config.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Le jeu — Le Dernier Train des Weppes</title>
<link rel="icon" href="/assets/img/logo-tercium.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Marcellus&display=swap" rel="stylesheet">
<style>
  :root{--bg:#070b12;--gold:#d9b77a;--cream:#efe0bf;--text:#cdbf9f}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 20px;background:var(--bg);color:var(--cream);font-family:'Marcellus',Georgia,serif}
  main{max-width:640px;display:flex;flex-direction:column;gap:18px}
  img{width:min(420px,100%);height:auto}
  .eyebrow{font-family:'Cinzel',serif;font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold)}
  h1{margin:0;font-family:'Cinzel',serif;font-weight:600;font-size:clamp(28px,5vw,46px);line-height:1.15}
  p{margin:0;font-size:18px;line-height:1.6;color:var(--text)}
  a{display:inline-flex;margin-top:8px;padding:14px 22px;background:var(--gold);color:#141b26;text-decoration:none;font-family:'Cinzel',serif;font-weight:600;letter-spacing:.12em;text-transform:uppercase;font-size:13px;border-radius:3px}
</style>
</head>
<body>
<main>
  <img src="/assets/img/logo-jeu.png" alt="Le Dernier Train des Weppes">
  <div class="eyebrow">Le jeu</div>
  <h1>Le quai n'est pas encore ouvert</h1>
  <p>Cette adresse est réservée au jeu. Il aura ici son propre dossier et son propre environnement, séparés du site.</p>
  <a href="/">Retour au site</a>
</main>
</body>
</html>
