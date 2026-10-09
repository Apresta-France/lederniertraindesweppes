const $ = s => document.querySelector(s);

const SHELL_SCREENS = [
  ['consent', "Écran d'accueil"],
  ['studio', 'Intro Groupe Tercium'],
  ['logo', 'Intro logo du jeu'],
  ['menu', 'Menu principal'],
];

// Panneau de débogage (touche ² ou `) : saut direct vers un écran ou une scène, zones cliquables.
export function installDebug(game) {
  const shell = game.shell;
  let flags = {};
  try { flags = JSON.parse(localStorage.getItem('ldtw_debug') || '{}'); } catch (e) { flags = {}; }
  const save = () => {
    try { localStorage.setItem('ldtw_debug', JSON.stringify(flags)); } catch (e) { /* stockage indisponible */ }
    Object.assign(game.debug, flags);
    game.emit('debug');
  };
  Object.assign(game.debug, flags);
  if (flags.skipIntro) shell.config.skipIntro = true;
  if (flags.fast) shell.config.introSpeed = 1 / 3;

  const scenes = game.data.game.scenes || [];
  const entries = [
    ...SHELL_SCREENS.map(([id, label]) => ({ kind: 'screen', id, label })),
    ...scenes.map(s => ({ kind: 'scene', id: s.id, label: s.label || s.id })),
  ];

  function jump(entry) {
    shell.clearTimers();
    shell.fading = false;
    $('#fade').classList.remove('on');
    game.scenes.clear();
    game.audio.music.stop(200);
    game.audio.unlock();
    if (entry.id !== 'consent') {
      shell.starting = true;
      if (game.settings.values.sound) shell.startAmbient();
      if (!/(^|; )ldtw_player=/.test(document.cookie) && game.settings.values.consent) shell.setCookie(true);
    }
    if (entry.kind === 'scene') {
      shell.show('game');
      game.scenes.goto(entry.id);
    } else {
      shell.show(entry.id);
      if (entry.id === 'studio') shell.studioTimeline();
      else if (entry.id === 'logo') shell.logoTimeline();
      else if (entry.id === 'menu') shell.menuIn();
    }
    el.classList.remove('open');
  }

  const el = document.createElement('div');
  el.id = 'dbg';
  el.innerHTML = `<button type="button" class="dbg-tab" title="Menu de débogage (touche ²)"><b>DEBUG</b><i id="dbg-cur"></i><span aria-hidden="true">▾</span></button>
    <div class="dbg-panel">
      <h4>Aller à</h4>
      ${entries.map((e, i) => `<button type="button" class="dbg-sc" data-entry="${i}">${String(i + 1).padStart(2, '0')} · ${e.label}</button>`).join('')}
      <hr><h4>Modes</h4>
      <label><input type="checkbox" data-mode="zones"> Zones cliquables et coordonnées</label>
      <label><input type="checkbox" data-mode="skipIntro"> Passer les intros au démarrage</label>
      <label><input type="checkbox" data-mode="fast"> Intros accélérées (×3)</label>
      <label><input type="checkbox" data-mode="mute"> Couper le son</label>
      <hr><h4>Données</h4>
      <div class="dbg-row"><button type="button" data-act="saves">Effacer sauvegardes</button><button type="button" data-act="all">Tout réinitialiser</button></div>
      <div class="dbg-hint">Touche ² ou \` pour ouvrir / fermer · ?nodebug pour masquer · ?scene=id pour lancer une scène</div>
    </div>`;
  document.body.appendChild(el);

  const current = () => {
    if (shell.ui.screen !== 'game') return entries.find(e => e.kind === 'screen' && e.id === shell.ui.screen);
    return entries.find(e => e.kind === 'scene' && e.id === game.scenes.current?.id);
  };
  const sync = () => {
    el.querySelectorAll('[data-mode]').forEach(c => { c.checked = c.dataset.mode === 'mute' ? !game.settings.values.sound : !!flags[c.dataset.mode]; });
    const cur = current();
    el.querySelectorAll('.dbg-sc').forEach(b => b.classList.toggle('dbg-on', entries[+b.dataset.entry] === cur));
    $('#dbg-cur').textContent = cur?.label || '';
  };

  el.querySelector('.dbg-tab').addEventListener('click', e => { e.stopPropagation(); el.classList.toggle('open'); sync(); });
  el.addEventListener('click', e => {
    e.stopPropagation();
    const sc = e.target.closest('[data-entry]');
    if (sc) { jump(entries[+sc.dataset.entry]); setTimeout(sync, 50); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'all') {
      ['ldtw_settings', 'ldtw_saves', 'ldtw_account', 'ldtw_known_account', 'ldtw_waitlist'].forEach(k => { try { localStorage.removeItem(k); } catch (x) { /* rien */ } });
      document.cookie = 'ldtw_player=; max-age=0; path=/';
      location.reload();
      return;
    }
    game.saves.clear();
    shell.render();
    act.textContent = 'Effacé ✓';
    setTimeout(() => { act.textContent = 'Effacer sauvegardes'; }, 1200);
  });
  el.addEventListener('change', e => {
    const m = e.target.dataset.mode;
    if (!m) return;
    if (m === 'mute') { if (e.target.checked === game.settings.values.sound) shell.toggle('sound'); return; }
    flags[m] = e.target.checked;
    if (m === 'skipIntro') shell.config.skipIntro = flags.skipIntro;
    if (m === 'fast') shell.config.introSpeed = flags.fast ? 1 / 3 : 1;
    save();
  });
  el.addEventListener('keydown', e => e.stopPropagation());
  document.addEventListener('click', () => el.classList.remove('open'));
  window.addEventListener('keydown', e => {
    if (e.key === '²' || e.key === '`') { e.preventDefault(); el.classList.toggle('open'); sync(); }
  }, true);
  game.on('scene', sync);
  setInterval(() => { if (!el.classList.contains('open')) sync(); }, 800);
  sync();
}
