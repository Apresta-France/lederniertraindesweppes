import { h, listen } from './dom.js';
import { AUDIO_RE, assetUrl, fileName } from './paths.js';

const ROLE_LABEL = {
  voix: 'Voix',
  bruitage: 'Bruitage',
  etat: 'Son d’état',
  musique: 'Musique',
};

const PLAYED_ROLES = new Set(['voix', 'bruitage', 'etat']);

function isObj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function byName(a, b) {
  return fileName(a.path).localeCompare(fileName(b.path), 'fr', { sensitivity: 'base' })
    || a.path.localeCompare(b.path, 'fr');
}

/**
 * Audio files referenced by a scene, with where they play and any subtitle already
 * written on an action. `pools` are random character lines, edited in character.json.
 */
export function collectSounds(scene) {
  const map = new Map();
  const pools = [];
  if (!isObj(scene)) return { sounds: [], pools };

  const add = (path, role, where, extra = {}) => {
    if (typeof path !== 'string' || !AUDIO_RE.test(path)) return;
    let item = map.get(path);
    if (!item) {
      item = { path, roles: [], usages: [], subtitles: [], hints: [] };
      map.set(path, item);
    }
    if (role && !item.roles.includes(role)) item.roles.push(role);
    if (where && !item.usages.includes(where)) item.usages.push(where);
    const subtitle = typeof extra.subtitle === 'string' ? extra.subtitle.trim() : '';
    if (subtitle && !item.subtitles.includes(subtitle)) item.subtitles.push(subtitle);
    for (const hint of extra.hints || []) {
      if (hint && !item.hints.includes(hint)) item.hints.push(hint);
    }
  };

  const walkActions = (list, where) => {
    if (!Array.isArray(list)) return;
    const clips = [];
    const says = [];
    for (const action of list) {
      if (!isObj(action)) continue;
      if ((action.do === 'voice' || action.do === 'sfx') && typeof action.src === 'string') clips.push(action);
      if (action.do === 'say' && typeof action.text === 'string' && action.text.trim()) says.push(action.text.trim());
      if (action.do === 'voice' && action.pool && !action.src) {
        const key = `${action.character || '?'} · ${action.pool}`;
        if (!pools.includes(key)) pools.push(key);
      }
      if (action.do === 'if') {
        walkActions(action.then, where);
        walkActions(action.else, where);
      }
    }
    const hints = clips.length === 1 ? says : [];
    for (const action of clips) {
      add(action.src, action.do === 'voice' ? 'voix' : 'bruitage', where, { subtitle: action.subtitle, hints });
    }
  };

  if (scene.music?.src) add(scene.music.src, 'musique', 'Musique de la scène');
  walkActions(scene.onEnter, 'À l’entrée');

  for (const object of Array.isArray(scene.objects) ? scene.objects : []) {
    if (!isObj(object)) continue;
    const label = object.name || object.id || 'objet';
    walkActions(object.onUse, label);
    if (!isObj(object.states)) continue;
    for (const [name, state] of Object.entries(object.states)) {
      if (state?.sound?.src) add(state.sound.src, 'etat', `${label} · état « ${name} »`);
      walkActions(state?.sound?.onEnded, `${label} · état « ${name} »`);
    }
  }

  for (const [id, panel] of Object.entries(isObj(scene.panels) ? scene.panels : {})) {
    for (const action of Array.isArray(panel?.actions) ? panel.actions : []) {
      walkActions(action?.do, `Fiche « ${id} »`);
    }
  }

  for (const item of Array.isArray(scene.timeline) ? scene.timeline : []) {
    if (isObj(item) && item.do === 'music' && item.src) add(item.src, 'musique', 'Musique de la cinématique');
  }

  return { sounds: [...map.values()].sort(byName), pools };
}

export function soundNeedsLegend(scene, sound) {
  if (!sound.roles.some((role) => PLAYED_ROLES.has(role))) return false;
  if (sound.subtitles.length || sound.hints.length) return false;
  const caption = scene?.sounds?.[sound.path]?.caption;
  return !(typeof caption === 'string' && caption.trim());
}

function tabDomId(path) {
  return `sound-tab-${path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

/** "Sons" tab: one sub-tab per audio file, with a player, the transcript and the caption. */
export class SoundsTab {
  constructor({ store, container, library }) {
    this.store = store;
    this.container = container;
    this.library = library;
    this.assetPaths = [];
    this.selected = null;
    this.visible = false;
    this.builtFor = null;
    this.panePath = null;
    this.shell = null;
    listen(store, 'load', () => this.onLoad());
    listen(store, 'change', (event) => this.onChange(event));
    listen(store, 'readonly', () => this.syncFields());
    listen(library, 'change', (event) => {
      if (event.detail.sceneId === store.id) this.refreshAssets();
    });
    this.render();
  }

  onLoad() {
    this.selected = null;
    this.builtFor = null;
    this.assetPaths = [];
    this.panePath = null;
    this.pause();
    this.render();
    this.refreshAssets();
  }

  onChange(event) {
    if (!this.store.scene || !this.shell) {
      this.render();
      return;
    }
    if (event.detail.source === 'sounds') {
      this.renderTabs();
      this.syncNote();
      return;
    }
    this.panePath = null;
    this.render();
  }

  show() {
    this.visible = true;
    this.syncAudio();
  }

  hide() {
    this.visible = false;
    this.pause();
  }

  select(path) {
    if (this.filter) this.filter.value = '';
    this.selected = path;
    this.render();
    this.focusTab(path);
  }

  pause() {
    this.audio?.pause();
  }

  async refreshAssets() {
    const id = this.store.id;
    if (!id) return;
    try {
      const assets = await this.library.load(id);
      if (this.store.id !== id) return;
      this.assetPaths = assets.scene.filter((item) => item.type === 'audio').map((item) => item.path);
    } catch {
      if (this.store.id !== id) return;
      this.assetPaths = [];
    }
    this.render();
  }

  listing() {
    const { sounds, pools } = collectSounds(this.store.scene);
    for (const path of this.assetPaths) {
      if (!sounds.some((sound) => sound.path === path)) {
        sounds.push({ path, roles: [], usages: [], subtitles: [], hints: [] });
      }
    }
    sounds.sort(byName);
    return { sounds, pools };
  }

  render() {
    const scene = this.store.scene;
    if (!scene) {
      this.shell = null;
      this.builtFor = null;
      this.container.replaceChildren(h('p', { class: 'empty' }, 'Choisissez une scène dans la liste.'));
      return;
    }
    this.ensureShell();
    const { sounds } = this.listing();
    if (this.selected && !sounds.some((sound) => sound.path === this.selected)) this.selected = null;
    if (!this.selected) this.selected = sounds[0]?.path ?? null;
    this.renderTabs();
    this.renderPane();
  }

  ensureShell() {
    if (this.builtFor === this.store.id && this.shell?.isConnected) return;
    this.builtFor = this.store.id;
    this.panePath = null;
    this.filter = h('input', {
      type: 'search',
      class: 'sound-filter',
      placeholder: 'Filtrer…',
      'aria-label': 'Filtrer les sons',
      oninput: () => this.renderTabs(),
    });
    this.count = h('p', { class: 'help sound-count' });
    this.tablist = h('div', { class: 'sound-tabs', role: 'tablist', 'aria-label': 'Sons de la scène', 'aria-orientation': 'vertical' });
    this.poolsNote = h('p', { class: 'help sound-pools' });
    this.pane = h('div', { class: 'sound-pane', id: 'sound-pane', role: 'tabpanel', tabindex: '0' });
    this.audio = h('audio', { controls: true, preload: 'metadata' });
    this.audio.addEventListener('error', () => {
      if (this.audioError) this.audioError.hidden = !this.audio.getAttribute('src');
    });
    this.tablist.addEventListener('keydown', (event) => this.onTabKey(event));
    this.shell = h('div', { class: 'sounds' },
      h('div', { class: 'sound-rail' },
        h('div', { class: 'sound-rail-head' }, this.filter, this.count),
        this.tablist,
        this.poolsNote),
      this.pane);
    this.container.replaceChildren(this.shell);
  }

  onTabKey(event) {
    const tabs = [...this.tablist.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    let next = null;
    if (event.key === 'ArrowDown') next = tabs[index + 1] || tabs[0];
    else if (event.key === 'ArrowUp') next = tabs[index - 1] || tabs[tabs.length - 1];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    event.preventDefault();
    this.selected = next.dataset.path;
    this.render();
    this.focusTab(this.selected);
  }

  focusTab(path) {
    [...this.tablist?.querySelectorAll('[role="tab"]') || []].find((tab) => tab.dataset.path === path)?.focus();
  }

  renderTabs() {
    const scene = this.store.scene;
    const { sounds, pools } = this.listing();
    const needle = (this.filter?.value || '').trim().toLowerCase();
    const visible = sounds.filter((sound) => !needle
      || sound.path.toLowerCase().includes(needle)
      || sound.path === this.selected);
    const missing = sounds.filter((sound) => soundNeedsLegend(scene, sound)).length;
    this.count.textContent = sounds.length
      ? `${sounds.length} son${sounds.length > 1 ? 's' : ''}${missing ? ` · ${missing} légende${missing > 1 ? 's' : ''} manquante${missing > 1 ? 's' : ''}` : ''}`
      : 'Aucun son';
    this.poolsNote.textContent = pools.length
      ? `Répliques tirées au sort (${pools.join(', ')}) : leur sous-titre se rédige dans character.json.`
      : '';
    this.tablist.replaceChildren(...(visible.length
      ? visible.map((sound) => this.tabButton(scene, sound))
      : [h('p', { class: 'empty' }, needle ? 'Aucun son ne correspond.' : 'Aucun fichier audio dans cette scène.')]));
    if (this.pane) this.pane.setAttribute('aria-labelledby', this.selected ? tabDomId(this.selected) : '');
  }

  tabButton(scene, sound) {
    const selected = sound.path === this.selected;
    const missing = soundNeedsLegend(scene, sound);
    const roles = sound.roles.map((role) => ROLE_LABEL[role] || role);
    const meta = missing ? 'Légende manquante' : (roles.join(' · ') || 'Pas encore utilisé');
    return h('button', {
      type: 'button',
      role: 'tab',
      id: tabDomId(sound.path),
      class: `sound-tab${missing ? ' is-missing' : ''}`,
      'data-path': sound.path,
      'aria-selected': String(selected),
      'aria-controls': 'sound-pane',
      tabindex: selected ? '0' : '-1',
      title: sound.path,
      onclick: () => {
        if (this.selected === sound.path) return;
        this.selected = sound.path;
        this.render();
      },
    },
    h('span', { class: 'sound-tab-name' }, fileName(sound.path)),
    h('span', { class: 'sound-tab-meta' }, meta));
  }

  renderPane() {
    if (this.panePath === this.selected && this.textInput?.isConnected) {
      this.syncFields();
      this.syncAudio();
      return;
    }
    this.panePath = this.selected;
    const sound = this.listing().sounds.find((item) => item.path === this.selected);
    if (!sound) {
      this.textInput = null;
      this.captionInput = null;
      this.pane.replaceChildren(h('p', { class: 'empty' }, 'Déposez un fichier audio dans assets/, ou référencez-en un dans la scène.'));
      return;
    }
    const described = sound.roles.some((role) => PLAYED_ROLES.has(role));
    this.audioError = h('p', { class: 'field-error', hidden: true }, 'Fichier introuvable.');
    this.textInput = h('textarea', { id: 'sound-text', rows: 5, placeholder: 'Ce qui est dit, ou ce que l’on entend…' });
    this.captionInput = h('textarea', { id: 'sound-caption', rows: 4, placeholder: 'Texte affiché pendant le son…' });
    this.note = h('p', { class: 'help' });
    this.textInput.addEventListener('input', () => this.commit('text', this.textInput.value));
    this.captionInput.addEventListener('input', () => this.commit('caption', this.captionInput.value));
    const quotes = sound.hints.slice(0, 3).map((hint) => h('blockquote', { class: 'sound-quote' }, hint));
    const usage = sound.usages.length
      ? h('ul', { class: 'sound-usage' }, sound.usages.map((where) => h('li', null, where)))
      : h('p', { class: 'help' }, 'Ce fichier est dans assets/ et n’est pas encore joué par la scène.');
    this.pane.replaceChildren(...[
      h('h2', { class: 'sound-title' }, fileName(sound.path)),
      h('p', { class: 'mono sound-path' }, sound.path),
      usage,
      sound.usages.length > 1 ? h('p', { class: 'help' }, 'La légende est la même partout où ce fichier est joué.') : null,
      sound.subtitles.length ? h('p', { class: 'help' }, `Une action a déjà un sous-titre, affiché à la place de la légende : « ${sound.subtitles[0]} »`) : null,
      quotes.length ? h('div', null, h('p', { class: 'sound-kicker' }, 'Texte déjà dit à côté de ce son'), ...quotes) : null,
      h('p', { class: 'sound-kicker' }, 'Écouter'),
      this.audio,
      this.audioError,
      h('div', { class: 'field' },
        h('label', { for: 'sound-text' }, 'Texte'),
        this.textInput,
        h('p', { class: 'help' }, 'Transcription de l’enregistrement. Elle n’est pas affichée : elle sert à écrire et à relire ce qui est entendu.')),
      h('div', { class: 'field' },
        h('label', { for: 'sound-caption' }, 'Légende'),
        this.captionInput,
        h('p', { class: 'help' }, described
          ? 'Affichée en bas de l’écran pendant le son, pour les personnes malentendantes. Le nom du personnage s’ajoute quand la voix le nomme.'
          : 'Note de travail. La musique de fond n’affiche pas de légende en jeu.')),
      this.note,
    ].filter(Boolean));
    this.audio.setAttribute('aria-label', `Écouter ${fileName(sound.path)}`);
    this.syncFields();
    this.syncAudio();
  }

  syncFields() {
    if (!this.textInput || !this.captionInput || this.panePath !== this.selected) return;
    const entry = this.store.scene?.sounds?.[this.selected];
    const text = typeof entry?.text === 'string' ? entry.text : '';
    const caption = typeof entry?.caption === 'string' ? entry.caption : '';
    if (document.activeElement !== this.textInput) this.textInput.value = text;
    if (document.activeElement !== this.captionInput) this.captionInput.value = caption;
    const locked = this.store.readOnly;
    this.textInput.readOnly = locked;
    this.captionInput.readOnly = locked;
    this.syncNote();
  }

  syncNote() {
    if (!this.note || this.panePath !== this.selected) return;
    const entry = this.store.scene?.sounds?.[this.selected];
    const caption = typeof entry?.caption === 'string' ? entry.caption.trim() : '';
    const sound = this.listing().sounds.find((item) => item.path === this.selected);
    const described = sound?.roles.some((role) => PLAYED_ROLES.has(role));
    if (!described) this.note.textContent = '';
    else if (caption) this.note.textContent = '';
    else if (sound?.subtitles.length) this.note.textContent = 'Le sous-titre de l’action sera affiché. La légende ci-dessus sert là où l’action n’en a pas.';
    else if (sound?.hints.length) this.note.textContent = 'Un texte est déjà affiché à côté de ce son. Ajoutez une légende si l’enregistrement dit autre chose : elle apparaît en bas de l’écran.';
    else this.note.textContent = 'Rien ne s’affichera pendant ce son pour une personne qui ne l’entend pas.';
  }

  syncAudio() {
    if (!this.audio) return;
    const path = this.visible ? this.selected : '';
    if (this.audio.dataset.path === (path || '')) return;
    this.pause();
    this.audio.dataset.path = path || '';
    if (!path) {
      this.audio.removeAttribute('src');
      return;
    }
    if (this.audioError) this.audioError.hidden = true;
    this.audio.src = assetUrl(this.store.id, path);
  }

  commit(field, value) {
    const path = this.selected;
    if (!path) return;
    this.store.update((scene) => {
      if (!isObj(scene.sounds)) scene.sounds = {};
      if (!isObj(scene.sounds[path])) scene.sounds[path] = {};
      const entry = scene.sounds[path];
      if (value.trim()) entry[field] = value;
      else delete entry[field];
      if (!entry.text && !entry.caption) delete scene.sounds[path];
      if (!Object.keys(scene.sounds).length) delete scene.sounds;
    }, { key: `sound:${path}:${field}`, source: 'sounds' });
  }
}
