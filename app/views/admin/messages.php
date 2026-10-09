<?php if ($opened): ?>
  <article class="panel stack">
    <div class="meta"><?= e(fr_date($opened['created_at'])) ?> · <?= e($opened['subject']) ?></div>
    <h2 class="h3"><?= e($opened['name']) ?></h2>
    <p><a href="mailto:<?= e($opened['email']) ?>"><?= e($opened['email']) ?></a></p>
    <p class="body"><?= nl2br(e($opened['body'])) ?></p>
    <?php if ($opened['mail_error']): ?><p class="err"><?= e($opened['mail_error']) ?></p><?php endif; ?>
    <form method="post" action="/admin/messages/supprimer" data-confirm="Supprimer ce message ?">
      <?= csrf_field() ?>
      <input type="hidden" name="redirect" value="/admin/messages">
      <input type="hidden" name="id" value="<?= (int) $opened['id'] ?>">
      <button class="text-btn" type="submit">Supprimer</button>
    </form>
  </article>
<?php endif; ?>
<p class="small"><?= (int) $total ?> message<?= $total > 1 ? 's' : '' ?>.</p>
<div class="table-wrap">
<table class="data">
  <thead><tr><th>Date</th><th>Nom</th><th>Sujet</th><th></th></tr></thead>
  <tbody>
  <?php if (!$rows): ?><tr><td colspan="4">Aucun message.</td></tr><?php endif; ?>
  <?php foreach ($rows as $row): ?>
    <tr>
      <td><?= e(fr_date($row['created_at'])) ?></td>
      <td><?= e($row['name']) ?><div class="small"><?= e($row['email']) ?></div></td>
      <td><?= e($row['subject']) ?><?php if ($row['mail_error']): ?><div class="small"><?= e($row['mail_error']) ?></div><?php endif; ?></td>
      <td><a class="link" href="/admin/messages?id=<?= (int) $row['id'] ?>&amp;page=<?= (int) $page ?>">Lire</a></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>
<?php if ($pages > 1): ?>
  <nav class="pager" aria-label="Pages">
    <?php for ($i = 1; $i <= $pages; $i++): ?>
      <a href="/admin/messages?page=<?= $i ?>"<?= $i === $page ? ' aria-current="page"' : '' ?>><?= $i ?></a>
    <?php endfor; ?>
  </nav>
<?php endif; ?>
