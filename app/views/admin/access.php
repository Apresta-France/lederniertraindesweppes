<p class="small">Sans clé active, la page /jouer reste fermée. Une clé désactivée coupe l'accès dès le prochain chargement du jeu. Une session administrateur ouvre toujours le jeu.</p>
<form method="post" action="/admin/acces/creer" class="panel stack">
  <?= csrf_field() ?>
  <input type="hidden" name="redirect" value="/admin/acces">
  <h2 class="h3">Nouvelle clé</h2>
  <label class="field">Nom du destinataire<input name="label" maxlength="80" placeholder="Utilisé dans le message, facultatif"></label>
  <label class="field">E-mail<input type="email" name="email" maxlength="180" placeholder="Facultatif si vous transmettez la clé vous-même"></label>
  <label class="small" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" name="send" value="1" checked> Envoyer l'invitation par e-mail</label>
  <button class="btn" type="submit">Générer la clé</button>
</form>
<p class="small"><?= (int) $active ?> clé<?= $active > 1 ? 's' : '' ?> active<?= $active > 1 ? 's' : '' ?> sur <?= (int) $total ?>.</p>
<div class="table-wrap">
<table class="data">
  <thead><tr><th>Destinataire</th><th>Clé</th><th>Statut</th><th>Utilisation</th><th>Envoi</th><th></th></tr></thead>
  <tbody>
  <?php if (!$rows): ?>
    <tr><td colspan="6">Aucune clé.</td></tr>
  <?php endif; ?>
  <?php foreach ($rows as $row): ?>
    <?php $isActive = (int) $row['active'] === 1; ?>
    <tr>
      <td>
        <?= e($row['label'] ?? '') ?>
        <?php if ($row['email']): ?><div class="small"><?= e($row['email']) ?></div><?php endif; ?>
      </td>
      <td>
        <span class="key-code"><?= e($row['code']) ?></span>
        <div><button class="text-btn" type="button" data-copy="<?= e(GameAccess::link($row)) ?>">Copier le lien</button></div>
      </td>
      <td><span class="badge <?= $isActive ? 'ok' : 'off' ?>"><?= $isActive ? 'Active' : 'Désactivée' ?></span></td>
      <td>
        <?php if ((int) $row['uses'] > 0): ?>
          <?= (int) $row['uses'] ?> ouverture<?= (int) $row['uses'] > 1 ? 's' : '' ?>
          <div class="small">Dernière : <?= e(fr_date($row['last_used_at'])) ?></div>
        <?php else: ?>
          <span class="small">Jamais utilisée</span>
        <?php endif; ?>
      </td>
      <td>
        <?php if ($row['sent_at']): ?><?= e(fr_date($row['sent_at'])) ?><?php else: ?><span class="small">Non envoyée</span><?php endif; ?>
        <?php if ($row['mail_error']): ?><div class="small"><?= e($row['mail_error']) ?></div><?php endif; ?>
      </td>
      <td class="actions">
        <?php if ($row['email']): ?>
          <form method="post" action="/admin/acces/envoyer">
            <?= csrf_field() ?>
            <input type="hidden" name="redirect" value="/admin/acces">
            <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
            <button class="text-btn" type="submit"><?= $row['sent_at'] ? 'Renvoyer' : 'Envoyer' ?></button>
          </form>
        <?php endif; ?>
        <form method="post" action="/admin/acces/basculer">
          <?= csrf_field() ?>
          <input type="hidden" name="redirect" value="/admin/acces">
          <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
          <button class="text-btn" type="submit"><?= $isActive ? 'Désactiver' : 'Activer' ?></button>
        </form>
        <form method="post" action="/admin/acces/supprimer" data-confirm="Supprimer définitivement cette clé ?">
          <?= csrf_field() ?>
          <input type="hidden" name="redirect" value="/admin/acces">
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
      <a href="/admin/acces?page=<?= $i ?>"<?= $i === $page ? ' aria-current="page"' : '' ?>><?= $i ?></a>
    <?php endfor; ?>
  </nav>
<?php endif; ?>
