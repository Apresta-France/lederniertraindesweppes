<?php $email = contact_email(); ?>
<article class="article">
  <div class="eyebrow">Informations</div>
  <h1>Confidentialité</h1>
  <h2>Responsable</h2>
  <p>Le responsable du traitement est <?= e(legal_value('LEGAL_NAME', 'Groupe Tercium')) ?>.<?php if ($email !== ''): ?> Pour exercer vos droits : <a href="mailto:<?= e($email) ?>"><?= e($email) ?></a>.<?php else: ?> Pour exercer vos droits, écrivez via le <a href="/contact">formulaire de contact</a>.<?php endif; ?></p>
  <h2>Données collectées</h2>
  <p>Liste d'attente : adresse e-mail, date d'inscription et page depuis laquelle la demande a été faite.</p>
  <p>Formulaire de contact : nom, adresse e-mail, sujet et message.</p>
  <p>Statistiques de fréquentation : page consultée, date, site d'origine lorsqu'il est connu, et un identifiant de session technique. L'adresse IP n'est pas conservée. Elle ne sert qu'à limiter les envois abusifs, sous la forme d'une empreinte non réversible.</p>
  <h2>Pourquoi</h2>
  <p>La liste d'attente sert à prévenir les personnes inscrites de l'ouverture du prototype. Le formulaire sert à répondre aux messages. Les statistiques servent à savoir quelles pages sont lues.</p>
  <p>L'inscription repose sur votre consentement, confirmé par e-mail. La réponse aux messages et la mesure d'audience reposent sur l'intérêt légitime de faire fonctionner le site.</p>
  <h2>Durée</h2>
  <p>Les inscriptions sont conservées jusqu'à la désinscription, ou trois ans après le dernier échange. Les messages sont conservés trois ans. Les statistiques sont conservées quatorze mois.</p>
  <h2>Cookies</h2>
  <p>Un cookie de session, nommé LDTWSESSID, sécurise les formulaires et l'accès à l'administration. Il n'est pas publicitaire et il n'est pas déposé par un tiers.</p>
  <h2>Destinataires</h2>
  <p>L'équipe du jeu, et le prestataire d'envoi configuré pour les e-mails. Les adresses ne sont pas vendues.</p>
  <h2>Vos droits</h2>
  <p>Vous pouvez demander l'accès, la rectification, l'effacement, la limitation ou l'opposition au traitement. Vous pouvez aussi introduire une réclamation auprès de la CNIL, cnil.fr.</p>
  <p>Chaque e-mail de la liste d'attente contient un lien de désinscription. Vous pouvez aussi écrire au responsable.</p>
</article>
