<?php $email = contact_email(); ?>
<article class="article">
  <div class="eyebrow">Informations</div>
  <h1>Mentions légales</h1>
  <h2>Éditeur</h2>
  <p>Ce site présente Le Dernier Train des Weppes, un jeu d'aventure de <?= e(legal_value('LEGAL_NAME', 'Groupe Tercium')) ?>.</p>
  <p>Éditeur : <?= e(legal_value('LEGAL_NAME', 'Groupe Tercium')) ?>.<?php if (legal_value('LEGAL_ADDRESS', '') !== ''): ?> <?= e(legal_value('LEGAL_ADDRESS', '')) ?>.<?php endif; ?></p>
  <p>Contact : <?php if ($email !== ''): ?><a href="mailto:<?= e($email) ?>"><?= e($email) ?></a><?php else: ?><a href="/contact">le formulaire du site</a><?php endif; ?>. Site du studio : <a href="https://tercium.fr" target="_blank" rel="noopener">tercium.fr</a>.</p>
  <h2>Directeur de la publication</h2>
  <p><?= e(legal_value('LEGAL_NAME', 'Groupe Tercium')) ?>.</p>
  <h2>Hébergement</h2>
  <p><?php if (legal_value('LEGAL_HOST', '') !== ''): ?><?= e(legal_value('LEGAL_HOST', '')) ?>.<?php else: ?>Les coordonnées de l'hébergeur sont communiquées sur demande, à l'adresse de contact.<?php endif; ?></p>
  <h2>Propriété intellectuelle</h2>
  <p>Les textes, les images, la marque et le jeu sont protégés. Toute reproduction non autorisée est interdite. Les visuels appartiennent à leurs auteurs et à <?= e(legal_value('LEGAL_NAME', 'Groupe Tercium')) ?>.</p>
  <h2>Données personnelles</h2>
  <p>Les informations collectées via la liste d'attente et le formulaire de contact sont décrites dans la <a href="/confidentialite">politique de confidentialité</a>.</p>
</article>
