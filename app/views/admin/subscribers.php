<p class="small"><?= (int) $total ?> adresse<?= $total > 1 ? 's' : '' ?>. Une inscription n'est confirmée qu'après le clic dans l'e-mail.</p>
<form class="filters" method="get" action="/admin/inscrits">
  <input name="q" value="<?= e($q) ?>" placeholder="Rechercher une adresse" aria-label="Recherche">
  <select name="statut" aria-label="Statut">
    <option value="">Tous les statuts</option>
    <?php foreach (['pending' => 'En attente', 'confirmed' => 'Confirmés', 'unsubscribed' => 'Désinscrits'] as $key => $label): ?>
      <option value="<?= e($key) ?>"<?= $status === $key ? ' selected' : '' ?>><?= e($label) ?></option>
    <?php endforeach; ?>
  </select>
  <button class="btn" type="submit">Filtrer</button>
  <a class="btn-ghost" href="/admin/inscrits/export">Exporter</a>
</form>
<div class="table-wrap">
<table class="data">
  <thead><tr><th>Adresse</th><th>Statut</th><th>Date</th><th>Source</th><th></th></tr></thead>
  <tbody>
  <?php if (!$rows): ?>
    <tr><td colspan="5">Aucune adresse.</td></tr>
  <?php endif; ?>
  <?php foreach ($rows as $row): ?>
    <tr>
      <td><?= e($row['email']) ?><?php if ($row['mail_error']): ?><div class="small"><?= e($row['mail_error']) ?></div><?php endif; ?></td>
      <td><span class="badge <?= $row['status'] === 'confirmed' ? 'ok' : ($row['status'] === 'unsubscribed' ? 'off' : 'wait') ?>"><?= e(subscriber_label($row['status'])) ?></span></td>
      <td><?= e(fr_date($row['created_at'])) ?></td>
      <td><?= e((string) ($row['source'] ?? '')) ?></td>
      <td class="actions">
        <?php if ($row['status'] === 'pending'): ?>
          <form method="post" action="/admin/inscrits/renvoyer">
            <?= csrf_field() ?>
            <input type="hidden" name="redirect" value="/admin/inscrits">
            <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
            <button class="text-btn" type="submit">Renvoyer</button>
          </form>
        <?php endif; ?>
        <form method="post" action="/admin/inscrits/supprimer" data-confirm="Supprimer cette adresse ?">
          <?= csrf_field() ?>
          <input type="hidden" name="redirect" value="/admin/inscrits">
          <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
          <button class="text-btn" type="submit">Supprimer</button>
        </form>
      </td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>
<?php if ($pages > 1): ?>
  <nav class="pager" aria-label="Pages">
    <?php for ($i = 1; $i <= $pages; $i++): ?>
      <a href="/admin/inscrits?page=<?= $i ?>&amp;q=<?= e(rawurlencode($q)) ?>&amp;statut=<?= e($status) ?>"<?= $i === $page ? ' aria-current="page"' : '' ?>><?= $i ?></a>
    <?php endfor; ?>
  </nav>
<?php endif; ?>
