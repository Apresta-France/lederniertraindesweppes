<header class="hd">
  <a class="brand" href="/"><b><?= e(app_name()) ?></b><small>Groupe Tercium</small></a>
  <nav class="nav" aria-label="Navigation principale">
    <a href="/le-jeu"<?= $current === 'le-jeu' ? ' aria-current="page"' : '' ?>>Le jeu</a>
    <a href="/avancement"<?= $current === 'avancement' ? ' aria-current="page"' : '' ?>>Avancement</a>
    <a href="/actualites"<?= $current === 'actualites' ? ' aria-current="page"' : '' ?>>Actualités</a>
    <a href="/partenaires"<?= $current === 'partenaires' ? ' aria-current="page"' : '' ?>>Partenaires</a>
    <a href="/contact"<?= $current === 'contact' ? ' aria-current="page"' : '' ?>>Contact</a>
    <a class="cta" href="#waitlist">Liste d'attente</a>
  </nav>
  <div class="hd-m"><a class="cta" href="#waitlist">Liste d'attente</a><button class="burger" type="button" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button></div>
  <nav class="drawer" aria-label="Navigation mobile">
    <a href="/le-jeu"<?= $current === 'le-jeu' ? ' aria-current="page"' : '' ?>>Le jeu</a>
    <a href="/avancement"<?= $current === 'avancement' ? ' aria-current="page"' : '' ?>>Avancement</a>
    <a href="/actualites"<?= $current === 'actualites' ? ' aria-current="page"' : '' ?>>Actualités</a>
    <a href="/partenaires"<?= $current === 'partenaires' ? ' aria-current="page"' : '' ?>>Partenaires</a>
    <a href="/contact"<?= $current === 'contact' ? ' aria-current="page"' : '' ?>>Contact</a>
  </nav>
</header>
