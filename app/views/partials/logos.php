<?php
$logos = partner_logos();
if ($limit > 0) {
    $logos = array_slice($logos, 0, $limit);
}
?>
<div class="logos">
<?php if ($logos): ?>
    <?php foreach ($logos as $logo): ?>
        <div><img src="<?= e(asset($logo)) ?>" alt="<?= e(logo_alt($logo)) ?>"></div>
    <?php endforeach; ?>
<?php else: ?>
    <?php for ($i = 1; $i <= $placeholders; $i++): ?>
        <div><!-- remplacer par <img src="assets/partenaires/partenaire-<?= $i ?>.png" alt="Nom du partenaire"> -->Logo partenaire</div>
    <?php endfor; ?>
<?php endif; ?>
</div>
