import { Emitter } from './core/events.js';
import { GameState } from './core/state.js';
import { Saves } from './core/saves.js';
import { loadGameData } from './core/loader.js';
import { SceneManager } from './core/scene-manager.js';
import { AudioManager } from './audio/audio.js';
import { Announcer } from './ui/announcer.js';
import { Settings } from './shell/settings.js';
import { Shell } from './shell/shell.js';
import { installDebug } from './shell/debug.js';
import { installEmbed } from './shell/embed.js';

const $ = s => document.querySelector(s);

async function boot() {
  const body = document.body;
  const params = new URLSearchParams(location.search);
  const embed = params.get('embed') === '1' && window.parent !== window;
  const game = Object.assign(new Emitter(), {
    config: { debug: body.dataset.debug === 'on' && !params.has('nodebug') && !embed, shell: {} },
    debug: {},
    embed,
    previewId: params.get('preview') === '1' ? params.get('scene') : null,
  });

  game.settings = new Settings({ persist: !embed });
  if (embed) game.settings.values.sound = false;
  game.audio = new AudioManager(game.settings);
  game.state = new GameState();
  game.saves = new Saves();
  game.announcer = new Announcer($('#sr-status'), $('#sr-alert'));
  game.data = await loadGameData();
  game.scenes = new SceneManager(game, $('#stage'));

  // Sauvegarde immédiate ; crée un emplacement si la partie n'en a pas encore (lancement direct).
  let saveTimer = 0;
  game.save = () => {
    clearTimeout(saveTimer);
    if (!game.settings.values.consent || embed) return false;
    const scene = game.scenes.current;
    const meta = { chapter: scene?.data.meta?.chapter, place: scene?.data.title };
    if (game.saves.current) game.saves.update(game.state.snapshot(), meta);
    else {
      const account = game.shell?.account;
      game.saves.create({ mode: account ? 'account' : 'local', email: account?.email, ...meta, data: game.state.snapshot() });
    }
    return true;
  };
  game.autosave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (game.saves.current) game.save(); }, 300);
  };
  game.state.on('change', () => game.autosave());

  const app = $('#app');
  const applySettings = () => {
    const s = game.settings.values;
    app.style.setProperty('--text-scale', s.textScale);
    app.classList.toggle('reduce-motion', !!s.reduceMotion);
  };
  game.settings.on('change', applySettings);
  applySettings();

  window.ldtw = game;
  if (embed) {
    installEmbed(game);
    return;
  }
  game.shell = new Shell(game);
  if (game.config.debug) installDebug(game);

  const direct = params.get('scene');
  if (direct) startDirect(game, direct);
}

// Lancement direct d'une scène (?scene=id), utilisé par l'éditeur pour tester.
// Un clic est nécessaire avant de démarrer : les navigateurs bloquent le son sans geste du joueur.
function startDirect(game, id) {
  const label = game.data.game.scenes?.find(s => s.id === id)?.label || id;
  const gate = document.createElement('button');
  gate.type = 'button';
  gate.className = 'preview-gate';
  gate.innerHTML = `<span class="k">${game.previewId ? 'Aperçu du brouillon' : 'Lancement direct'}</span><span class="t"></span><span class="h">Cliquer ou appuyer sur Entrée pour démarrer</span>`;
  gate.querySelector('.t').textContent = label;
  document.body.appendChild(gate);
  gate.focus();
  gate.addEventListener('click', () => {
    gate.remove();
    game.audio.unlock();
    game.shell.starting = true;
    game.shell.show('game');
    game.scenes.goto(id);
  }, { once: true });
}

boot().catch(err => {
  console.error(err);
  const msg = document.createElement('div');
  msg.className = 'boot-error';
  msg.setAttribute('role', 'alert');
  msg.textContent = `Le jeu n'a pas pu démarrer : ${err.message}`;
  document.body.appendChild(msg);
});
