<?php
$report = $report;
$maxVisits = 1;
$maxSignups = 1;
foreach ($report['series'] as $point) {
    $maxVisits = max($maxVisits, $point['visits']);
    $maxSignups = max($maxSignups, $point['signups']);
}
$step = max(1, (int) floor(count($report['series']) / 6));
?>
<nav class="filters" aria-label="Période">
  <?php foreach ([7 => '7 jours', 30 => '30 jours', 90 => '90 jours'] as $days => $label): ?>
    <a class="pill<?= $report['days'] === $days ? ' on' : '' ?>" href="/admin/statistiques?periode=<?= $days ?>"><?= e($label) ?></a>
  <?php endforeach; ?>
</nav>
<div class="kpis">
  <article class="kpi"><span>Visites</span><b><?= (int) $report['visits'] ?></b><small><?= (int) $report['sessions'] ?> sessions</small></article>
  <article class="kpi"><span>Inscriptions</span><b><?= (int) $report['signups'] ?></b><small>sur la période</small></article>
  <article class="kpi"><span>Messages</span><b><?= (int) $report['messages'] ?></b><small>sur la période</small></article>
  <article class="kpi"><span>Confirmation</span><b><?= $report['rate'] === null ? '—' : (int) $report['rate'] . '%' ?></b><small><?= (int) $report['confirmed'] ?> confirmés, <?= (int) $report['pending'] ?> en attente</small></article>
</div>
<p class="small">Une visite correspond à une page vue une fois par session. Les robots connus ne sont pas comptés. Les statistiques de plus de quatorze mois sont effacées.</p>
<section class="panel">
  <h2 class="h3">Visites par jour</h2>
  <div class="bars" role="img" aria-label="Visites par jour">
    <?php foreach ($report['series'] as $index => $point): ?>
      <div class="bar" title="<?= e($point['label']) ?> : <?= (int) $point['visits'] ?>">
        <i style="height:<?= $point['visits'] > 0 ? max(4, (int) round($point['visits'] / $maxVisits * 100)) : 0 ?>%"></i>
        <?php if ($index % $step === 0): ?><span><?= e($point['label']) ?></span><?php endif; ?>
      </div>
    <?php endforeach; ?>
  </div>
</section>
<section class="panel">
  <h2 class="h3">Inscriptions par jour</h2>
  <div class="bars" role="img" aria-label="Inscriptions par jour">
    <?php foreach ($report['series'] as $index => $point): ?>
      <div class="bar" title="<?= e($point['label']) ?> : <?= (int) $point['signups'] ?>">
        <i style="height:<?= $point['signups'] > 0 ? max(4, (int) round($point['signups'] / $maxSignups * 100)) : 0 ?>%"></i>
        <?php if ($index % $step === 0): ?><span><?= e($point['label']) ?></span><?php endif; ?>
      </div>
    <?php endforeach; ?>
  </div>
</section>
<div class="admin-grid">
  <section class="panel">
    <h2 class="h3">Pages</h2>
    <?php if (!$report['pages']): ?><p class="small">Aucune visite sur cette période.</p><?php else: ?>
      <ul class="plain">
        <?php foreach ($report['pages'] as $row): ?>
          <li><span><?= e(path_label((string) $row['path'])) ?></span><em><?= (int) $row['n'] ?></em></li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </section>
  <section class="panel">
    <h2 class="h3">Provenance</h2>
    <?php if (!$report['referrers']): ?><p class="small">Aucune visite sur cette période.</p><?php else: ?>
      <ul class="plain">
        <?php foreach ($report['referrers'] as $row): ?>
          <li><span><?= e($row['referrer'] !== '' ? $row['referrer'] : 'Direct ou interne') ?></span><em><?= (int) $row['n'] ?></em></li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </section>
</div>
