import { h, uid, listen, slugify } from './dom.js';
import { assetUrl, fileName, formatBytes } from './paths.js';
import { HANDLES, applyBox, boundsOf, clonePoints, getBox, hitItem, isPolygon, mapPoints, resizeBox, uniqueId } from './geometry.js';
import { showsHalo } from '../../engine/core/zones.js';
import { characterIdleUrl, loadCharacter } from './data.js';
import { confirmDialog, openDialog, toast } from './ui.js';

const DEFAULT_SIZE = [1672, 941];
const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,image/*';
const DECOR_PREF = 'ldtw_editor_decor';
const SVG_NS = 'http://www.w3.org/2000/svg';
let dragSeq = 0;

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined && value !== false) el.setAttribute(key, String(value));
  }
  return el;
}

function projectSegment(a, b, x, y) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

function sameSelection(a, b) {
  return Boolean(a && b) && a.kind === b.kind && a.index === b.index;
}

function collectionOf(kind) {
  return kind === 'decor' ? 'decor' : 'objects';
}

function stateNames(object) {
  const states = object?.states;
  if (!states || typeof states !== 'object' || Array.isArray(states)) return [];
  return Object.keys(states);
}

function currentState(object) {
  return typeof object?.state === 'string' ? object.state : '';
}

function labelFromPath(path) {
  const stem = fileName(path).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!stem) return 'Nouvel objet';
  return stem.charAt(0).toLocaleUpperCase('fr') + stem.slice(1);
}

function namesUsingSprite(scene, path) {
  const names = [];
  for (const object of Array.isArray(scene?.objects) ? scene.objects : []) {
    if (!object || typeof object !== 'object') continue;
    const name = object.name || object.id;
    if (!name) continue;
    let uses = object.sprite === path;
    const states = object.states;
    if (!uses && states && typeof states === 'object') {
      uses = Object.values(states).some((state) => state?.sprite === path);
    }
    if (uses && !names.includes(name)) names.push(name);
  }
  return names;
}

function imageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? [img.naturalWidth, img.naturalHeight] : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function fittedRect(sceneSize, natural) {
  const [w, hgt] = sceneSize;
  let bw = Math.round(w * 0.12);
  let bh = Math.round(hgt * 0.18);
  if (natural) {
    [bw, bh] = natural;
    const maxW = Math.round(w * 0.85);
    const maxH = Math.round(hgt * 0.85);
    if (bw > maxW || bh > maxH) {
      const scale = Math.min(maxW / bw, maxH / bh);
      bw = Math.max(1, Math.round(bw * scale));
      bh = Math.max(1, Math.round(bh * scale));
    }
  }
  return [Math.max(0, Math.round((w - bw) / 2)), Math.max(0, Math.round((hgt - bh) / 2)), bw, bh];
}

/** Visual editor for explore scenes: stage with drag/resize + layer list. */
export class ExploreEditor {
  constructor({ store, container, ctx }) {
    this.store = store;
    this.ctx = ctx;
    this.container = container;
    this.showDecor = localStorage.getItem(DECOR_PREF) === '1';
    this.zoom = 'fit';
    this.scale = 1;
    this.layoutSize = '';
    this.objectEls = [];
    this.decorEls = [];
    this.characterSprites = new Map();
    this.drag = null;
    this.hoverEl = null;
    this.hoverSelection = null;
    this.draw = null;
    this.drawCursor = null;
    this.vertex = null;
    this.layerSignature = '';
    this.build();
    this.disposers = [
      listen(store, 'change', () => this.render()),
      listen(store, 'select', () => this.onSelect()),
      listen(store, 'readonly', () => this.render()),
    ];
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.stageWrap);
    this.render();
  }

  get scene() {
    return this.store.scene;
  }

  get size() {
    const size = this.scene?.size;
    return Array.isArray(size) && size[0] > 0 && size[1] > 0 ? size : DEFAULT_SIZE;
  }

  build() {
    const decorId = uid('decor');
    this.decorToggle = h('input', { type: 'checkbox', id: decorId, checked: this.showDecor });
    this.decorToggle.addEventListener('change', () => this.setShowDecor(this.decorToggle.checked));
    const zoomId = uid('zoom');
    this.zoomSelect = h('select', { id: zoomId },
      [['fit', 'Ajuster'], ['0.5', '50 %'], ['1', '100 %'], ['1.5', '150 %'], ['2', '200 %']].map(([v, t]) => h('option', { value: v }, t)));
    this.zoomSelect.addEventListener('change', () => {
      this.zoom = this.zoomSelect.value;
      this.layout(true);
    });
    this.coords = h('span', { class: 'coords', title: 'Position du pointeur en pixels de référence' }, 'x — · y —');
    this.selInfo = h('span', { class: 'coords coords-sel' });
    this.hint = h('span', { class: 'toolbar-hint' }, 'Maj : garder les proportions · Flèches : 1 px (Maj : 10 px) · Clic répété : objet dessous');
    this.btnDrawClose = h('button', {
      type: 'button', class: 'btn btn-small btn-gold', title: 'Fermer le contour (Entrée)', 'data-edit': '', onclick: () => this.finishDraw(),
    }, 'Fermer');
    this.btnDrawCancel = h('button', {
      type: 'button', class: 'btn btn-small', title: 'Abandonner le contour (Échap)', 'data-edit': '', onclick: () => this.cancelDraw(),
    }, 'Annuler');
    this.drawActions = h('span', { class: 'toolbar-group', hidden: true }, this.btnDrawClose, this.btnDrawCancel);

    const toolbar = h('div', { class: 'toolbar' },
      h('span', { class: 'toolbar-group' }, this.decorToggle, h('label', { for: decorId }, 'Afficher le décor')),
      h('span', { class: 'toolbar-group' }, h('label', { for: zoomId }, 'Zoom'), this.zoomSelect),
      this.coords,
      this.selInfo,
      this.drawActions,
      this.hint);

    this.bg = h('img', { class: 'stage-bg', alt: '', draggable: 'false' });
    this.emptyHint = h('p', { class: 'stage-empty' }, 'Aucun fond : choisissez une image dans l’onglet « Scène ».');
    this.objectsLayer = h('div', { class: 'stage-layer' });
    this.decorLayer = h('div', { class: 'stage-layer stage-decor' });
    this.shapes = svgEl('svg', { class: 'stage-shapes', 'aria-hidden': 'true' });
    this.vertexLayer = h('div', { class: 'poly-handles' });
    this.drawBanner = h('p', { class: 'draw-banner', hidden: true });
    this.selState = h('div', { class: 'sel-state', hidden: true });
    this.selBox = h('div', { class: 'sel-box', hidden: true },
      this.selState,
      HANDLES.map((dir) => h('div', { class: `handle handle-${dir}`, dataset: { dir } })));
    this.stage = h('div', {
      class: 'stage',
      tabindex: '0',
      role: 'group',
      'aria-label': 'Décor de la scène. Clic : sélectionner. Flèches : déplacer de 1 pixel, Maj + flèches : 10 pixels. Suppr : supprimer. Échap : désélectionner.',
    }, this.bg, this.objectsLayer, this.decorLayer, this.shapes, this.selBox, this.vertexLayer, this.drawBanner, this.emptyHint);
    this.stageWrap = h('div', { class: 'stage-wrap' }, this.stage);

    this.stage.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.stage.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.stage.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.stage.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.stage.addEventListener('pointerleave', () => {
      if (this.drag || this.draw) return;
      this.coords.textContent = 'x — · y —';
      this.setHover(null);
    });

    this.layerList = h('ol', { class: 'layer-list', 'aria-label': 'Objets, du premier plan vers l’arrière-plan', 'data-own-keys': '' });
    this.layerList.addEventListener('keydown', (e) => this.onListKey(e, this.layerList));
    this.decorList = h('ol', { class: 'layer-list', 'aria-label': 'Éléments de décor', 'data-own-keys': '' });
    this.decorList.addEventListener('keydown', (e) => this.onListKey(e, this.decorList));

    const button = (label, onClick, title = label) => h('button', { type: 'button', class: 'btn btn-small', title, 'data-edit': '', onclick: onClick }, label);
    this.btnUp = button('Monter', () => this.moveSelected(1), 'Vers le premier plan');
    this.btnDown = button('Descendre', () => this.moveSelected(-1), 'Vers l’arrière-plan');
    this.btnDup = button('Dupliquer', () => this.duplicateSelected(), 'Dupliquer (Ctrl+D)');
    this.btnDel = button('Supprimer', () => this.removeSelected(), 'Supprimer (Suppr)');
    this.btnDel.classList.add('btn-danger');
    this.addButtons = [
      button('+ Objet', () => this.addObject('object'), 'Nouvel objet : choisir une image dans la médiathèque, ou en téléverser une'),
      button('+ Zone', () => this.addObject('zone'), 'Ajouter une zone cliquable rectangulaire'),
      button('+ Zone libre', () => this.startDraw(), 'Dessiner une zone cliquable en posant des points, sans image'),
    ];
    this.decorAddButtons = [
      button('+ Forme', () => this.addDecor('shape'), 'Ajouter une forme (lumière, halo…)'),
      button('+ Ombre', () => this.addDecor('shadow'), 'Ajouter une ombre portée'),
    ];
    this.decorSection = h('div', { class: 'layers-decor', hidden: !this.showDecor },
      h('div', { class: 'layers-head' }, h('h3', null, 'Décor'), h('div', { class: 'btn-row' }, this.decorAddButtons)),
      this.decorList);

    this.stateSwitch = h('div', { class: 'state-switch', hidden: true, 'data-own-keys': '' });
    this.layersPanel = h('div', { class: 'layers' },
      h('div', { class: 'layers-head' }, h('h3', null, 'Calques'), h('div', { class: 'btn-row' }, this.addButtons)),
      h('div', { class: 'btn-row layer-actions' }, this.btnUp, this.btnDown, this.btnDup, this.btnDel),
      this.stateSwitch,
      h('p', { class: 'layers-caption' }, 'Premier plan'),
      this.layerList,
      h('p', { class: 'layers-caption' }, 'Arrière-plan'),
      this.decorSection);

    this.root = h('div', { class: 'explore' }, toolbar, h('div', { class: 'explore-main' }, this.stageWrap, this.layersPanel));
    this.container.replaceChildren(this.root);
  }

  destroy() {
    this.disposers.forEach((dispose) => dispose());
    this.resizeObserver.disconnect();
    this.root.remove();
  }

  setShowDecor(show) {
    this.showDecor = show;
    this.decorToggle.checked = show;
    localStorage.setItem(DECOR_PREF, show ? '1' : '0');
    this.decorSection.hidden = !show;
    if (!show && this.store.selection?.kind === 'decor') this.store.setSelection(null);
    this.layerSignature = '';
    this.render();
  }

  layout(force = false) {
    if (!this.scene) return;
    const [w, hgt] = this.size;
    let scale;
    if (this.zoom === 'fit') {
      const rect = this.stageWrap.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      scale = Math.max(0.05, Math.min((rect.width - 24) / w, (rect.height - 24) / hgt));
    } else {
      scale = Number(this.zoom);
    }
    const signature = `${w}x${hgt}@${scale.toFixed(4)}`;
    if (!force && signature === this.layoutSize) return;
    this.layoutSize = signature;
    this.scale = scale;
    this.stage.style.width = `${Math.round(w * scale)}px`;
    this.stage.style.height = `${Math.round(hgt * scale)}px`;
    this.stageWrap.classList.toggle('is-fit', this.zoom === 'fit');
  }

  place(el, box) {
    const [w, hgt] = this.size;
    el.style.left = `${(box[0] / w) * 100}%`;
    el.style.top = `${(box[1] / hgt) * 100}%`;
    el.style.width = `${(box[2] / w) * 100}%`;
    el.style.height = `${(box[3] / hgt) * 100}%`;
  }

  itemOf(scene, selection) {
    if (!scene || !selection) return null;
    const list = scene[collectionOf(selection.kind)];
    return Array.isArray(list) ? list[selection.index] ?? null : null;
  }

  boxOf(selection) {
    if (!selection || !['object', 'decor'].includes(selection.kind)) return null;
    return getBox(this.itemOf(this.scene, selection), selection.kind);
  }

  spriteFor(object) {
    if (object.character) {
      const cached = this.characterSprites.get(object.character);
      if (cached === undefined) {
        this.characterSprites.set(object.character, null);
        loadCharacter(object.character).then((data) => {
          this.characterSprites.set(object.character, characterIdleUrl(object.character, data));
          this.render();
        });
      }
      return cached || '';
    }
    const stateSprite = object.state && object.states && typeof object.states === 'object' ? object.states[object.state]?.sprite : null;
    return assetUrl(this.store.id, stateSprite || object.sprite || '');
  }

  onSelect() {
    if (this.draw) this.cancelDraw();
    this.vertex = null;
    if (this.store.selection?.kind === 'decor' && !this.showDecor) {
      this.setShowDecor(true);
      return;
    }
    this.render();
    this.layerList.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
    this.decorList.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  }

  render() {
    if (!this.scene) return;
    this.layout();
    const scene = this.scene;
    const selection = this.store.selection;

    const bgUrl = assetUrl(this.store.id, scene.background?.src || '');
    if (this.bg.dataset.src !== bgUrl) {
      this.bg.dataset.src = bgUrl;
      if (bgUrl) this.bg.src = bgUrl;
      else this.bg.removeAttribute('src');
    }
    this.bg.hidden = !bgUrl;
    this.emptyHint.hidden = Boolean(bgUrl);

    const objects = Array.isArray(scene.objects) ? scene.objects : [];
    this.reconcile(this.objectEls, objects.length, this.objectsLayer, () => h('div', { class: 'obj' }, h('img', { alt: '', draggable: 'false' })));
    objects.forEach((object, index) => {
      const el = this.objectEls[index];
      const box = getBox(object, 'object');
      el.hidden = !box;
      if (!box) return;
      this.place(el, box);
      const sprite = this.spriteFor(object);
      const img = el.firstChild;
      if (img.dataset.src !== sprite) {
        img.dataset.src = sprite;
        if (sprite) img.src = sprite;
        else img.removeAttribute('src');
      }
      img.hidden = !sprite;
      el.classList.toggle('is-zone', !sprite);
      el.classList.toggle('is-poly', isPolygon(object.points));
      el.classList.toggle('is-hidden', object.hidden === true);
      el.classList.toggle('is-selected', sameSelection(selection, { kind: 'object', index }));
      const names = stateNames(object);
      const state = currentState(object);
      el.title = [object.name || object.id || '', names.length ? (names.includes(state) ? state : 'sans état') : ''].filter(Boolean).join(' — ');
    });

    const decor = this.showDecor && Array.isArray(scene.decor) ? scene.decor : [];
    this.reconcile(this.decorEls, decor.length, this.decorLayer, () => h('div', { class: 'decor-item' }, h('span', { class: 'decor-label' })));
    const [w, hgt] = this.size;
    decor.forEach((item, index) => {
      const el = this.decorEls[index];
      const box = getBox(item, 'decor');
      this.place(el, box || [0, 0, w, hgt]);
      el.className = `decor-item decor-${item?.type || 'shape'}${box ? '' : ' is-full'}`;
      el.classList.toggle('is-selected', sameSelection(selection, { kind: 'decor', index }));
      el.style.transform = typeof item?.rotate === 'number' ? `rotate(${item.rotate}deg)` : '';
      el.firstChild.textContent = item?.id || item?.type || '';
    });

    const selectedBox = selection?.kind === 'decor' && !this.showDecor ? null : this.boxOf(selection);
    const selectedObject = selection?.kind === 'object' ? objects[selection.index] : null;
    const selectedStates = stateNames(selectedObject);
    const selectedState = currentState(selectedObject);
    this.selBox.hidden = !selectedBox;
    this.selState.hidden = !selectedStates.length;
    this.selState.textContent = selectedStates.includes(selectedState) ? selectedState : (selectedStates.length ? 'sans état' : '');
    const contour = isPolygon(selectedObject?.points);
    if (selectedBox) {
      this.place(this.selBox, selectedBox);
      this.selBox.classList.toggle('is-locked', this.store.readOnly);
      const stateBit = selectedStates.length ? ` · état ${this.selState.textContent}` : '';
      const vertexBit = contour && this.vertex != null ? ` · sommet ${this.vertex + 1}` : '';
      const kindBit = contour ? `Contour (${selectedObject.points.length} points)` : 'Sélection';
      this.selInfo.textContent = `${kindBit} : [${selectedBox.map((n) => Math.round(n * 10) / 10).join(', ')}]${vertexBit}${stateBit}`;
    } else if (!this.draw) {
      this.selInfo.textContent = '';
    }

    this.paintShapes();
    this.syncChrome();
    this.renderLayers();
  }

  reconcile(els, count, parent, create) {
    while (els.length < count) {
      const el = create();
      els.push(el);
      parent.append(el);
    }
    while (els.length > count) els.pop().remove();
  }

  layerLabel(object) {
    if (object.character) return ['perso', 'Perso'];
    if (isPolygon(object.points)) return ['poly', 'Libre'];
    if (object.sprite || object.states) return ['sprite', 'Calque'];
    return ['zone', 'Zone'];
  }

  renderLayers() {
    const scene = this.scene;
    const selection = this.store.selection;
    const objects = Array.isArray(scene.objects) ? scene.objects : [];
    const decor = Array.isArray(scene.decor) ? scene.decor : [];
    const signature = JSON.stringify([
      objects.map((o) => [o?.name, o?.id, o?.character, Boolean(o?.sprite || o?.states), isPolygon(o?.points), o?.hidden, currentState(o), stateNames(o)]),
      this.showDecor ? decor.map((d) => [d?.id, d?.type]) : null,
      selection,
      this.store.readOnly,
    ]);
    if (signature === this.layerSignature) return;
    this.layerSignature = signature;

    const focusIn = this.layersPanel.contains(document.activeElement) && document.activeElement.classList.contains('layer-item');
    const items = objects.map((object, index) => ({ object, index })).reverse();
    this.layerList.replaceChildren(...items.map(({ object, index }) => {
      const selected = sameSelection(selection, { kind: 'object', index });
      const [kind, label] = this.layerLabel(object || {});
      const names = stateNames(object);
      const state = currentState(object);
      return h('li', null, h('button', {
        type: 'button',
        class: `layer-item${selected ? ' is-selected' : ''}${object?.hidden ? ' is-hidden' : ''}`,
        'aria-pressed': String(selected),
        dataset: { kind: 'object', index: String(index) },
        onclick: () => this.store.setSelection({ kind: 'object', index }),
      },
      h('span', { class: `chip chip-${kind}` }, label),
      h('span', { class: 'layer-name' }, object?.name || '(sans nom)'),
      h('span', { class: 'layer-id' },
        object?.id || '?',
        names.length ? h('span', { class: 'layer-state' }, names.includes(state) ? ` · ${state}` : ' · sans état') : null)));
    }));
    if (!objects.length) this.layerList.append(h('li', { class: 'empty' }, 'Aucun objet.'));

    this.decorList.replaceChildren(...(this.showDecor ? decor : []).map((item, index) => {
      const selected = sameSelection(selection, { kind: 'decor', index });
      return h('li', null, h('button', {
        type: 'button',
        class: `layer-item${selected ? ' is-selected' : ''}`,
        'aria-pressed': String(selected),
        dataset: { kind: 'decor', index: String(index) },
        onclick: () => this.store.setSelection({ kind: 'decor', index }),
      },
      h('span', { class: 'chip chip-decor' }, item?.type || '?'),
      h('span', { class: 'layer-name' }, item?.id || `#${index + 1}`),
      h('span', { class: 'layer-id' }, item?.layer || '')));
    }));

    const readOnly = this.store.readOnly;
    const hasSel = selection && ['object', 'decor'].includes(selection.kind) && this.itemOf(scene, selection);
    const length = hasSel ? scene[collectionOf(selection.kind)].length : 0;
    this.btnUp.disabled = readOnly || !hasSel || selection.index >= length - 1;
    this.btnDown.disabled = readOnly || !hasSel || selection.index <= 0;
    this.btnDup.disabled = readOnly || !hasSel;
    this.btnDel.disabled = readOnly || !hasSel;
    [...this.addButtons, ...this.decorAddButtons].forEach((b) => { b.disabled = readOnly; });

    this.renderStateSwitch();
    if (focusIn) this.layersPanel.querySelector('.layer-item.is-selected')?.focus();
  }

  renderStateSwitch() {
    const selection = this.store.selection;
    const object = selection?.kind === 'object' ? this.itemOf(this.scene, selection) : null;
    const names = stateNames(object);
    if (!names.length) {
      this.stateSwitch.hidden = true;
      this.stateSwitch.replaceChildren();
      return;
    }
    const state = currentState(object);
    const known = names.includes(state);
    const label = object.name || object.id || 'cet objet';
    let note = 'Affiché sur le décor, et au démarrage de la scène.';
    if (!state) note = 'Aucun état choisi : le calque de base est affiché.';
    else if (!known) note = `« ${state} » n’est pas défini dans les états.`;
    this.stateSwitch.hidden = false;
    this.stateSwitch.replaceChildren(
      h('p', { class: 'layers-caption' }, 'État initial'),
      h('div', { class: 'state-pills', role: 'radiogroup', 'aria-label': `État initial de ${label}` },
        names.map((name) => h('button', {
          type: 'button',
          class: `state-pill${name === state ? ' is-on' : ''}`,
          role: 'radio',
          'aria-checked': String(name === state),
          disabled: this.store.readOnly,
          title: name === state ? 'État affiché' : `Afficher « ${name} »`,
          onclick: () => this.setObjectState(selection.index, name),
        }, name))),
      h('p', { class: 'state-note' }, note));
  }

  setObjectState(index, name) {
    const object = this.scene?.objects?.[index];
    if (!object || currentState(object) === name || this.store.readOnly) return;
    this.store.update((scene) => {
      if (scene.objects?.[index]) scene.objects[index].state = name;
    }, { source: 'stage', key: `state:${index}` });
  }

  onListKey(event, list) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...list.querySelectorAll('.layer-item')];
    if (!buttons.length) return;
    event.preventDefault();
    let index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowUp') index = Math.max(0, index - 1);
    else if (event.key === 'ArrowDown') index = Math.min(buttons.length - 1, index + 1);
    else if (event.key === 'Home') index = 0;
    else index = buttons.length - 1;
    const target = buttons[index];
    target.focus();
    this.store.setSelection({ kind: target.dataset.kind, index: Number(target.dataset.index) });
  }

  toRef(event) {
    const rect = this.stage.getBoundingClientRect();
    const [w, hgt] = this.size;
    return {
      x: ((event.clientX - rect.left) / rect.width) * w,
      y: ((event.clientY - rect.top) / rect.height) * hgt,
    };
  }

  hitTest(point) {
    const hits = [];
    const objects = Array.isArray(this.scene.objects) ? this.scene.objects : [];
    for (let i = objects.length - 1; i >= 0; i -= 1) {
      if (hitItem(objects[i], 'object', point.x, point.y)) hits.push({ kind: 'object', index: i });
    }
    if (this.showDecor && Array.isArray(this.scene.decor)) {
      for (let i = this.scene.decor.length - 1; i >= 0; i -= 1) {
        if (contains(getBox(this.scene.decor[i], 'decor'), point.x, point.y)) hits.push({ kind: 'decor', index: i });
      }
    }
    return hits;
  }

  setHover(selection) {
    const el = selection ? (selection.kind === 'object' ? this.objectEls : this.decorEls)[selection.index] : null;
    if (el !== this.hoverEl) {
      this.hoverEl?.classList.remove('is-hover');
      this.hoverEl = el || null;
      this.hoverEl?.classList.add('is-hover');
    }
    this.hoverSelection = selection || null;
    this.markPolyHover();
  }

  markPolyHover() {
    this.shapes?.querySelector('.poly.is-hover')?.classList.remove('is-hover');
    const sel = this.hoverSelection;
    if (sel?.kind === 'object') this.shapes?.querySelector(`.poly[data-index="${sel.index}"]`)?.classList.add('is-hover');
  }

  onPointerDown(event) {
    if (event.button !== 0 || !this.scene) return;
    this.stage.focus({ preventScroll: true });
    const point = this.toRef(event);
    if (this.draw) {
      this.addDrawPoint(point, event.shiftKey);
      event.preventDefault();
      return;
    }
    const base = { start: point, client: [event.clientX, event.clientY], moved: false, key: `drag:${(dragSeq += 1)}` };
    const handle = event.target.closest('.handle');
    const selection = this.store.selection;
    if (handle && selection && !this.store.readOnly) {
      const box = this.boxOf(selection);
      if (box) {
        const item = this.itemOf(this.scene, selection);
        this.vertex = null;
        this.drag = {
          ...base,
          mode: 'resize',
          dir: handle.dataset.dir,
          selection,
          startBox: box,
          startPoints: isPolygon(item?.points) ? clonePoints(item.points) : null,
        };
        this.stage.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    const vertex = event.target.closest('.poly-handle');
    if (vertex && selection?.kind === 'object' && !this.store.readOnly) {
      const item = this.itemOf(this.scene, selection);
      const index = Number(vertex.dataset.index);
      if (isPolygon(item?.points) && item.points[index]) {
        this.vertex = index;
        this.drag = { ...base, mode: 'vertex', index, selection, startPoints: clonePoints(item.points) };
        this.paintVertices();
        this.stage.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    const candidates = this.hitTest(point);
    if (event.altKey && this.insertPointOnEdge(event, point, candidates, base)) {
      event.preventDefault();
      return;
    }
    if (!candidates.length) {
      this.store.setSelection(null);
      this.drag = null;
      return;
    }
    const currentIndex = candidates.findIndex((c) => sameSelection(c, selection));
    const target = currentIndex >= 0 ? candidates[currentIndex] : candidates[0];
    if (currentIndex < 0) this.store.setSelection(target);
    const item = this.itemOf(this.scene, target);
    this.vertex = null;
    this.drag = {
      ...base,
      mode: 'move',
      selection: target,
      startBox: this.boxOf(target),
      startPoints: isPolygon(item?.points) ? clonePoints(item.points) : null,
      candidates,
      wasSelected: currentIndex >= 0,
    };
    this.stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onPointerMove(event) {
    if (!this.scene) return;
    const point = this.toRef(event);
    const [w, hgt] = this.size;
    const inside = point.x >= 0 && point.y >= 0 && point.x <= w && point.y <= hgt;
    this.coords.textContent = inside ? `x ${Math.round(point.x)} · y ${Math.round(point.y)}` : 'x — · y —';

    if (this.draw) {
      this.drawCursor = this.constrainDraw(point, event.shiftKey);
      const cursor = this.drawCursor;
      this.coords.textContent = `x ${Math.round(cursor.x)} · y ${Math.round(cursor.y)}`;
      this.paintShapes();
      return;
    }

    const drag = this.drag;
    if (!drag) {
      this.setHover(this.hitTest(point)[0] || null);
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.client[0], event.clientY - drag.client[1]) < 3) return;
      drag.moved = true;
    }
    if (this.store.readOnly) return;
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (drag.mode === 'vertex') {
      this.moveVertex(drag, dx, dy, event.shiftKey);
      return;
    }
    if (!drag.startBox) return;
    let box;
    if (drag.mode === 'move') {
      let mx = Math.round(dx);
      let my = Math.round(dy);
      if (event.shiftKey) {
        if (Math.abs(mx) > Math.abs(my)) my = 0;
        else mx = 0;
      }
      box = [drag.startBox[0] + mx, drag.startBox[1] + my, drag.startBox[2], drag.startBox[3]];
    } else {
      box = resizeBox(drag.startBox, drag.dir, dx, dy, event.shiftKey);
    }
    this.setBox(drag.selection, box, drag.key);
  }

  onPointerUp(event) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (this.stage.hasPointerCapture(event.pointerId)) this.stage.releasePointerCapture(event.pointerId);
    if (!drag.moved && drag.mode === 'move' && drag.wasSelected && drag.candidates.length > 1) {
      const index = drag.candidates.findIndex((c) => sameSelection(c, drag.selection));
      this.store.setSelection(drag.candidates[(index + 1) % drag.candidates.length]);
    }
    this.store.breakCoalescing();
  }

  setBox(selection, box, key) {
    this.store.update((scene) => {
      const item = this.itemOf(scene, selection);
      if (!item) return;
      const drag = this.drag;
      if (drag?.startPoints && drag.startBox && (drag.mode === 'move' || drag.mode === 'resize')) {
        item.points = mapPoints(drag.startPoints, drag.startBox, box);
        item.rect = boundsOf(item.points);
        return;
      }
      applyBox(item, selection.kind, box);
    }, { key, source: 'stage' });
  }

  setPoints(selection, points, key) {
    const rect = boundsOf(points);
    this.store.update((scene) => {
      const item = this.itemOf(scene, selection);
      if (!item) return;
      item.points = points;
      item.rect = rect;
    }, { key, source: 'stage' });
  }

  handleKey(event) {
    if (this.draw) {
      if (event.key === 'Escape') {
        this.cancelDraw();
        return true;
      }
      if (event.key === 'Enter') {
        this.finishDraw();
        return true;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        this.popDrawPoint();
        return true;
      }
      if (event.key.startsWith('Arrow')) return true;
      return false;
    }
    const selection = this.store.selection;
    if (event.key === 'Escape') {
      this.store.setSelection(null);
      return true;
    }
    if (!selection || !['object', 'decor'].includes(selection.kind)) return false;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const item = this.itemOf(this.scene, selection);
      if (this.vertex != null && isPolygon(item?.points) && item.points[this.vertex]) {
        const step = event.shiftKey ? 10 : 1;
        const [dx, dy] = arrows[event.key];
        const [w, hgt] = this.size;
        const points = clonePoints(item.points);
        points[this.vertex] = [
          Math.max(0, Math.min(w, points[this.vertex][0] + dx * step)),
          Math.max(0, Math.min(hgt, points[this.vertex][1] + dy * step)),
        ];
        this.setPoints(selection, points, `nudge-pt:${selection.index}:${this.vertex}`);
        return true;
      }
      const box = this.boxOf(selection);
      if (!box) return false;
      const step = event.shiftKey ? 10 : 1;
      const [dx, dy] = arrows[event.key];
      this.setBox(selection, [box[0] + dx * step, box[1] + dy * step, box[2], box[3]], `nudge:${selection.kind}:${selection.index}`);
      return true;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.removeActiveVertex()) return true;
      this.removeSelected();
      return true;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      this.duplicateSelected();
      return true;
    }
    return false;
  }

  screenScale() {
    const rect = this.stage.getBoundingClientRect();
    const [w, hgt] = this.size;
    return {
      sx: rect.width > 0 ? rect.width / w : this.scale || 1,
      sy: rect.height > 0 ? rect.height / hgt : this.scale || 1,
    };
  }

  screenDistance(a, b) {
    const { sx, sy } = this.screenScale();
    return Math.hypot((a[0] - b[0]) * sx, (a[1] - b[1]) * sy);
  }

  constrainDraw(point, shift) {
    const [w, hgt] = this.size;
    let x = Math.max(0, Math.min(w, point.x));
    let y = Math.max(0, Math.min(hgt, point.y));
    const last = this.draw?.points?.[this.draw.points.length - 1];
    if (shift && last) {
      if (Math.abs(x - last[0]) > Math.abs(y - last[1])) y = last[1];
      else x = last[0];
    }
    return { x, y };
  }

  syncChrome() {
    const drawing = Boolean(this.draw);
    this.drawActions.hidden = !drawing;
    this.drawBanner.hidden = !drawing;
    this.stage.classList.toggle('is-drawing', drawing);
    const count = this.draw?.points.length ?? 0;
    this.btnDrawClose.disabled = count < 3 || this.store.readOnly;
    const selected = this.itemOf(this.scene, this.store.selection);
    if (drawing) {
      this.hint.textContent = 'Clic : poser un point · clic sur le premier ou Entrée : fermer · Retour arrière : retirer · Échap : abandonner · Maj : aligner';
      this.drawBanner.textContent = count < 3
        ? 'Zone libre · cliquez pour poser les points (3 au minimum)'
        : `Zone libre · ${count} points · Entrée, ou clic sur le premier point, pour fermer`;
    } else if (isPolygon(selected?.points)) {
      this.hint.textContent = 'Glisser un sommet · Alt+clic sur un côté : ajouter un point · sommet choisi puis Suppr : le retirer · Flèches : 1 px';
    } else {
      this.hint.textContent = 'Maj : garder les proportions · Flèches : 1 px (Maj : 10 px) · Clic répété : objet dessous';
    }
  }

  paintShapes() {
    if (!this.shapes || !this.scene) return;
    const [w, hgt] = this.size;
    this.shapes.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    const objects = Array.isArray(this.scene.objects) ? this.scene.objects : [];
    const selection = this.store.selection;
    const nodes = [];
    objects.forEach((object, index) => {
      if (!isPolygon(object?.points)) return;
      const selected = sameSelection(selection, { kind: 'object', index });
      const hasArt = Boolean(object.sprite || object.character);
      const cls = ['poly', selected ? 'is-selected' : '', object.hidden ? 'is-hidden' : '', hasArt ? 'is-hit' : '', hasArt || showsHalo(object) ? '' : 'is-quiet'].filter(Boolean).join(' ');
      nodes.push(svgEl('polygon', {
        class: cls,
        'data-index': String(index),
        points: object.points.map((p) => `${p[0]},${p[1]}`).join(' '),
      }));
    });
    if (this.draw) nodes.push(...this.drawNodes());
    this.shapes.replaceChildren(...nodes);
    this.paintVertices();
    this.markPolyHover();
  }

  drawNodes() {
    const pts = this.draw.points;
    const cursor = this.drawCursor;
    const closable = pts.length >= 3 && cursor && this.screenDistance(pts[0], [cursor.x, cursor.y]) <= 14;
    const live = cursor && !closable ? [...pts, [cursor.x, cursor.y]] : pts;
    const nodes = [];
    if (live.length >= 2) {
      nodes.push(svgEl(live.length >= 3 ? 'polygon' : 'polyline', {
        class: `draw-shape${closable ? ' is-closable' : ''}`,
        points: live.map((p) => `${p[0]},${p[1]}`).join(' '),
      }));
    }
    const radius = 5 / (this.scale || 1);
    pts.forEach((p, index) => {
      const first = index === 0;
      nodes.push(svgEl('circle', {
        cx: p[0],
        cy: p[1],
        r: first ? radius * 1.55 : radius,
        class: `draw-point${first ? ' is-first' : ''}${first && closable ? ' is-closable' : ''}`,
      }));
    });
    return nodes;
  }

  paintVertices() {
    const selection = this.store.selection;
    const object = selection?.kind === 'object' ? this.itemOf(this.scene, selection) : null;
    if (!object || !isPolygon(object.points) || this.store.readOnly || this.draw) {
      this.vertexLayer.replaceChildren();
      return;
    }
    const [w, hgt] = this.size;
    this.vertexLayer.replaceChildren(...object.points.map((p, index) => {
      const el = h('div', {
        class: `poly-handle${this.vertex === index ? ' is-on' : ''}`,
        title: `Sommet ${index + 1}. Suppr pour le retirer.`,
        dataset: { index: String(index) },
      });
      el.style.left = `${(p[0] / w) * 100}%`;
      el.style.top = `${(p[1] / hgt) * 100}%`;
      return el;
    }));
  }

  startDraw() {
    if (this.store.readOnly || !this.scene) return;
    if (this.draw) {
      this.stage.focus({ preventScroll: true });
      return;
    }
    this.drawCursor = null;
    this.vertex = null;
    if (this.store.selection) this.store.setSelection(null);
    this.draw = { points: [] };
    this.syncChrome();
    this.paintShapes();
    this.stage.focus({ preventScroll: true });
  }

  cancelDraw() {
    if (!this.draw) return;
    this.draw = null;
    this.drawCursor = null;
    this.syncChrome();
    this.paintShapes();
    this.stage.focus({ preventScroll: true });
  }

  popDrawPoint() {
    if (!this.draw?.points.length) {
      this.cancelDraw();
      return;
    }
    this.draw.points.pop();
    this.syncChrome();
    this.paintShapes();
  }

  addDrawPoint(point, shift) {
    if (!this.draw) return;
    const cursor = this.constrainDraw(point, shift);
    const x = Math.round(cursor.x);
    const y = Math.round(cursor.y);
    const pts = this.draw.points;
    if (pts.length >= 3 && this.screenDistance(pts[0], [x, y]) <= 14) {
      this.finishDraw();
      return;
    }
    const last = pts[pts.length - 1];
    if (last && last[0] === x && last[1] === y) return;
    pts.push([x, y]);
    this.syncChrome();
    this.paintShapes();
  }

  finishDraw() {
    if (!this.draw || this.draw.points.length < 3 || this.store.readOnly) return;
    const points = clonePoints(this.draw.points);
    const rect = boundsOf(points);
    const objects = Array.isArray(this.scene.objects) ? this.scene.objects : [];
    const object = {
      id: uniqueId('contour', objects.map((o) => o?.id)),
      name: 'Nouvelle zone',
      rect,
      points,
      description: '',
    };
    const index = objects.length;
    this.draw = null;
    this.drawCursor = null;
    if (this.store.update((scene) => {
      if (!Array.isArray(scene.objects)) scene.objects = [];
      scene.objects.push(object);
    }, { source: 'stage' })) {
      this.store.setSelection({ kind: 'object', index });
    } else {
      this.syncChrome();
      this.paintShapes();
    }
  }

  nearestEdge(points, point) {
    const { sx, sy } = this.screenScale();
    let best = null;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const [x, y] = projectSegment(a, b, point.x, point.y);
      const screen = Math.hypot((x - point.x) * sx, (y - point.y) * sy);
      const endA = Math.hypot((a[0] - point.x) * sx, (a[1] - point.y) * sy);
      const endB = Math.hypot((b[0] - point.x) * sx, (b[1] - point.y) * sy);
      if (screen > 18 || endA < 14 || endB < 14) continue;
      if (!best || screen < best.screen) best = { index: i + 1, screen };
    }
    return best;
  }

  insertPointOnEdge(event, point, candidates, base) {
    if (this.store.readOnly) return false;
    const selection = this.store.selection;
    if (selection?.kind !== 'object') return false;
    const top = candidates[0];
    if (top && !sameSelection(top, selection)) return false;
    const item = this.itemOf(this.scene, selection);
    if (!isPolygon(item?.points)) return false;
    const edge = this.nearestEdge(item.points, point);
    if (!edge) return false;
    const [w, hgt] = this.size;
    const points = clonePoints(item.points);
    points.splice(edge.index, 0, [
      Math.max(0, Math.min(w, Math.round(point.x))),
      Math.max(0, Math.min(hgt, Math.round(point.y))),
    ]);
    this.vertex = edge.index;
    this.drag = { ...base, mode: 'vertex', index: edge.index, selection, startPoints: clonePoints(points) };
    this.setPoints(selection, points, base.key);
    this.stage.setPointerCapture(event.pointerId);
    return true;
  }

  moveVertex(drag, dx, dy, shift) {
    const origin = drag.startPoints[drag.index];
    if (!origin) return;
    let x = origin[0] + dx;
    let y = origin[1] + dy;
    if (shift) {
      if (Math.abs(dx) > Math.abs(dy)) y = origin[1];
      else x = origin[0];
    }
    const [w, hgt] = this.size;
    const points = clonePoints(drag.startPoints);
    points[drag.index] = [
      Math.max(0, Math.min(w, Math.round(x))),
      Math.max(0, Math.min(hgt, Math.round(y))),
    ];
    this.setPoints(drag.selection, points, drag.key);
  }

  removeActiveVertex() {
    const selection = this.store.selection;
    const item = selection?.kind === 'object' ? this.itemOf(this.scene, selection) : null;
    if (this.vertex == null || !isPolygon(item?.points)) return false;
    if (item.points.length <= 3) {
      this.selInfo.textContent = 'Un contour garde au moins 3 points';
      return true;
    }
    const points = clonePoints(item.points);
    points.splice(this.vertex, 1);
    this.vertex = Math.min(this.vertex, points.length - 1);
    this.setPoints(selection, points, `vertex-del:${selection.index}:${Date.now()}`);
    return true;
  }

  addObject(kind) {
    if (kind === 'object') {
      this.chooseNewObject();
      return;
    }
    const [w, hgt] = this.size;
    const objects = Array.isArray(this.scene.objects) ? this.scene.objects : [];
    const bw = Math.round(w * 0.12);
    const bh = Math.round(hgt * 0.18);
    const object = {
      id: uniqueId('zone', objects.map((o) => o?.id)),
      name: 'Nouvelle zone',
      rect: [Math.round((w - bw) / 2), Math.round((hgt - bh) / 2), bw, bh],
      description: '',
    };
    const index = objects.length;
    if (this.store.update((scene) => {
      if (!Array.isArray(scene.objects)) scene.objects = [];
      scene.objects.push(object);
    }, { source: 'stage' })) {
      this.store.setSelection({ kind: 'object', index });
    }
  }

  async chooseNewObject() {
    if (this.store.readOnly) return;
    try {
      const path = await this.pickObjectSprite();
      if (path) await this.insertSpriteObject(path);
    } catch (error) {
      toast(error?.message || 'Impossible d’ajouter l’objet.', 'error');
    }
  }

  async pickObjectSprite() {
    const library = this.ctx?.library;
    const sceneId = this.store.id;
    if (!library || !sceneId) {
      toast('La médiathèque est indisponible.', 'error');
      return null;
    }
    let assets;
    try {
      assets = await library.load(sceneId);
    } catch (error) {
      toast(`Médiathèque indisponible : ${error.message}`, 'error');
      return null;
    }
    const images = [...(assets?.scene || []), ...(assets?.shared || [])]
      .filter((item) => item?.type === 'image' && typeof item.path === 'string');

    const filter = h('input', {
      type: 'search',
      class: 'asset-filter',
      placeholder: 'Rechercher un objet ou un fichier…',
      'aria-label': 'Rechercher dans la médiathèque',
    });
    const fileInput = h('input', { type: 'file', accept: IMAGE_ACCEPT, hidden: true, tabindex: '-1' });
    const uploadButton = h('button', { type: 'button', class: 'btn btn-small btn-gold' }, 'Téléverser une image…');
    const list = h('div', { class: 'asset-grid asset-grid-image', role: 'listbox', 'aria-label': 'Images de la médiathèque' });
    let finishChoice = () => {};
    let busy = false;

    const renderGrid = () => {
      const needle = filter.value.trim().toLowerCase();
      const groups = [
        { label: 'Scène', items: images.filter((item) => !item.path.startsWith('@shared/')) },
        { label: 'Partagé', items: images.filter((item) => item.path.startsWith('@shared/')) },
      ];
      const nodes = [];
      for (const group of groups) {
        const items = group.items.filter((item) => {
          const names = namesUsingSprite(this.scene, item.path).join(' ');
          return !needle || `${item.path} ${names}`.toLowerCase().includes(needle);
        });
        if (!items.length) continue;
        nodes.push(h('h3', { class: 'asset-group' }, group.label));
        for (const item of items) {
          const names = namesUsingSprite(this.scene, item.path);
          const placed = names.length ? ' · déjà placé' : '';
          nodes.push(h('button', {
            type: 'button',
            class: 'asset-tile',
            role: 'option',
            title: names.length ? `${names.join(', ')} — ${item.path}` : item.path,
            disabled: busy,
            onclick: () => finishChoice(item.path),
          },
          h('img', { src: assetUrl(sceneId, item.path), alt: '', loading: 'lazy' }),
          h('span', { class: 'asset-name' }, names[0] || labelFromPath(item.path)),
          h('span', { class: 'asset-size' }, `${fileName(item.path)} · ${formatBytes(item.size)}${placed}`)));
        }
      }
      if (!nodes.length) {
        nodes.push(h('p', { class: 'empty' }, needle
          ? 'Aucune image ne correspond.'
          : 'Aucune image pour l’instant. Téléversez-en une pour créer l’objet.'));
      }
      list.replaceChildren(...nodes);
    };

    const setBusy = (next) => {
      busy = next;
      uploadButton.disabled = next;
      uploadButton.textContent = next ? 'Envoi…' : 'Téléverser une image…';
      list.setAttribute('aria-busy', next ? 'true' : 'false');
      renderGrid();
    };

    uploadButton.addEventListener('click', () => { if (!busy) fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file || busy) return;
      setBusy(true);
      try {
        const result = await library.upload(sceneId, file);
        if (result?.path) finishChoice(result.path);
        else setBusy(false);
      } catch (error) {
        toast(`Téléversement impossible : ${error.message}`, 'error');
        setBusy(false);
      }
    });
    filter.addEventListener('input', renderGrid);
    renderGrid();

    return openDialog({
      title: 'Nouvel objet',
      className: 'modal-wide modal-objects',
      body: [
        h('p', { class: 'help object-picker-note' }, 'Choisissez une image déjà dans la médiathèque, ou téléversez-en une nouvelle. Elle devient le calque de l’objet.'),
        h('div', { class: 'object-picker-bar' }, filter, uploadButton, fileInput),
        list,
      ],
      buttons: [{ label: 'Annuler', value: null }],
      onSubmit: () => null,
      setup: (finish) => {
        finishChoice = finish;
        filter.focus();
      },
    });
  }

  async insertSpriteObject(path) {
    const natural = await imageSize(assetUrl(this.store.id, path));
    const objects = Array.isArray(this.scene.objects) ? this.scene.objects : [];
    const stem = slugify(fileName(path).replace(/\.[^.]+$/, '')) || 'objet';
    const object = {
      id: uniqueId(stem, objects.map((o) => o?.id)),
      name: labelFromPath(path),
      rect: fittedRect(this.size, natural),
      sprite: path,
      description: '',
    };
    const index = objects.length;
    if (this.store.update((scene) => {
      if (!Array.isArray(scene.objects)) scene.objects = [];
      scene.objects.push(object);
    }, { source: 'stage' })) {
      this.store.setSelection({ kind: 'object', index });
    }
  }

  addDecor(type) {
    const [w, hgt] = this.size;
    const decor = Array.isArray(this.scene.decor) ? this.scene.decor : [];
    const item = type === 'shadow'
      ? { type: 'shadow', center: [Math.round(w / 2), Math.round(hgt * 0.7)], radius: [120, 30], opacity: 0.5 }
      : {
        id: uniqueId('forme', decor.map((d) => d?.id)),
        type: 'shape',
        rect: [Math.round(w * 0.4), Math.round(hgt * 0.3), Math.round(w * 0.2), Math.round(hgt * 0.3)],
        background: 'radial-gradient(ellipse 50% 50% at 50% 50%,rgba(255,190,110,.3),transparent 70%)',
        blend: 'screen',
      };
    const index = decor.length;
    if (this.store.update((scene) => {
      if (!Array.isArray(scene.decor)) scene.decor = [];
      scene.decor.push(item);
    }, { source: 'stage' })) {
      this.store.setSelection({ kind: 'decor', index });
    }
  }

  moveSelected(direction) {
    const selection = this.store.selection;
    if (!selection || !this.itemOf(this.scene, selection)) return;
    const key = collectionOf(selection.kind);
    const target = selection.index + direction;
    if (target < 0 || target >= this.scene[key].length) return;
    if (this.store.update((scene) => {
      const list = scene[key];
      [list[selection.index], list[target]] = [list[target], list[selection.index]];
    }, { source: 'stage' })) {
      this.store.setSelection({ kind: selection.kind, index: target });
    }
  }

  duplicateSelected() {
    const selection = this.store.selection;
    const item = this.itemOf(this.scene, selection);
    if (!item || this.store.readOnly) return;
    const key = collectionOf(selection.kind);
    const copy = structuredClone(item);
    if (copy.id) copy.id = uniqueId(`${copy.id}-copie`, this.scene[key].map((o) => o?.id));
    const box = getBox(copy, selection.kind);
    if (box) applyBox(copy, selection.kind, [box[0] + 20, box[1] + 20, box[2], box[3]]);
    const index = selection.index + 1;
    if (this.store.update((scene) => scene[key].splice(index, 0, copy), { source: 'stage' })) {
      this.store.setSelection({ kind: selection.kind, index });
    }
  }

  async removeSelected() {
    const selection = this.store.selection;
    const item = this.itemOf(this.scene, selection);
    if (!item || this.store.readOnly) return;
    const label = item.name || item.id || item.type || 'cet élément';
    const ok = await confirmDialog(`Supprimer « ${label} » de la scène ?`, { title: 'Supprimer', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    const key = collectionOf(selection.kind);
    if (this.store.update((scene) => scene[key].splice(selection.index, 1), { source: 'stage' })) {
      this.store.setSelection(null);
    }
    this.stage.focus({ preventScroll: true });
  }
}
