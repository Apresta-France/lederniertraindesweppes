<div class="kpis">
  <article class="kpi"><span>Confirmés</span><b><?= (int) $confirmed ?></b></article>
  <article class="kpi"><span>En attente</span><b><?= (int) $pending ?></b></article>
  <article class="kpi"><span>Messages</span><b><?= (int) $messages ?></b></article>
  <article class="kpi"><span>Visites, 30 jours</span><b><?= (int) $visits ?></b></article>
</div>
<div class="admin-grid">
  <section class="panel">
    <h2 class="h3">Dernières inscriptions</h2>
    <?php if (!$subscribers): ?><p class="small">Personne pour le moment.</p><?php else: ?>
      <ul class="plain">
        <?php foreach ($subscribers as $row): ?>
          <li><span><?= e($row['email']) ?></span><em class="badge <?= $row['status'] === 'confirmed' ? 'ok' : ($row['status'] === 'unsubscribed' ? 'off' : 'wait') ?>"><?= e(subscriber_label($row['status'])) ?></em></li>
        <?php endforeach; ?>
      </ul>
      <a class="link" href="/admin/inscrits">Toute la liste</a>
    <?php endif; ?>
  </section>
  <section class="panel">
    <h2 class="h3">Derniers messages</h2>
    <?php if (!$latestMessages): ?><p class="small">Aucun message.</p><?php else: ?>
      <ul class="plain">
        <?php foreach ($latestMessages as $row): ?>
          <li><a href="/admin/messages?id=<?= (int) $row['id'] ?>"><?= e($row['name']) ?> — <?= e($row['subject']) ?></a></li>
        <?php endforeach; ?>
      </ul>
      <a class="link" href="/admin/messages">Tous les messages</a>
    <?php endif; ?>
  </section>
</div>
