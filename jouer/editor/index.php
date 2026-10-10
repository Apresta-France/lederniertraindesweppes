<?php

declare(strict_types=1);

require __DIR__ . '/lib/guard.php';

$session = editor_guard(false);
$version = (string) max(
    (int) @filemtime(__DIR__ . '/editor.css'),
    (int) @filemtime(__DIR__ . '/js/main.js')
);

header('Cache-Control: no-store');
?><!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Éditeur de scènes — Le Dernier Train des Weppes</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Marcellus&display=swap">
    <link rel="stylesheet" href="editor.css?v=<?= e($version) ?>">
    <script type="module" src="js/main.js?v=<?= e($version) ?>"></script>
</head>
<body class="ed" data-csrf="<?= e($session['csrf']) ?>" data-user="<?= e($session['email']) ?>" data-api="api.php">
    <a class="skip-link" href="#workspace">Aller à l’espace de travail</a>
    <header class="topbar">
        <div class="brand">
            <span class="brand-title" id="game-title">Le Dernier Train des Weppes</span>
            <span class="brand-sub">Éditeur de scènes</span>
        </div>
        <div class="current">
            <span class="current-label">Scène :</span>
            <strong id="current-scene">aucune</strong>
            <span id="save-status" class="save-status" role="status" aria-live="polite"></span>
        </div>
        <div class="top-actions">
            <button type="button" id="btn-undo" class="btn" disabled title="Annuler (Ctrl+Z)">Annuler</button>
            <button type="button" id="btn-redo" class="btn" disabled title="Rétablir (Ctrl+Y ou Ctrl+Maj+Z)">Rétablir</button>
            <button type="button" id="btn-save" class="btn btn-gold" disabled title="Enregistrer (Ctrl+S)">Enregistrer</button>
            <button type="button" id="btn-test" class="btn" disabled title="Tester la version en cours dans un nouvel onglet">Tester</button>
            <button type="button" id="btn-characters" class="btn" title="Sprites, animations et voix des personnages">Personnages</button>
            <a class="btn btn-ghost" href="../" target="_blank" rel="noopener">Ouvrir le jeu</a>
            <a class="btn btn-ghost" href="/admin">Administration</a>
            <span class="user" title="Connecté"><?= e($session['email']) ?></span>
        </div>
    </header>

    <div id="banner" class="banner" role="alert" hidden></div>

    <div class="layout">
        <nav class="sidebar" aria-labelledby="scenes-heading">
            <div class="sidebar-head">
                <h2 id="scenes-heading">Scènes</h2>
                <button type="button" id="btn-new-scene" class="btn btn-small">Nouvelle scène</button>
            </div>
            <ul id="scene-list" class="scene-list"></ul>
        </nav>

        <main id="workspace" class="workspace" tabindex="-1">
            <div class="tabs" role="tablist" aria-label="Vues de la scène">
                <button type="button" role="tab" id="tab-visual" aria-controls="panel-visual" aria-selected="true">Visuel</button>
                <button type="button" role="tab" id="tab-scene" aria-controls="panel-scene" aria-selected="false" tabindex="-1">Scène</button>
                <button type="button" role="tab" id="tab-sounds" aria-controls="panel-sounds" aria-selected="false" tabindex="-1">Sons</button>
                <button type="button" role="tab" id="tab-gallery" aria-controls="panel-gallery" aria-selected="false" tabindex="-1">Galerie</button>
                <button type="button" role="tab" id="tab-json" aria-controls="panel-json" aria-selected="false" tabindex="-1">JSON</button>
            </div>
            <section id="panel-visual" class="panel panel-visual" role="tabpanel" aria-labelledby="tab-visual">
                <p class="empty">Choisissez une scène dans la liste.</p>
            </section>
            <section id="panel-scene" class="panel panel-scroll" role="tabpanel" aria-labelledby="tab-scene" hidden></section>
            <section id="panel-sounds" class="panel panel-sounds" role="tabpanel" aria-labelledby="tab-sounds" hidden></section>
            <section id="panel-gallery" class="panel panel-gallery" role="tabpanel" aria-labelledby="tab-gallery" hidden></section>
            <section id="panel-json" class="panel panel-json" role="tabpanel" aria-labelledby="tab-json" hidden></section>
            <details id="validation" class="validation">
                <summary><span id="validation-summary">Vérifications</span></summary>
                <ul id="validation-list" class="validation-list"></ul>
            </details>
        </main>

        <aside class="inspector" aria-labelledby="inspector-heading">
            <h2 id="inspector-heading" class="visually-hidden">Inspecteur</h2>
            <div id="preview-dock" class="preview-dock" hidden></div>
            <div id="inspector" class="inspector-body"></div>
        </aside>
    </div>

    <div id="toasts" class="toasts" aria-live="polite"></div>
</body>
</html>
