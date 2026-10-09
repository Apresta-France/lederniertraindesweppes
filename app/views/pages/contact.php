<?php $sent = $okNom !== null; ?>
<section class="wrap" style="padding-top:clamp(56px,8vw,100px);padding-bottom:clamp(72px,10vw,120px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:clamp(40px,6vw,80px);align-items:start">
  <div class="stack"><div class="eyebrow rise d1">Contact</div><h1 class="h1 rise d2" style="font-size:clamp(32px,4.6vw,56px)">Écrivez-nous</h1><p class="body rise d3">Presse, partenariat, souvenirs de la gare de Fournes ou simple question : nous lisons tous les messages.</p>
    <div class="stack" style="gap:16px;margin-top:10px;padding-top:24px;border-top:1px solid var(--line)">
      <div class="stack-s" style="gap:4px"><div class="meta">Studio</div><div style="font-size:17px">Groupe Tercium</div></div>
      <div class="stack-s" style="gap:4px"><div class="meta">Site</div><a href="https://tercium.fr" target="_blank" rel="noopener" style="font-size:17px;color:var(--cream)">tercium.fr</a></div>
      <div class="stack-s" style="gap:4px"><div class="meta">Presse</div><div style="font-size:16px;color:var(--text)">Visuels et dossier de presse sur demande, via ce formulaire.</div></div>
    </div></div>
  <div style="padding:clamp(22px,3vw,36px);border:1px solid rgba(217,183,122,.3);border-radius:4px;background:var(--bg2)">
    <form id="contact-form" class="stack" style="gap:18px" method="post" action="/contact" novalidate<?= $sent ? ' hidden' : '' ?>>
      <?= csrf_field() ?>
      <?= honeypot_field() ?>
      <input type="hidden" name="redirect" value="<?= e(return_path()) ?>">
      <label class="field">Nom<input name="nom" autocomplete="name" maxlength="120" value="<?= e($oldNom) ?>"></label>
      <label class="field">E-mail<input type="email" name="email" autocomplete="email" maxlength="180" value="<?= e($oldEmail) ?>"></label>
      <div class="field">Sujet<input type="hidden" name="sujet" value="<?= e($sujet) ?>"><div style="display:flex;flex-wrap:wrap;gap:8px"><?php foreach ($subjects as $subject): ?><button type="button" class="pill<?= $subject === $sujet ? ' on' : '' ?>" data-v="<?= e($subject) ?>"><?= e($subject) ?></button><?php endforeach; ?></div></div>
      <label class="field">Message<textarea name="message" rows="6" maxlength="5000"><?= e($oldMessage) ?></textarea></label>
      <div class="err"><?= e($error ?? '') ?></div>
      <button class="btn" type="submit">Envoyer</button>
    </form>
    <div id="contact-ok" class="stack" style="align-items:center;gap:14px;padding:40px 10px;text-align:center"<?= $sent ? '' : ' hidden' ?>>
      <div class="orn" style="width:160px"><span></span><i></i><span></span></div>
      <div style="font-family:'Cinzel',serif;font-weight:600;font-size:24px">Message envoyé</div>
      <div style="font-size:16px;line-height:1.6;color:var(--text)">Merci <span data-nom><?= e($okNom ?? '') ?></span>. Nous vous répondrons à <span data-email><?= e($okEmail ?? '') ?></span>.</div>
    </div>
  </div>
</section>
