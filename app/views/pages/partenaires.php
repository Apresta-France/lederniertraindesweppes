<?php $logos = partner_logos(); ?>
<section class="banner"><img src="<?= e(asset('assets/img/residence-jardin.png')) ?>" alt=""><div class="shade-v"></div><div class="wrap banner-c"><div class="eyebrow rise d1">Partenaires</div><h1 class="h1 rise d2" style="max-width:860px">Faire découvrir les Weppes autrement</h1><p class="lead rise d3">Un jeu gratuit, jouable dans le navigateur, ancré dans un territoire réel. Rejoignez le voyage.</p></div></section>
<section class="wrap sec"><div class="split">
  <div class="stack">
    <div class="eyebrow">Le projet</div>
    <h2 class="h2">Un territoire que l'on peut visiter</h2>
    <p class="body">Le Dernier Train des Weppes s'écrit à partir de Fournes-en-Weppes, de sa gare, de la ligne Michon et des mots d'ici. Le récit est une fiction. Les lieux, eux, existent.</p>
    <p class="body">Devenir partenaire, c'est aider ce jeu à exister, et donner au territoire une présence que l'on emporte chez soi, sans rien installer.</p>
  </div>
  <div class="frame" style="aspect-ratio:16/10"><img src="<?= e(asset('assets/img/plaque-fournes.png')) ?>" alt="La plaque de la gare de Fournes-en-Weppes"></div>
</div></section>
<section class="band"><div class="wrap sec stack" style="gap:32px">
  <div class="stack-s"><div class="eyebrow">Avec qui</div><h2 class="h2">Plusieurs façons de nous rejoindre</h2></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px">
    <div class="type"><h3 class="h3" style="font-size:19px">Collectivités</h3><p class="small">Communes, intercommunalité, offices de tourisme.</p></div>
    <div class="type"><h3 class="h3" style="font-size:19px">Patrimoine et mémoire</h3><p class="small">Associations, archives, sociétés historiques locales.</p></div>
    <div class="type"><h3 class="h3" style="font-size:19px">Entreprises</h3><p class="small">Mécénat, soutien financier ou mise à disposition de compétences.</p></div>
    <div class="type"><h3 class="h3" style="font-size:19px">Médias</h3><p class="small">Presse régionale, radios, créateurs de contenu.</p></div>
  </div>
</div></section>
<section class="wrap sec stack" style="gap:36px">
  <div class="stack" style="max-width:680px"><div class="eyebrow">Ce que cela change</div><h2 class="h2">Ce que nous proposons</h2></div>
  <div class="pillars">
    <div><div class="num">I</div><h3 class="h3">Valoriser le patrimoine</h3><p class="small">La gare, les moulins, les mots d'ici deviennent le décor d'une histoire que l'on peut parcourir.</p></div>
    <div><div class="num">II</div><h3 class="h3">Toucher tous les âges</h3><p class="small">Un jeu dans le navigateur, qui parle de mémoire et de transmission, sans installation.</p></div>
    <div><div class="num">III</div><h3 class="h3">Une visibilité durable</h3><p class="small">Le nom du partenaire figure sur le site, dans les crédits du jeu, et lors des temps forts du projet.</p></div>
  </div>
</section>
<section class="band" style="border-bottom:0"><div class="wrap sec stack" style="gap:28px">
  <div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px">
    <div class="stack" style="max-width:680px"><div class="eyebrow">Ils nous accompagnent</div><h2 class="h2"><?= $logos ? 'Nos partenaires' : 'La place est libre' ?></h2><p class="body"><?= $logos ? 'Celles et ceux qui rendent ce voyage possible.' : 'Les partenaires seront nommés ici, sur le site et dans les crédits du jeu. Le premier peut être le vôtre.' ?></p></div>
    <a class="btn" href="/contact?sujet=partenariat">Devenir partenaire</a>
  </div>
  <?php if ($logos): partial('logos', ['limit' => 0, 'placeholders' => 0]); endif; ?>
</div></section>
