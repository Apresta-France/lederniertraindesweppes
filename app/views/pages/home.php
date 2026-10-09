<?php
$site = site_content();
$statusLabel = ['done' => 'Terminé', 'now' => 'En cours', 'next' => 'À venir'];
?>
<section class="hero" id="top">
  <div class="hero-bg"><img src="<?= e(asset('assets/img/gare.png')) ?>" alt=""><div class="headlight"></div></div>
  <div class="shade-v"></div><div class="shade-h"></div>
  <div class="wrap hero-c">
    <div class="hero-logo rise"><img src="<?= e(asset('assets/img/logo-jeu.png')) ?>" alt="Le Dernier Train des Weppes"></div>
    <div class="eyebrow rise d2">Un jeu d'aventure Groupe Tercium</div>
    <h1 class="rise d2">Au weppe, ce qui est parti revient.</h1>
    <p class="lead rise d3" style="font-size:clamp(16px,1.8vw,23px);line-height:1.55;max-width:620px">Fournes-en-Weppes, nuit du 1<sup>er</sup> au 2 novembre 2026. La vieille gare s'effondre sous l'orage. À la résidence des Weppes, une horloge se remet en marche.</p>
    <div class="actions rise d4"><a class="btn" href="#waitlist">Rejoindre la liste d'attente</a><a class="btn-ghost" href="/le-jeu">Découvrir le jeu</a></div>
    <div class="tags rise d5"><span>Point &amp; click narratif</span><span>·</span><span>Dans le navigateur</span><span>·</span><span>En développement</span></div>
  </div>
</section>
<section class="wrap sec" id="concept">
  <div class="split">
    <div class="stack">
      <div class="eyebrow">Le concept</div>
      <h2 class="h2" style="font-size:clamp(30px,3.6vw,48px);line-height:1.15">L'heure où, parfois, ce qui est parti revient.</h2>
      <div class="orn"><span></span><i></i><span></span></div>
      <p class="body">Dans les Weppes, les anciens disaient « au weppe » pour dire « au soir ». C'est l'heure où l'on rentre les bêtes et où l'on ferme les volets.</p>
      <p class="body">Le Dernier Train des Weppes est un jeu d'aventure en point &amp; click qui se joue directement dans le navigateur. Explorez la chambre de Gisèle à la résidence des Weppes, observez, fouillez, et reconstituez ce que la nuit de l'orage a réveillé.</p>
    </div>
    <div class="frame" style="position:relative;aspect-ratio:16/10"><img src="<?= e(asset('assets/img/chambre-gisele.png')) ?>" alt="La chambre de Gisèle"><div style="position:absolute;left:16px;bottom:14px;padding:8px 14px;background:rgba(10,14,24,.84);border:1px solid rgba(217,183,122,.35);border-radius:3px;font-size:13px;letter-spacing:.14em;text-transform:uppercase">Acte 1 · La chambre de Gisèle</div></div>
  </div>
  <div style="margin-top:clamp(56px,8vw,96px)"><div class="pillars"><div><div class="num">I</div><h3 class="h3">Un terroir réel</h3><p class="small">Fournes-en-Weppes, sa gare, ses moulins et son patois servent de décor et de matière au récit.</p></div><div><div class="num">II</div><h3 class="h3">Observer, cliquer, comprendre</h3><p class="small">Chaque objet de la pièce raconte quelque chose : une photo, une horloge arrêtée, une boîte en fer fermée à clé.</p></div><div><div class="num">III</div><h3 class="h3">Sans installation</h3><p class="small">Le jeu tourne dans le navigateur. Jouez sans compte, ou créez-en un pour reprendre votre partie sur n'importe quel appareil.</p></div></div></div>
</section>
<section style="padding-bottom:clamp(72px,10vw,120px)">
  <div class="wrap" style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;padding-bottom:28px"><div class="stack-s"><div class="eyebrow">Images du jeu</div><h2 class="h2">La nuit de l'orage</h2></div><div class="small">Touchez une image pour l'agrandir</div></div>
  <div class="wrap gallery">
    <?php foreach ($site['gallery'] as $shot): ?>
      <button type="button"><img src="<?= e(asset($shot['src'])) ?>" alt="<?= e($shot['alt']) ?>" loading="lazy"><span><?= e($shot['alt']) ?></span></button>
    <?php endforeach; ?>
  </div>
</section>
<section class="band" id="avancement"><div class="wrap sec" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:clamp(36px,6vw,80px)">
  <div class="stack"><div class="stack-s"><div class="eyebrow">Avancement</div><h2 class="h2">Le voyage est en cours</h2></div><p class="small" style="font-size:17px;line-height:1.7">Le jeu se construit étape par étape. Le prototype ouvrira d'abord aux inscrits de la liste d'attente.</p><a class="link" href="/avancement" style="border-bottom:1px solid rgba(217,183,122,.5);padding-bottom:4px;align-self:flex-start">Voir la feuille de route</a></div>
  <div class="steps">
    <?php foreach ($site['steps'] as $step): ?>
      <div class="step">
        <div class="dot<?= $step['status'] === 'next' ? '' : ' ' . $step['status'] ?>"></div>
        <div class="stack-s" style="gap:6px">
          <h3 class="h3" style="font-size:19px<?= $step['status'] === 'next' ? ';color:var(--text)' : '' ?>"><?= e($step['title']) ?></h3>
          <p class="small"<?= $step['status'] === 'next' ? ' style="color:var(--dim)"' : '' ?>><?= e($step['summary']) ?></p>
        </div>
        <div class="st<?= $step['status'] === 'next' ? '' : ' ' . $step['status'] ?>"><?= e($statusLabel[$step['status']]) ?></div>
      </div>
    <?php endforeach; ?>
  </div>
</div></section>
<section class="wrap sec" id="actualites">
  <div style="margin-bottom:36px"><div class="stack-s"><div class="eyebrow">Actualités</div><h2 class="h2">Carnet de développement</h2><a class="link" href="/actualites">Toutes les actualités →</a></div></div>
  <div class="grid">
    <?php foreach (array_slice($site['articles'], 0, 3) as $article): ?>
      <a class="card" href="/actualites/<?= e($article['slug']) ?>"><img src="<?= e(asset($article['image'])) ?>" alt="" loading="lazy"><div class="card-b"><div class="meta"><?= e($article['date_label']) ?> · <?= e($article['category']) ?></div><h3 class="h3"><?= e($article['title']) ?></h3><p class="small"><?= e($article['excerpt']) ?></p></div></a>
    <?php endforeach; ?>
  </div>
</section>
<section class="band" id="partenaires" style="border-bottom:0"><div class="wrap sec stack" style="gap:40px">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap"><div class="stack-s"><div class="eyebrow">Partenaires</div><h2 class="h2">Ils accompagnent le voyage</h2><p class="small" style="font-size:17px;max-width:620px">Collectivités, acteurs du patrimoine et entreprises des Weppes : rejoignez le projet et faites découvrir le territoire autrement.</p></div><a class="btn-ghost" href="/partenaires" style="font-size:13px">Devenir partenaire</a></div>
  <?php partial('logos', ['limit' => 4, 'placeholders' => 4]); ?>
</div></section>
<div class="lb" role="dialog" aria-label="Image agrandie"><img alt=""><div class="lb-bar"><button class="prev" type="button" aria-label="Précédente">←</button><span class="cap"></span><button class="next" type="button" aria-label="Suivante">→</button></div></div>
