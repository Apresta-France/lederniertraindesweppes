import { h, uid, slugify } from './dom.js';
import { characterUrl, fileName, formatBytes } from './paths.js';
import { choiceDialog, confirmDialog, openDialog, toast } from './ui.js';
import { createJsonField } from './json-field.js';
import { sliceSheetDialog } from './sprite-sheet.js';
import { CharacterSprite } from '../../engine/ui/character.js';

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY_RE = /^[\p{L}\p{N}_-]{1,40}$/u;
const ACCEPT = { sprites: '.png,.jpg,.jpeg,.webp,.gif,image/*', voice: '.mp3,.ogg,.wav,.m4a,audio/*' };

// Order of the frames the engine cycles through while talking (engine/ui/character.js).
const SLOTS = [
  { label: 'Repos', help: 'Bouche fermée, yeux ouverts : l’image affichée la plupart du temps.' },
  { label: 'Bouche mi-ouverte', help: 'Syllabes faibles.' },
  { label: 'Bouche ouverte', help: 'Syllabes fortes.' },
  { label: 'Yeux fermés', help: 'Clignement, environ 0,13 s de temps en temps.' },
];

function isObj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function slotGet(sprites, index) {
  if (!isObj(sprites)) return '';
  const value = index === 0 ? sprites.idle : index === 3 ? sprites.blink : (Array.isArray(sprites.talk) ? sprites.talk[index - 1] : '');
  return typeof value === 'string' ? value : '';
}

function slotSet(character, index, path) {
  if (!isObj(character.sprites)) character.sprites = {};
  const sprites = character.sprites;
  if (index === 0 || index === 3) {
    const key = index === 0 ? 'idle' : 'blink';
    if (path) sprites[key] = path;
    else delete sprites[key];
    return;
  }
  const talk = Array.isArray(sprites.talk) ? [...sprites.talk] : [];
  talk[index - 1] = path || '';
  for (let i = 0; i < talk.length; i++) if (typeof talk[i] !== 'string') talk[i] = '';
  while (talk.length && !talk[talk.length - 1]) talk.pop();
  if (talk.length) sprites.talk = talk;
  else delete sprites.talk;
}

function renameKey(object, from, to) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key === from ? to : key, value]));
}

function freeKey(object, base) {
  let key = base;
  for (let n = 2; isObj(object) && key in object; n++) key = `${base}-${n}`;
  return key;
}

function referencedPaths(character) {
  const paths = new Set();
  for (let i = 0; i < SLOTS.length; i++) {
    const path = slotGet(character.sprites, i);
    if (path) paths.add(path);
  }
  for (const animation of Object.values(isObj(character.animations) ? character.animations : {})) {
    for (const frame of Array.isArray(animation?.frames) ? animation.frames : []) if (typeof frame === 'string' && frame) paths.add(frame);
  }
  for (const pool of Object.values(isObj(character.voice) ? character.voice : {})) {
    for (const line of Array.isArray(pool) ? pool : []) if (typeof line?.src === 'string' && line.src) paths.add(line.src);
  }
  return paths;
}

function sizeOf(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Fills `el` with a warning when the images do not all share the same pixel size.
async function checkSizes(urls, el) {
  el.hidden = true;
  const sizes = await Promise.all(urls.map(sizeOf));
  const known = sizes.filter(Boolean);
  const distinct = [...new Set(known.map(([w, hh]) => `${w} × ${hh}`))];
  if (distinct.length > 1) {
    el.textContent = `Les images n’ont pas toutes la même taille (${distinct.join(', ')}) : le personnage risque de sauter ou de se déformer d’une image à l’autre.`;
    el.hidden = false;
  }
}

// The input lives inside the open modal: elements outside it are inert.
function pickFiles(host, accept, multiple) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, hidden: true });
    input.addEventListener('change', () => {
      resolve([...(input.files || [])]);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    host.append(input);
    input.click();
  });
}

function card(title, ...children) {
  return h('section', { class: 'chared-card' }, title ? h('h3', null, title) : null, ...children);
}

/** Full-screen window to check and edit shared/characters/<id>/character.json and its files. */
export class CharacterEditor {
  constructor({ api, getGame, onChange }) {
    this.api = api;
    this.getGame = getGame;
    this.onChange = onChange;
    this.dialog = null;
    this.list = [];
    this.current = null;
    this.bust = Date.now();
    this.players = [];
    this.voice = null;
    this.freeze = -1;
    this.audioCtx = null;
  }

  get dirty() {
    return Boolean(this.current?.data) && JSON.stringify(this.current.data) !== this.current.savedJson;
  }

  url(path) {
    return path ? `${characterUrl(this.current.id, path)}?v=${this.bust}` : '';
  }

  // ---- Window ----

  async open(id = null) {
    if (!this.dialog) this.build();
    if (!this.dialog.open) {
      this.dialog.showModal();
      const toasts = document.getElementById('toasts');
      if (toasts) this.dialog.append(toasts);
    }
    this.startLoop();
    await this.loadList();
    const target = id && this.list.some((c) => c.id === id) ? id : (this.current?.id || this.list.find((c) => !c.missing)?.id);
    if (target && target !== this.current?.id) await this.select(target);
    else if (!target) this.renderMain();
  }

  build() {
    const titleId = uid('chared');
    this.status = h('span', { class: 'save-status', role: 'status', 'aria-live': 'polite' });
    this.saveButton = h('button', { type: 'button', class: 'btn btn-gold', disabled: true, title: 'Enregistrer (Ctrl+S)', onclick: () => this.save() }, 'Enregistrer');
    this.revertButton = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => this.revert() }, 'Annuler mes modifications');
    this.listEl = h('ul', { class: 'chared-list' });
    this.main = h('div', { class: 'chared-main', tabindex: '-1' });
    this.dialog = h('dialog', { class: 'chared', 'aria-labelledby': titleId },
      h('header', { class: 'chared-head' },
        h('h2', { id: titleId }, 'Personnages'),
        this.status,
        h('span', { class: 'chared-head-actions' },
          this.revertButton,
          this.saveButton,
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => this.close() }, 'Fermer'))),
      h('div', { class: 'chared-body' },
        h('nav', { class: 'chared-rail', 'aria-label': 'Liste des personnages' },
          h('div', { class: 'sidebar-head' },
            h('h2', null, 'Personnages'),
            h('button', { type: 'button', class: 'btn btn-small', onclick: () => this.create() }, 'Nouveau')),
          this.listEl),
        this.main));
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (document.querySelector('dialog.modal[open]')) return;
      this.close();
    });
    this.dialog.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();
        this.save();
      }
    });
    document.body.append(this.dialog);
  }

  async close() {
    if (this.dirty && !(await this.confirmDiscard())) return;
    this.stopVoice();
    cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.current && this.dirty) this.revert();
    const toasts = document.getElementById('toasts');
    if (toasts) document.body.append(toasts);
    this.dialog.close();
  }

  confirmDiscard() {
    return confirmDialog(`Les modifications de « ${this.current.data?.name || this.current.id} » ne sont pas enregistrées. Les abandonner ?`, {
      title: 'Modifications non enregistrées',
      confirmLabel: 'Abandonner mes modifications',
      danger: true,
    });
  }

  startLoop() {
    if (this.raf) return;
    const tick = (now) => {
      if (this.voice && !this.voice.fake && !this.voice.playing()) {
        this.voice = null;
        this.syncVoiceUi();
      }
      if (this.sprite?.el.isConnected && this.freeze < 0) this.sprite.update(now, this.voice);
      for (const player of this.players) player.tick(now);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // ---- List ----

  async loadList() {
    try {
      this.list = (await this.api.characters()).characters;
    } catch (error) {
      toast(`Liste des personnages indisponible : ${error.message}`, 'error', 8000);
    }
    this.renderList();
  }

  renderList() {
    this.listEl.replaceChildren(...(this.list.length ? this.list.map((c) => {
      const thumb = c.idle && !c.missing
        ? h('img', { src: `${characterUrl(c.id, c.idle)}?v=${this.bust}`, alt: '', loading: 'lazy' })
        : h('span', { class: 'chared-thumb-empty' }, '?');
      return h('li', null, h('button', {
        type: 'button',
        class: `chared-item${c.id === this.current?.id ? ' is-current' : ''}`,
        'aria-current': c.id === this.current?.id ? 'true' : null,
        disabled: c.missing,
        onclick: () => this.select(c.id),
      },
      h('span', { class: 'chared-thumb' }, thumb),
      h('span', { class: 'chared-item-text' },
        h('span', { class: 'scene-title' }, c.name),
        h('span', { class: 'scene-id' }, c.id),
        h('span', { class: 'scene-badges' },
          c.missing ? h('span', { class: 'chip chip-warn' }, 'Dossier introuvable') : null,
          c.invalid ? h('span', { class: 'chip chip-warn' }, 'JSON illisible') : null,
          !c.declared ? h('span', { class: 'chip chip-warn' }, 'Non déclaré') : null))));
    }) : [h('li', { class: 'empty' }, 'Aucun personnage.')]));
  }

  async select(id) {
    if (id === this.current?.id) return;
    if (this.dirty && !(await this.confirmDiscard())) return;
    this.stopVoice();
    let data;
    try {
      data = await this.api.character(id);
    } catch (error) {
      toast(`Impossible d’ouvrir « ${id} » : ${error.message}`, 'error', 8000);
      return;
    }
    this.current = {
      id,
      data: isObj(data.character) ? data.character : { id, name: id },
      rev: data.rev,
      savedJson: JSON.stringify(data.character),
      files: data.files || [],
      declared: data.declared,
    };
    this.freeze = -1;
    this.renderList();
    this.renderMain(true);
    this.updateStatus();
  }

  async create() {
    if (this.dirty && !(await this.confirmDiscard())) return;
    const nameId = uid('cname');
    const idId = uid('cid');
    const name = h('input', { id: nameId, type: 'text', required: true, autocomplete: 'off', placeholder: 'Aurélie' });
    const ident = h('input', { id: idId, type: 'text', class: 'mono', required: true, autocomplete: 'off', placeholder: 'aurelie' });
    const error = h('p', { class: 'field-error', hidden: true });
    let touched = false;
    name.addEventListener('input', () => {
      if (!touched) ident.value = slugify(name.value);
    });
    ident.addEventListener('input', () => {
      touched = true;
    });
    const values = await openDialog({
      title: 'Nouveau personnage',
      body: [
        h('div', { class: 'field' }, h('label', { for: nameId }, 'Nom affiché'), name),
        h('div', { class: 'field' }, h('label', { for: idId }, 'Identifiant'), ident,
          h('p', { class: 'help' }, 'Nom du dossier shared/characters/… et valeur de « character » dans les scènes. Minuscules, chiffres et tirets.')),
        error,
      ],
      buttons: [
        { label: 'Annuler', value: null },
        { label: 'Créer', kind: 'gold', submit: true },
      ],
      setup: () => name.focus(),
      onSubmit: () => {
        const message = !name.value.trim() ? 'Le nom est obligatoire.'
          : !ID_RE.test(ident.value) ? 'Identifiant invalide : minuscules, chiffres et tirets.'
            : this.list.some((c) => c.id === ident.value) ? 'Cet identifiant existe déjà.' : '';
        error.hidden = !message;
        error.textContent = message;
        return message ? null : { id: ident.value, name: name.value.trim() };
      },
    });
    if (!values) return;
    try {
      await this.api.createCharacter(values.id, values.name);
    } catch (error) {
      toast(`Création impossible : ${error.message}`, 'error', 8000);
      return;
    }
    this.current = null;
    this.onChange?.(values.id);
    await this.loadList();
    await this.select(values.id);
    toast(`Personnage « ${values.name} » créé.`, 'success');
  }

  // ---- Save ----

  updateStatus() {
    const dirty = this.dirty;
    this.status.textContent = !this.current ? '' : this.saving ? 'Enregistrement…' : dirty ? 'Modifications non enregistrées' : 'Enregistré';
    this.status.dataset.tone = !this.current ? '' : this.saving ? 'busy' : dirty ? 'dirty' : 'saved';
    this.saveButton.disabled = !this.current || this.saving || !dirty;
    this.revertButton.disabled = !this.current || this.saving || !dirty;
  }

  changed(rerender = false) {
    this.updateStatus();
    if (rerender) this.renderMain();
  }

  revert() {
    if (!this.current) return;
    this.current.data = JSON.parse(this.current.savedJson);
    this.changed(true);
  }

  async save(force = false) {
    const current = this.current;
    if (!current || this.saving || (!this.dirty && !force)) return;
    if (typeof current.data.name !== 'string' || !current.data.name.trim()) {
      toast('Le nom du personnage est obligatoire.', 'error');
      return;
    }
    const json = JSON.stringify(current.data);
    this.saving = true;
    this.updateStatus();
    let conflict = null;
    try {
      const result = await this.api.saveCharacter(current.id, current.data, current.rev, force);
      current.rev = result.rev;
      current.savedJson = json;
      const entry = this.list.find((c) => c.id === current.id);
      if (entry) Object.assign(entry, { name: current.data.name, idle: slotGet(current.data.sprites, 0) || null });
      this.renderList();
      this.onChange?.(current.id);
      toast('Personnage enregistré.', 'success', 2500);
    } catch (error) {
      if (error.status === 409 && error.data?.character) conflict = error.data;
      else toast(`Enregistrement impossible : ${error.message}`, 'error', 8000);
    } finally {
      this.saving = false;
      this.updateStatus();
    }
    if (!conflict) return;
    const choice = await choiceDialog({
      title: 'Conflit d’enregistrement',
      message: 'Ce personnage a été modifié par quelqu’un d’autre depuis son ouverture.',
      choices: [
        { label: 'Recharger leur version (perdre mes modifications)', value: 'reload', kind: 'danger' },
        { label: 'Écraser avec ma version', value: 'overwrite', kind: 'gold' },
        { label: 'Annuler', value: null, autofocus: true },
      ],
    });
    if (choice === 'reload') {
      Object.assign(current, { data: conflict.character, rev: conflict.rev, savedJson: JSON.stringify(conflict.character) });
      this.changed(true);
    } else if (choice === 'overwrite') {
      await this.save(true);
    }
  }

  // ---- Files ----

  async refreshFiles() {
    const current = this.current;
    try {
      const data = await this.api.character(current.id);
      current.files = data.files || [];
    } catch {
      // The list refreshes on the next opening.
    }
  }

  filesOf(type) {
    return (this.current?.files || []).filter((file) => file.type === type).map((file) => file.path);
  }

  /** Uploads to sprites/ or voice/ and resolves with the stored paths. */
  async upload(files, folder) {
    const current = this.current;
    const stored = [];
    let replaceAll = null;
    for (const file of files) {
      try {
        stored.push((await this.api.uploadCharacterFile(current.id, folder, file, false)).path);
      } catch (error) {
        if (error.status !== 409 || !error.data?.exists) {
          toast(`« ${file.name} » : ${error.message}`, 'error', 8000);
          continue;
        }
        let replace = replaceAll;
        if (replace === null) {
          const choice = await choiceDialog({
            title: 'Fichier existant',
            message: `« ${fileName(error.data.path)} » existe déjà dans ${folder}/. Le remplacer ?`,
            choices: [
              { label: 'Garder l’ancien', value: 'keep', autofocus: true },
              ...(files.length > 1 ? [{ label: 'Remplacer tous les fichiers existants', value: 'all', kind: 'danger' }] : []),
              { label: 'Remplacer', value: 'one', kind: 'danger' },
            ],
          });
          if (choice === 'all') replaceAll = true;
          replace = choice === 'one' || choice === 'all';
        }
        if (!replace) {
          stored.push(error.data.path);
          continue;
        }
        try {
          stored.push((await this.api.uploadCharacterFile(current.id, folder, file, true)).path);
        } catch (retry) {
          toast(`« ${file.name} » : ${retry.message}`, 'error', 8000);
        }
      }
    }
    this.bust = Date.now();
    await this.refreshFiles();
    if (stored.length) toast(`${stored.length} fichier(s) téléversé(s) dans ${folder}/.`, 'success');
    return stored;
  }

  async importSheet({ baseName, labels = [], fps = 8 }) {
    const [file] = await pickFiles(this.dialog, ACCEPT.sprites, false);
    if (!file) return null;
    const frames = await sliceSheetDialog({ file, baseName, labels, fps });
    if (!frames) return null;
    const paths = await this.upload(frames, 'sprites');
    return paths.length ? paths : null;
  }

  // ---- Voice playback (drives the mouth of the preview) ----

  playVoice(path) {
    this.stopVoice();
    if (!path) return;
    const el = new Audio(this.url(path));
    const handle = { el, playing: () => !el.paused && !el.ended, level: () => -1, stop: () => el.pause(), path };
    try {
      this.audioCtx ||= new AudioContext();
      this.audioCtx.resume();
      const source = this.audioCtx.createMediaElementSource(el);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      const buf = new Float32Array(analyser.fftSize);
      source.connect(analyser);
      analyser.connect(this.audioCtx.destination);
      handle.level = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        return Math.sqrt(sum / buf.length);
      };
    } catch {
      // Without Web Audio the sprite falls back to random mouth movements.
    }
    el.play().catch(() => {
      toast(`Lecture impossible : ${fileName(path)}`, 'error');
      if (this.voice === handle) this.stopVoice();
    });
    this.voice = handle;
    this.unfreeze();
    this.syncVoiceUi();
  }

  simulateSpeech() {
    if (this.voice?.fake) {
      this.stopVoice();
      return;
    }
    this.stopVoice();
    const start = performance.now();
    this.voice = {
      fake: true,
      playing: () => true,
      level: () => {
        const t = (performance.now() - start) / 1000;
        return Math.max(0, Math.sin(t * Math.PI * 9)) * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.7))) * 0.3;
      },
      stop: () => {},
    };
    this.unfreeze();
    this.syncVoiceUi();
  }

  stopVoice() {
    this.voice?.stop();
    this.voice = null;
    this.syncVoiceUi();
  }

  unfreeze() {
    this.freeze = -1;
    if (this.freezeSelect) this.freezeSelect.value = '-1';
  }

  syncVoiceUi() {
    if (this.simButton) {
      this.simButton.setAttribute('aria-pressed', String(Boolean(this.voice?.fake)));
      this.simButton.textContent = this.voice?.fake ? 'Arrêter la simulation' : 'Simuler la parole';
    }
    if (this.stopButton) this.stopButton.disabled = !this.voice || this.voice.fake;
    for (const button of this.main?.querySelectorAll('[data-play]') || []) {
      const playing = Boolean(this.voice && !this.voice.fake && this.voice.path === button.dataset.play);
      button.textContent = playing ? '■' : '▶';
      button.setAttribute('aria-label', `${playing ? 'Arrêter' : 'Écouter'} ${fileName(button.dataset.play)}`);
    }
  }

  // ---- Main pane ----

  renderMain(resetScroll = false) {
    const scroll = resetScroll ? 0 : this.main.scrollTop;
    this.players = [];
    this.sprite = null;
    this.simButton = null;
    this.stopButton = null;
    this.freezeSelect = null;
    const current = this.current;
    if (!current) {
      this.main.replaceChildren(h('p', { class: 'empty' }, this.list.length ? 'Choisissez un personnage.' : 'Aucun personnage : créez-en un avec « Nouveau ».'));
      return;
    }
    const data = current.data;
    this.main.replaceChildren(...[
      this.renderIdentity(data),
      this.renderMissing(data),
      this.renderTalk(data),
      this.renderAnimations(data),
      this.renderVoice(data),
      this.renderFiles(data),
      this.renderJson(data),
    ].filter(Boolean));
    this.main.scrollTop = scroll;
    this.syncVoiceUi();
  }

  renderIdentity(data) {
    const current = this.current;
    const nameId = uid('name');
    const name = h('input', { id: nameId, type: 'text', value: typeof data.name === 'string' ? data.name : '', autocomplete: 'off' });
    name.addEventListener('input', () => {
      data.name = name.value;
      this.changed();
    });
    const register = h('button', { type: 'button', class: 'btn btn-small', onclick: () => this.register() }, 'Déclarer dans le jeu');
    return card(null,
      h('div', { class: 'chared-identity' },
        h('div', { class: 'field' }, h('label', { for: nameId }, 'Nom affiché'), name,
          h('p', { class: 'help' }, 'Affiché dans la bulle « parle » et devant les sous-titres.')),
        h('div', { class: 'field' }, h('span', { class: 'chared-label' }, 'Identifiant'),
          h('code', { class: 'mono chared-id' }, current.id),
          h('p', { class: 'help mono' }, `shared/characters/${current.id}/character.json`))),
      current.declared ? null : h('p', { class: 'chared-warn' },
        'Ce personnage n’est pas listé dans game.json : le jeu ne le charge pas. ', register),
      h('p', { class: 'help' }, `Dans une scène d’exploration, un objet affiche ce personnage avec « Personnage animé » = ${current.id}. Les répliques se jouent avec l’action voice : { "character": "${current.id}", "pool": "…" }.`));
  }

  async register() {
    try {
      await this.api.registerCharacter(this.current.id);
    } catch (error) {
      toast(`Déclaration impossible : ${error.message}`, 'error');
      return;
    }
    this.current.declared = true;
    const entry = this.list.find((c) => c.id === this.current.id);
    if (entry) entry.declared = true;
    this.renderList();
    this.renderMain();
    this.onChange?.(this.current.id);
    toast('Personnage ajouté à game.json.', 'success');
  }

  renderMissing(data) {
    const files = new Set((this.current.files || []).map((file) => file.path));
    const missing = [...referencedPaths(data)].filter((path) => !files.has(path));
    if (!missing.length) return null;
    return h('div', { class: 'chared-warn', role: 'alert' },
      h('strong', null, `${missing.length} fichier(s) introuvable(s) : `),
      missing.map((path, index) => [index ? ', ' : '', h('code', { class: 'mono' }, path)]));
  }

  imageSelect(value, onPick, label) {
    const images = this.filesOf('image');
    const select = h('select', { 'aria-label': label },
      h('option', { value: '' }, '(aucune image)'),
      value && !images.includes(value) ? h('option', { value }, `${value} (introuvable)`) : null,
      images.map((path) => h('option', { value: path }, path)));
    select.value = value || '';
    select.classList.toggle('is-missing', Boolean(value) && !images.includes(value));
    select.addEventListener('change', () => onPick(select.value));
    return select;
  }

  audioSelect(value, onPick, label) {
    const sounds = this.filesOf('audio');
    const select = h('select', { 'aria-label': label },
      h('option', { value: '' }, '(aucun son)'),
      value && !sounds.includes(value) ? h('option', { value }, `${value} (introuvable)`) : null,
      sounds.map((path) => h('option', { value: path }, path)));
    select.value = value || '';
    select.classList.toggle('is-missing', Boolean(value) && !sounds.includes(value));
    select.addEventListener('change', () => onPick(select.value));
    return select;
  }

  thumb(path) {
    if (!path) return h('span', { class: 'chared-noimg' }, 'aucune image');
    const img = h('img', { src: this.url(path), alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(h('span', { class: 'chared-noimg is-missing' }, 'introuvable')));
    return img;
  }

  // Talking sprite: live preview driven by the engine's own CharacterSprite.
  renderTalk(data) {
    const paths = SLOTS.map((_, index) => slotGet(data.sprites, index));
    const stage = h('div', { class: 'chared-char' },
      paths.map((path, index) => (path ? h('img', { src: this.url(path), alt: '', class: index === 0 ? 'on' : null }) : h('i'))));
    const idle = stage.querySelector('img');
    if (idle) idle.addEventListener('load', () => { stage.style.aspectRatio = `${idle.naturalWidth} / ${idle.naturalHeight}`; }, { once: true });
    this.sprite = new CharacterSprite(stage, [...stage.children]);
    this.sprite.setFrame(this.freeze < 0 ? 0 : this.freeze);

    const freezeId = uid('freeze');
    this.freezeSelect = h('select', { id: freezeId },
      h('option', { value: '-1' }, 'Animation en direct'),
      SLOTS.map((slot, index) => h('option', { value: String(index) }, slot.label)));
    this.freezeSelect.value = String(this.freeze);
    this.freezeSelect.addEventListener('change', () => {
      this.freeze = Number(this.freezeSelect.value);
      if (this.freeze >= 0) {
        this.stopVoice();
        this.sprite.setFrame(this.freeze);
        stage.style.removeProperty('--gt');
      }
    });
    this.simButton = h('button', { type: 'button', class: 'btn btn-small', 'aria-pressed': 'false', onclick: () => this.simulateSpeech() }, 'Simuler la parole');
    this.stopButton = h('button', { type: 'button', class: 'btn btn-small', disabled: true, onclick: () => this.stopVoice() }, 'Arrêter');

    const pools = Object.entries(isObj(data.voice) ? data.voice : {});
    const lineSelect = h('select', { 'aria-label': 'Réplique à faire dire' },
      pools.length ? null : h('option', { value: '' }, '(aucune réplique)'),
      pools.map(([pool, lines]) => h('optgroup', { label: pool },
        h('option', { value: `pool:${pool}` }, `Au hasard dans « ${pool} »`),
        (Array.isArray(lines) ? lines : []).filter((line) => line?.src).map((line) => h('option', { value: line.src }, fileName(line.src))))));
    const say = h('button', {
      type: 'button',
      class: 'btn btn-small',
      disabled: !pools.length,
      onclick: () => {
        const value = lineSelect.value;
        if (!value.startsWith('pool:')) return this.playVoice(value);
        const lines = (data.voice[value.slice(5)] || []).filter((line) => line?.src);
        if (lines.length) this.playVoice(lines[Math.floor(Math.random() * lines.length)].src);
      },
    }, 'Faire parler');

    const sizeWarn = h('p', { class: 'chared-warn', hidden: true });
    checkSizes(paths.filter(Boolean).map((path) => this.url(path)), sizeWarn);
    const missingSlots = SLOTS.filter((_, index) => !paths[index]).map((slot) => slot.label.toLowerCase());

    const slots = SLOTS.map((slot, index) => {
      const upload = h('button', {
        type: 'button',
        class: 'btn btn-small',
        onclick: async () => {
          const files = await pickFiles(this.dialog, ACCEPT.sprites, false);
          if (!files.length) return;
          const [path] = await this.upload(files, 'sprites');
          if (path) slotSet(data, index, path);
          this.changed(true);
        },
      }, 'Téléverser…');
      return h('div', { class: `chared-slot${this.freeze === index ? ' is-frozen' : ''}` },
        h('button', {
          type: 'button',
          class: 'chared-slot-img',
          title: 'Afficher cette image dans l’aperçu',
          onclick: () => {
            this.freezeSelect.value = String(index);
            this.freezeSelect.dispatchEvent(new Event('change'));
          },
        }, this.thumb(paths[index])),
        h('strong', null, `${index + 1}. ${slot.label}`),
        h('p', { class: 'help' }, slot.help),
        this.imageSelect(paths[index], (path) => {
          slotSet(data, index, path);
          this.changed(true);
        }, slot.label),
        upload);
    });

    const sheet = h('button', {
      type: 'button',
      class: 'btn btn-small',
      onclick: async () => {
        const frames = await this.importSheet({ baseName: `${this.current.id}-parle`, labels: SLOTS.map((slot) => slot.label), fps: 4 });
        if (!frames) return;
        frames.slice(0, SLOTS.length).forEach((path, index) => slotSet(data, index, path));
        this.changed(true);
      },
    }, 'Importer une planche…');

    return card('Parole et clignement',
      h('p', { class: 'help' }, 'Les quatre images que le jeu alterne quand le personnage parle (la bouche suit le volume de la voix), cligne des yeux et respire. Elles doivent avoir exactement la même taille et le même cadrage.'),
      h('div', { class: 'chared-talk' },
        h('div', { class: 'chared-preview' },
          h('div', { class: 'chared-stage' }, stage),
          h('div', { class: 'btn-row' }, lineSelect, say, this.stopButton),
          h('div', { class: 'btn-row' }, this.simButton,
            h('label', { for: freezeId, class: 'chared-label' }, 'Figer :'), this.freezeSelect)),
        h('div', null,
          h('div', { class: 'chared-slots' }, slots),
          h('div', { class: 'btn-row chared-row' }, sheet,
            h('span', { class: 'help' }, 'Une planche de 4 poses dans l’ordre : repos, mi-ouverte, ouverte, yeux fermés.')))),
      missingSlots.length ? h('p', { class: 'help warn' }, `Image manquante : ${missingSlots.join(', ')}.`) : null,
      sizeWarn);
  }

  renderAnimations(data) {
    const animations = isObj(data.animations) ? data.animations : {};
    const add = async (fromSheet) => {
      const key = freeKey(animations, fromSheet ? 'nouvelle' : 'animation');
      let frames = [];
      if (fromSheet) {
        frames = await this.importSheet({ baseName: `${this.current.id}-${key}` });
        if (!frames) return;
      }
      data.animations = { ...(isObj(data.animations) ? data.animations : {}), [key]: { frames, fps: 8, loop: true } };
      this.changed(true);
    };
    const entries = Object.entries(animations);
    return card('Animations',
      h('p', { class: 'help' }, 'Suites d’images jouées à la cadence choisie : marche, geste, assis… En jeu : action { "do": "animate", "object": "…", "animation": "nom", "to": [x, y] } pour jouer et déplacer, ou « Animation en boucle dès l’entrée » dans l’inspecteur de l’objet.'),
      entries.length ? entries.map(([key, animation]) => this.renderAnimation(data, key, animation)) : h('p', { class: 'empty' }, 'Aucune animation.'),
      h('div', { class: 'btn-row chared-row' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => add(true) }, 'Nouvelle animation depuis une planche…'),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => add(false) }, 'Nouvelle animation vide')));
  }

  renderAnimation(data, key, animation) {
    if (!isObj(animation)) animation = { frames: [] };
    const frames = Array.isArray(animation.frames) ? animation.frames : [];
    const setFrames = (next) => {
      animation.frames = next;
      data.animations[key] = animation;
      this.changed(true);
    };
    const nameInput = this.keyInput(data, 'animations', key, 'Nom de l’animation');
    const fpsId = uid('fps');
    const fps = h('input', { id: fpsId, type: 'number', min: 1, max: 60, step: 1, value: String(animation.fps ?? 8) });
    fps.addEventListener('input', () => {
      const value = Math.round(Number(fps.value));
      if (value >= 1 && value <= 60) {
        animation.fps = value;
        this.changed();
      }
    });
    const loopId = uid('loop');
    const loop = h('input', { id: loopId, type: 'checkbox', checked: animation.loop !== false });
    loop.addEventListener('change', () => {
      animation.loop = loop.checked;
      this.changed();
    });

    const view = h('div', { class: 'chared-anim-view' });
    const counter = h('span', { class: 'help mono' });
    const imgs = frames.map((path) => (path ? h('img', { src: this.url(path), alt: '' }) : h('i')));
    view.append(...imgs);
    const player = { index: 0, next: 0, playing: frames.length > 1 };
    const showFrame = (index) => {
      player.index = index;
      imgs.forEach((img, i) => img.classList.toggle('on', i === index));
      counter.textContent = frames.length ? `${index + 1} / ${frames.length}` : '0 / 0';
    };
    const toggle = h('button', { type: 'button', class: 'btn btn-small' }, player.playing ? 'Pause' : 'Lire');
    toggle.addEventListener('click', () => {
      player.playing = !player.playing;
      if (player.playing && animation.loop === false && player.index === frames.length - 1) showFrame(0);
      toggle.textContent = player.playing ? 'Pause' : 'Lire';
    });
    player.tick = (now) => {
      if (!player.playing || frames.length < 2 || now < player.next) return;
      player.next = now + 1000 / (animation.fps || 8);
      if (player.index + 1 >= frames.length && animation.loop === false) {
        player.playing = false;
        toggle.textContent = 'Lire';
        return;
      }
      showFrame((player.index + 1) % frames.length);
    };
    showFrame(0);
    this.players.push(player);
    imgs.forEach((img, index) => img.addEventListener?.('load', () => {
      if (index === 0) view.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
    }, { once: true }));

    const strip = h('ol', { class: 'chared-frames' }, frames.map((path, index) => h('li', { class: 'chared-frame' },
      h('button', {
        type: 'button',
        class: 'chared-frame-img',
        title: path || 'aucune image',
        onclick: () => {
          player.playing = false;
          toggle.textContent = 'Lire';
          showFrame(index);
        },
      }, this.thumb(path)),
      h('span', { class: 'chared-frame-tools' },
        h('span', { class: 'mono' }, String(index + 1)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Déplacer l’image ${index + 1} vers la gauche`, disabled: index === 0, onclick: () => setFrames(frames.map((f, i) => (i === index - 1 ? frames[index] : i === index ? frames[index - 1] : f))) }, '◀'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Déplacer l’image ${index + 1} vers la droite`, disabled: index === frames.length - 1, onclick: () => setFrames(frames.map((f, i) => (i === index + 1 ? frames[index] : i === index ? frames[index + 1] : f))) }, '▶'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Dupliquer l’image ${index + 1}`, onclick: () => setFrames([...frames.slice(0, index + 1), path, ...frames.slice(index + 1)]) }, '⧉'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Retirer l’image ${index + 1}`, onclick: () => setFrames(frames.filter((_, i) => i !== index)) }, '✕')))));

    const addSelect = this.imageSelect('', (path) => {
      if (path) setFrames([...frames, path]);
    }, 'Ajouter une image existante');
    addSelect.options[0].textContent = '+ Ajouter une image…';
    const sizeWarn = h('p', { class: 'chared-warn', hidden: true });
    checkSizes(frames.filter(Boolean).map((path) => this.url(path)), sizeWarn);

    return h('article', { class: 'chared-anim' },
      h('div', { class: 'chared-anim-head' },
        h('div', { class: 'field' }, h('label', { for: nameInput.id }, 'Nom'), nameInput),
        h('div', { class: 'field field-number' }, h('label', { for: fpsId }, 'Images par seconde'), fps),
        h('div', { class: 'field field-check' }, loop, h('label', { for: loopId }, 'En boucle')),
        h('button', {
          type: 'button',
          class: 'btn btn-small btn-danger',
          onclick: async () => {
            if (frames.length && !(await confirmDialog(`Supprimer l’animation « ${key} » ? Les images restent dans sprites/.`, { confirmLabel: 'Supprimer', danger: true }))) return;
            delete data.animations[key];
            if (!Object.keys(data.animations).length) delete data.animations;
            this.changed(true);
          },
        }, 'Supprimer')),
      h('div', { class: 'chared-anim-body' },
        h('div', { class: 'chared-anim-preview' }, view, h('div', { class: 'btn-row' }, toggle, counter)),
        h('div', { class: 'chared-anim-edit' },
          frames.length ? strip : h('p', { class: 'empty' }, 'Aucune image.'),
          h('div', { class: 'btn-row chared-row' },
            addSelect,
            h('button', {
              type: 'button',
              class: 'btn btn-small',
              onclick: async () => {
                const files = await pickFiles(this.dialog, ACCEPT.sprites, true);
                if (!files.length) return;
                files.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
                const paths = await this.upload(files, 'sprites');
                if (paths.length) setFrames([...frames, ...paths]);
              },
            }, 'Téléverser des images…'),
            h('button', {
              type: 'button',
              class: 'btn btn-small',
              onclick: async () => {
                const paths = await this.importSheet({ baseName: `${this.current.id}-${key}`, fps: animation.fps || 8 });
                if (paths) setFrames(paths);
              },
            }, 'Remplacer par une planche…')),
          sizeWarn)));
  }

  // Text input renaming a key of data[group] (animation or voice pool), committed on change.
  keyInput(data, group, key, label) {
    const input = h('input', { id: uid('key'), type: 'text', class: 'mono', value: key, autocomplete: 'off', 'aria-label': label });
    input.addEventListener('change', () => {
      const next = input.value.trim();
      if (next === key) return;
      const message = !KEY_RE.test(next) ? 'Nom invalide : lettres, chiffres, tirets (40 caractères au plus).'
        : next in data[group] ? `« ${next} » existe déjà.` : '';
      if (message) {
        toast(message, 'error');
        input.value = key;
        return;
      }
      data[group] = renameKey(data[group], key, next);
      this.changed(true);
    });
    return input;
  }

  renderVoice(data) {
    const pools = isObj(data.voice) ? data.voice : {};
    const preview = this.getGame?.()?.shell?.voicePreview;
    const entries = Object.entries(pools);
    return card('Voix — répliques par défaut',
      h('p', { class: 'help' }, `Séries de répliques. Une action voice avec « pool » en tire une au hasard (jamais deux fois la même d’affilée). Le sous-titre s’affiche pendant la réplique.`),
      entries.length ? entries.map(([pool, lines]) => this.renderPool(data, pool, Array.isArray(lines) ? lines : [], preview)) : h('p', { class: 'empty' }, 'Aucune série de répliques.'),
      h('div', { class: 'btn-row chared-row' },
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          onclick: () => {
            data.voice = { ...pools, [freeKey(pools, 'repliques')]: [] };
            this.changed(true);
          },
        }, 'Nouvelle série')));
  }

  renderPool(data, pool, lines, preview) {
    const setLines = (next) => {
      data.voice[pool] = next;
      this.changed(true);
    };
    const usedBy = preview?.character === this.current.id && preview?.pool === pool;
    const rows = lines.map((line, index) => {
      const subtitle = h('input', { type: 'text', value: typeof line?.subtitle === 'string' ? line.subtitle : '', placeholder: 'Sous-titre…', 'aria-label': `Sous-titre de la réplique ${index + 1}` });
      subtitle.addEventListener('input', () => {
        line.subtitle = subtitle.value;
        this.changed();
      });
      const src = typeof line?.src === 'string' ? line.src : '';
      return h('li', { class: 'chared-line' },
        h('button', {
          type: 'button',
          class: 'icon-btn chared-play',
          'data-play': src,
          disabled: !src,
          onclick: () => (this.voice?.path === src ? this.stopVoice() : this.playVoice(src)),
        }, '▶'),
        this.audioSelect(src, (path) => {
          line.src = path;
          this.changed(true);
        }, `Fichier de la réplique ${index + 1}`),
        subtitle,
        h('span', { class: 'chared-line-tools' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Monter la réplique ${index + 1}`, disabled: index === 0, onclick: () => setLines(lines.map((l, i) => (i === index - 1 ? lines[index] : i === index ? lines[index - 1] : l))) }, '↑'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Descendre la réplique ${index + 1}`, disabled: index === lines.length - 1, onclick: () => setLines(lines.map((l, i) => (i === index + 1 ? lines[index] : i === index ? lines[index + 1] : l))) }, '↓'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Retirer la réplique ${index + 1}`, onclick: () => setLines(lines.filter((_, i) => i !== index)) }, '✕')));
    });
    const nameInput = this.keyInput(data, 'voice', pool, 'Nom de la série');
    const used = new Set(lines.map((line) => line?.src));
    return h('article', { class: 'chared-pool' },
      h('div', { class: 'chared-anim-head' },
        h('div', { class: 'field' }, h('label', { for: nameInput.id }, 'Série (pool)'), nameInput),
        usedBy ? h('span', { class: 'chip chip-start', title: 'game.json › shell.voicePreview' }, 'Menu Réglages : test du volume des voix') : null,
        h('span', { class: 'help' }, `${lines.length} réplique(s)`),
        h('button', {
          type: 'button',
          class: 'btn btn-small btn-danger',
          onclick: async () => {
            if (lines.length && !(await confirmDialog(`Supprimer la série « ${pool} » ? Les fichiers restent dans voice/.`, { confirmLabel: 'Supprimer', danger: true }))) return;
            delete data.voice[pool];
            if (!Object.keys(data.voice).length) delete data.voice;
            this.changed(true);
          },
        }, 'Supprimer')),
      lines.length ? h('ol', { class: 'chared-lines' }, rows) : h('p', { class: 'empty' }, 'Aucune réplique.'),
      h('div', { class: 'btn-row chared-row' },
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          onclick: () => setLines([...lines, { src: this.filesOf('audio').find((path) => !used.has(path)) || '', subtitle: '' }]),
        }, 'Ajouter une réplique'),
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          onclick: async () => {
            const files = await pickFiles(this.dialog, ACCEPT.voice, true);
            if (!files.length) return;
            const paths = await this.upload(files, 'voice');
            setLines([...lines, ...paths.filter((path) => !used.has(path)).map((path) => ({ src: path, subtitle: '' }))]);
          },
        }, 'Téléverser des sons…')));
  }

  renderFiles(data) {
    const used = referencedPaths(data);
    const files = this.current.files || [];
    const images = files.filter((file) => file.type === 'image');
    const sounds = files.filter((file) => file.type === 'audio');
    const uploadButton = (folder, label) => h('button', {
      type: 'button',
      class: 'btn btn-small',
      onclick: async () => {
        const picked = await pickFiles(this.dialog, ACCEPT[folder], true);
        if (!picked.length) return;
        await this.upload(picked, folder);
        this.renderMain();
      },
    }, label);
    const unused = (file) => (used.has(file.path) ? null : h('span', { class: 'chip' }, 'non utilisé'));
    return card(`Fichiers du personnage (${files.length})`,
      h('div', { class: 'btn-row chared-row' }, uploadButton('sprites', 'Téléverser des images…'), uploadButton('voice', 'Téléverser des sons…')),
      images.length ? h('div', { class: 'chared-files' }, images.map((file) => h('figure', { class: 'chared-file' },
        this.thumb(file.path),
        h('figcaption', null, h('span', { class: 'asset-name', title: file.path }, fileName(file.path)), h('span', { class: 'asset-size' }, formatBytes(file.size)), unused(file))))) : null,
      sounds.length ? h('ul', { class: 'chared-sounds' }, sounds.map((file) => h('li', null,
        h('button', { type: 'button', class: 'icon-btn chared-play', 'data-play': file.path, onclick: () => (this.voice?.path === file.path ? this.stopVoice() : this.playVoice(file.path)) }, '▶'),
        h('span', { class: 'asset-name', title: file.path }, file.path),
        h('span', { class: 'asset-size' }, formatBytes(file.size)),
        unused(file)))) : null,
      files.length ? null : h('p', { class: 'empty' }, 'Aucun fichier.'));
  }

  renderJson(data) {
    const id = this.current.id;
    let pending = false;
    const field = createJsonField({
      label: 'character.json',
      rows: 16,
      optional: false,
      help: 'Modification directe du fichier. Les autres sections se mettent à jour en quittant le champ.',
      validate: (value) => (!isObj(value) ? 'Un objet { … } est attendu.'
        : value.id !== id ? `Le champ « id » doit valoir « ${id} ».`
          : typeof value.name !== 'string' || !value.name.trim() ? 'Le champ « name » est obligatoire.' : null),
      onCommit: (value) => {
        this.current.data = value;
        pending = true;
        this.changed();
      },
    });
    field.setValue(data);
    field.textarea.addEventListener('blur', () => {
      if (!pending) return;
      pending = false;
      this.renderMain();
    });
    return h('details', { class: 'chared-card chared-json' }, h('summary', null, 'JSON complet'), field.el);
  }
}
