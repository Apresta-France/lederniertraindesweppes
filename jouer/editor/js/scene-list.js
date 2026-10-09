import { h, slugify, uid } from './dom.js';
import { openDialog, toast } from './ui.js';

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TYPE_LABELS = { explore: 'Exploration', cinematic: 'Cinématique' };

/** Sidebar: scenes in game.json order, manifest edits (order, start) and scene creation. */
export class SceneList {
  constructor({ container, api, onOpen, onReload }) {
    this.container = container;
    this.api = api;
    this.onOpen = onOpen;
    this.onReload = onReload;
    this.data = null;
    this.currentId = null;
    this.busy = false;
  }

  setData(data) {
    this.data = data;
    this.render();
  }

  setCurrent(id) {
    this.currentId = id;
    this.render();
  }

  render() {
    if (!this.data) return;
    const { game, scenes } = this.data;
    const listed = scenes.filter((s) => !s.unlisted);
    const focusedKey = this.container.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    this.container.replaceChildren(...scenes.map((scene) => {
      const position = listed.indexOf(scene);
      const isCurrent = scene.id === this.currentId;
      const badges = [];
      if (scene.type) badges.push(h('span', { class: `chip chip-${scene.type}` }, TYPE_LABELS[scene.type] || scene.type));
      if (game.start === scene.id) badges.push(h('span', { class: 'chip chip-start' }, 'Départ'));
      if (scene.unlisted) badges.push(h('span', { class: 'chip chip-warn' }, 'Hors manifeste'));
      if (scene.missing) badges.push(h('span', { class: 'chip chip-warn' }, 'Dossier manquant'));
      if (scene.invalid) badges.push(h('span', { class: 'chip chip-warn' }, 'JSON invalide'));
      if (scene.lock && !scene.lock.mine) badges.push(h('span', { class: 'chip chip-lock' }, `en cours d’édition par ${scene.lock.user}`));

      const tool = (label, title, onClick, disabled = false, key = '') => h('button', {
        type: 'button', class: 'icon-btn', title, 'aria-label': `${title} : ${scene.label || scene.title || scene.id}`, disabled: disabled || this.busy, onclick: onClick, dataset: { key: `${key}:${scene.id}` },
      }, label);

      const tools = scene.unlisted
        ? [tool('+', 'Ajouter au manifeste', () => this.addToManifest(scene), false, 'add')]
        : scene.missing
          ? [tool('×', 'Retirer du manifeste', () => this.removeFromManifest(scene), false, 'rm')]
          : [
            tool('↑', 'Monter', () => this.move(scene, -1), position <= 0, 'up'),
            tool('↓', 'Descendre', () => this.move(scene, 1), position >= listed.length - 1, 'down'),
            tool('★', 'Définir comme scène de départ', () => this.setStart(scene), game.start === scene.id, 'start'),
          ];

      return h('li', { class: `scene-item${isCurrent ? ' is-current' : ''}` },
        h('button', {
          type: 'button',
          class: 'scene-open',
          'aria-current': isCurrent ? 'true' : null,
          disabled: scene.missing || false,
          dataset: { key: `open:${scene.id}` },
          onclick: () => this.onOpen(scene.id),
        },
        h('span', { class: 'scene-title' }, scene.label || scene.title || scene.id),
        h('span', { class: 'scene-id' }, scene.id),
        h('span', { class: 'scene-badges' }, badges)),
        h('div', { class: 'scene-tools' }, tools));
    }));
    if (focusedKey) this.container.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`)?.focus();
  }

  async saveGame(mutate, successMessage) {
    if (this.busy) return;
    const game = structuredClone(this.data.game);
    mutate(game);
    this.busy = true;
    this.render();
    try {
      const result = await this.api.saveGame(game, this.data.gameRev);
      this.data.game = game;
      this.data.gameRev = result.rev;
      toast(successMessage, 'success');
    } catch (error) {
      toast(error.status === 409 ? 'Le manifeste a été modifié entre-temps : liste rechargée, recommencez.' : `Manifeste non enregistré : ${error.message}`, 'error');
    } finally {
      this.busy = false;
      await this.onReload();
    }
  }

  move(scene, direction) {
    return this.saveGame((game) => {
      const index = game.scenes.findIndex((s) => s.id === scene.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= game.scenes.length) return;
      [game.scenes[index], game.scenes[target]] = [game.scenes[target], game.scenes[index]];
    }, 'Ordre des scènes enregistré.');
  }

  setStart(scene) {
    return this.saveGame((game) => {
      game.start = scene.id;
    }, `« ${scene.label || scene.id} » est maintenant la scène de départ.`);
  }

  addToManifest(scene) {
    return this.saveGame((game) => {
      game.scenes.push({ id: scene.id, label: scene.title || scene.id });
    }, `« ${scene.id} » ajoutée au manifeste.`);
  }

  removeFromManifest(scene) {
    return this.saveGame((game) => {
      game.scenes = game.scenes.filter((s) => s.id !== scene.id);
      if (game.start === scene.id) delete game.start;
      if (game.continue === scene.id) delete game.continue;
    }, `« ${scene.id} » retirée du manifeste.`);
  }

  async createScene() {
    const existing = new Set((this.data?.scenes || []).map((s) => s.id));
    const titleId = uid('new');
    const idId = uid('new');
    const typeId = uid('new');
    const errorId = uid('new');
    const title = h('input', { id: titleId, type: 'text', required: true, autocomplete: 'off', maxlength: '200' });
    const id = h('input', { id: idId, type: 'text', required: true, autocomplete: 'off', class: 'mono', pattern: '[a-z0-9]+(-[a-z0-9]+)*', 'aria-describedby': `${idId}-help` });
    const type = h('select', { id: typeId },
      h('option', { value: 'explore' }, 'Exploration (point & click)'),
      h('option', { value: 'cinematic' }, 'Cinématique (séquence minutée)'));
    const error = h('p', { class: 'field-error', id: errorId, role: 'alert', hidden: true });
    let idTouched = false;
    title.addEventListener('input', () => {
      if (!idTouched) id.value = slugify(title.value);
    });
    id.addEventListener('input', () => {
      idTouched = true;
    });

    const values = await openDialog({
      title: 'Nouvelle scène',
      body: [
        h('div', { class: 'field' }, h('label', { for: titleId }, 'Titre'), title),
        h('div', { class: 'field' }, h('label', { for: idId }, 'Identifiant (nom du dossier)'), id,
          h('p', { class: 'help', id: `${idId}-help` }, 'Minuscules, chiffres et tirets : par exemple « couloir-nuit ». Non modifiable ensuite.')),
        h('div', { class: 'field' }, h('label', { for: typeId }, 'Type'), type),
        error,
      ],
      buttons: [
        { label: 'Annuler', value: null },
        { label: 'Créer la scène', kind: 'gold', submit: true },
      ],
      setup: () => title.focus(),
      onSubmit: () => {
        const fail = (message, field) => {
          error.hidden = false;
          error.textContent = message;
          field.focus();
          return null;
        };
        if (!title.value.trim()) return fail('Le titre est obligatoire.', title);
        if (!ID_RE.test(id.value)) return fail('Identifiant invalide : minuscules, chiffres et tirets uniquement.', id);
        if (existing.has(id.value)) return fail('Une scène avec cet identifiant existe déjà.', id);
        return { id: id.value, title: title.value.trim(), type: type.value };
      },
    });
    if (!values) return;
    try {
      await this.api.create(values.id, values.type, values.title);
      toast(`Scène « ${values.title} » créée.`, 'success');
      await this.onReload();
      this.onOpen(values.id);
    } catch (e) {
      toast(`Création impossible : ${e.message}`, 'error');
    }
  }
}
