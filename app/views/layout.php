<?php
$imageUrl = abs_url(asset($image));
$pageUrl = abs_url(request_path());
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($title) ?></title>
<meta name="description" content="<?= e($description) ?>">
<link rel="canonical" href="<?= e($pageUrl) ?>">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="website">
<meta property="og:title" content="<?= e($title) ?>">
<meta property="og:description" content="<?= e($description) ?>">
<meta property="og:url" content="<?= e($pageUrl) ?>">
<meta property="og:image" content="<?= e($imageUrl) ?>">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="<?= e(asset('assets/img/logo-tercium.png')) ?>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Marcellus&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= e(asset('css/site.css')) ?>">
</head>
<body>
<?php partial('header', ['current' => $current]); ?>
<main>
<?= $content ?>
<?php if (!empty($withWaitlist)) { partial('waitlist'); } ?>
</main>
<?php partial('footer'); ?>
<script src="<?= e(asset('js/site.js')) ?>"></script>
</body>
</html>
