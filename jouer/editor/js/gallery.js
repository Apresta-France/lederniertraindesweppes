import { h, listen } from './dom.js';
import { IMAGE_RE, assetUrl, fileName, formatBytes, formatClock } from './paths.js';
import { toast } from './ui.js';

const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,image/*';

const FILTERS = [
  ['all', 'Toutes'],
  ['scene', 'Scène'],
  ['shared', 'Partagées'],
  ['used', 'Utilisées'],
  ['unused', 'Inutilisées'],
];

function isObj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addUsage(map, path, label, selection) {
  if (typeof path !== 'string' || !IMAGE_RE.test(path)) return;
  let item = map.get(path);
  if (!item) {
    item = { usages: [] };
    map.set(path, item);
  }
  if (!item.usages.some((usage) => usage.label === label)) item.usages.push({ label, selection });
}

/** Image paths referenced by the scene, with a short label and an optional selection to reveal. */
export function collectImageUsages(scene) {
  const map = new Map();
  if (!isObj(scene)) return map;

  addUsage(map, scene.background?.src, 'Fond de la scène', null);

  (Array.isArray(scene.objects) ? scene.objects : []).forEach((object, index) => {
    if (!isObj(object)) return;
    const name = object.name || object.id || `objet ${index + 1}`;
    const selection = { kind: 'object', index };
    addUsage(map, object.sprite, name, selection);
    if (!isObj(object.states)) return;
    for (const [stateName, state] of Object.entries(object.states)) {
      addUsage(map, state?.sprite, `${name} · état « ${stateName} »`, selection);
    }
  });

  for (const [id, panel] of Object.entries(isObj(scene.panels) ? scene.panels : {})) {
    const images = Array.isArray(panel?.image) ? panel.image : [];
    images.forEach((image, index) => {
      const extra = images.length > 1 ? ` · image ${index + 1}` : '';
      addUsage(map, image?.src, `Fiche « ${id} »${extra}`, null);
    });
  }

  (Array.isArray(scene.timeline) ? scene.timeline : []).forEach((item, index) => {
    if (!isObj(item)) return;
    const selection = { kind: 'item', index };
    const when = typeof item.at === 'number' ? formatClock(item.at) : `n° ${index + 1}`;
    if (item.do === 'shot') {
      addUsage(map, item.src, `Plan ${when}`, selection);
      (Array.isArray(item.frames) ? item.frames : []).forEach((frame, frameIndex) => {
        addUsage(map, frame, `Plan ${when} · image ${frameIndex + 1}`, selection);
      });
    }
    if (item.do === 'logo') addUsage(map, item.src, `Logo ${when}`, selection);
  });

  return map;
}

function byName(a, b) {
  return fileName(a.path).localeCompare(fileName(b.path), 'fr', { sensitivity: 'base' })
    || a.path.localeCompare(b.path, 'fr');
}

function sourceOf(path) {
  return path.startsWith('@shared/') ? 'shared' : 'scene';
}

async function copyText(text, label) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.append(area);
  area.focus();
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  if (!copied) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }
  toast(copied ? `${label} copié.` : 'Copie impossible depuis ce navigateur.', copied ? 'success' : 'error', 2200);
}

/**
 * "Galerie" tab: every image of the scene and of the shared library,
 * with search, copy and download.
 */
export class GalleryTab {
  constructor({ store, container, library, onOpen }) {
    this.store = store;
    this.container = container;
    this.library = library;
    this.onOpen = onOpen;
    this.files = [];
    this.dimensions = new Map();
    this.visible = false;
    this.stale = true;
    this.shell = null;
    this.timer = null;
    listen(store, 'load', () => this.onLoad());
    listen(store, 'change', () => this.schedule());
    listen(store, 'readonly', () => this.syncUpload());
    listen(library, 'change', (event) => {
      if (event.detail.sceneId === store.id) this.refreshAssets();
    });
  }

  onLoad() {
    this.files = [];
    this.dimensions.clear();
    this.shell = null;
    this.schedule();
    this.refreshAssets();
  }

  show() {
    this.visible = true;
    this.render();
  }

  hide() {
    this.visible = false;
  }

  schedule() {
    if (!this.visible) {
      this.stale = true;
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), 40);
  }

  async refreshAssets() {
    const id = this.store.id;
    if (!id) return;
    try {
      const assets = await this.library.load(id);
      if (this.store.id !== id) return;
      this.files = [...assets.scene, ...assets.shared].filter((item) => item.type === 'image');
    } catch (error) {
      if (this.store.id !== id) return;
      this.files = [];
      toast(`Liste des images indisponible : ${error.message}`, 'error');
    }
    this.schedule();
  }

  listing() {
    const usages = collectImageUsages(this.store.scene);
    const byPath = new Map();
    for (const file of this.files) {
      byPath.set(file.path, {
        path: file.path,
        size: file.size,
        source: sourceOf(file.path),
        missing: false,
        usages: usages.get(file.path)?.usages || [],
      });
    }
    for (const [path, item] of usages) {
      if (byPath.has(path)) continue;
      byPath.set(path, {
        path,
        size: null,
        source: sourceOf(path),
        missing: true,
        usages: item.usages,
      });
    }
    return [...byPath.values()].sort(byName);
  }

  render() {
    clearTimeout(this.timer);
    this.stale = false;
    if (!this.store.scene) {
      this.shell = null;
      this.container.replaceChildren(h('p', { class: 'empty' }, 'Choisissez une scène dans la liste.'));
      return;
    }
    this.ensureShell();
    this.renderGrid();
    this.syncUpload();
  }

  ensureShell() {
    if (this.shell?.isConnected) return;
    this.search = h('input', {
      type: 'search',
      class: 'gallery-search',
      placeholder: 'Rechercher une image…',
      'aria-label': 'Rechercher une image',
      oninput: () => this.renderGrid(),
    });
    this.filter = h('select', {
      class: 'gallery-filter',
      'aria-label': 'Filtrer les images',
      onchange: () => this.renderGrid(),
    }, FILTERS.map(([value, label]) => h('option', { value }, label)));
    this.count = h('p', { class: 'help gallery-count', 'aria-live': 'polite' });
    this.uploadButton = h('button', {
      type: 'button',
      class: 'btn btn-small',
      title: 'Téléverser une image dans assets/',
      onclick: () => this.fileInput.click(),
    }, 'Téléverser…');
    this.fileInput = h('input', { type: 'file', accept: ACCEPT, hidden: true, tabindex: '-1' });
    this.fileInput.addEventListener('change', () => this.onUpload());
    this.grid = h('div', { class: 'gallery-grid', role: 'list' });
    this.shell = h('div', { class: 'gallery' },
      h('div', { class: 'gallery-bar' },
        this.search,
        this.filter,
        this.count,
        this.uploadButton,
        this.fileInput),
      this.grid);
    this.container.replaceChildren(this.shell);
  }

  syncUpload() {
    if (!this.uploadButton) return;
    const locked = !this.store.scene || this.store.readOnly;
    this.uploadButton.disabled = locked;
    this.uploadButton.title = this.store.readOnly
      ? 'Scène en lecture seule'
      : 'Téléverser une image dans assets/';
  }

  async onUpload() {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    const id = this.store.id;
    if (!file || !id) return;
    this.uploadButton.disabled = true;
    this.uploadButton.textContent = 'Envoi…';
    try {
      const result = await this.library.upload(id, file);
      if (result && this.store.id === id) toast(`Image téléversée : ${result.path}`, 'success');
    } catch (error) {
      toast(`Téléversement impossible : ${error.message}`, 'error');
    } finally {
      this.uploadButton.textContent = 'Téléverser…';
      this.syncUpload();
    }
  }

  visibleImages() {
    const needle = (this.search?.value || '').trim().toLowerCase();
    const filter = this.filter?.value || 'all';
    return this.listing().filter((image) => {
      if (filter === 'scene' && image.source !== 'scene') return false;
      if (filter === 'shared' && image.source !== 'shared') return false;
      if (filter === 'used' && !image.usages.length) return false;
      if (filter === 'unused' && image.usages.length) return false;
      if (!needle) return true;
      const hay = [image.path, fileName(image.path), ...image.usages.map((usage) => usage.label)].join('\n').toLowerCase();
      return hay.includes(needle);
    });
  }

  renderGrid() {
    if (!this.grid) return;
    const images = this.listing();
    const shown = this.visibleImages();
    const noun = images.length > 1 ? 'images' : 'image';
    this.count.textContent = images.length
      ? (shown.length === images.length ? `${images.length} ${noun}` : `${shown.length} sur ${images.length}`)
      : 'Aucune image';
    const top = this.grid.scrollTop;
    this.grid.replaceChildren(...(shown.length
      ? shown.map((image) => this.card(image))
      : [h('p', { class: 'empty gallery-empty' }, images.length ? 'Aucune image ne correspond.' : 'Aucune image dans cette scène ni dans le dossier partagé.')]));
    this.grid.scrollTop = top;
  }

  metaLine(image) {
    const parts = [];
    if (image.size != null) parts.push(formatBytes(image.size));
    const dims = this.dimensions.get(image.path);
    if (dims) parts.push(dims);
    parts.push(image.usages.length
      ? `${image.usages.length} usage${image.usages.length > 1 ? 's' : ''}`
      : 'Pas utilisée');
    return parts.join(' · ');
  }

  card(image) {
    const name = fileName(image.path);
    const url = image.missing ? '' : assetUrl(this.store.id, image.path);
    const meta = h('p', { class: 'help gallery-meta' }, this.metaLine(image));
    const thumb = h('button', {
      type: 'button',
      class: `gallery-thumb${image.missing ? ' is-missing' : ''}`,
      'aria-label': `Agrandir ${name}`,
      onclick: () => this.openLightbox(image),
    });
    if (url) {
      const img = h('img', { src: url, alt: '', loading: 'lazy' });
      const rememberSize = () => {
        if (!img.naturalWidth) return;
        this.dimensions.set(image.path, `${img.naturalWidth} × ${img.naturalHeight}`);
        meta.textContent = this.metaLine(image);
      };
      img.addEventListener('load', rememberSize);
      if (img.complete) rememberSize();
      img.addEventListener('error', () => thumb.classList.add('is-missing'));
      thumb.append(img);
    } else {
      thumb.append(h('span', { class: 'gallery-missing' }, 'Introuvable'));
    }
    const badge = image.missing ? 'Introuvable' : (image.source === 'shared' ? 'Partagé' : 'Scène');
    const badgeClass = image.missing ? 'chip-warn' : (image.source === 'shared' ? 'chip-zone' : 'chip-sprite');
    thumb.append(h('span', { class: `chip gallery-badge ${badgeClass}` }, badge));

    return h('article', { class: 'gallery-card', role: 'listitem' },
      thumb,
      h('p', { class: 'gallery-name', title: image.path }, name),
      h('p', { class: 'gallery-path', title: image.path }, image.path),
      meta,
      h('div', { class: 'gallery-actions' },
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          title: `Copier le chemin ${image.path}`,
          onclick: () => copyText(image.path, 'Chemin'),
        }, 'Copier'),
        image.missing
          ? h('button', { type: 'button', class: 'btn btn-small', disabled: true }, 'Télécharger')
          : h('a', { class: 'btn btn-small', href: url, download: name }, 'Télécharger')));
  }

  openLightbox(image) {
    const name = fileName(image.path);
    const url = image.missing ? '' : assetUrl(this.store.id, image.path);
    const titleId = 'gallery-lightbox-title';
    const dialog = h('dialog', { class: 'modal modal-wide gallery-lightbox', 'aria-labelledby': titleId });
    const preview = h('div', { class: 'gallery-lightbox-preview' });
    if (url) {
      const img = h('img', { src: url, alt: name });
      img.addEventListener('error', () => preview.replaceChildren(h('p', { class: 'empty' }, 'Image introuvable.')));
      preview.append(img);
    } else {
      preview.append(h('p', { class: 'empty' }, 'Fichier introuvable sur le disque.'));
    }
    const pathField = h('input', {
      type: 'text',
      class: 'gallery-path-field mono',
      value: image.path,
      readOnly: true,
      'aria-label': 'Chemin de l’image',
      onclick: () => pathField.select(),
    });
    const usages = image.usages.length
      ? h('ul', { class: 'gallery-usages' }, image.usages.map((usage) => h('li', null,
        h('span', null, usage.label),
        usage.selection
          ? h('button', {
            type: 'button',
            class: 'btn btn-small',
            onclick: () => {
              dialog.close();
              this.onOpen?.(usage.selection);
            },
          }, 'Afficher')
          : null)))
      : h('p', { class: 'help' }, 'Cette image n’est pas encore utilisée dans la scène.');

    const close = () => dialog.close();
    dialog.append(
      h('h2', { id: titleId, class: 'modal-title' }, name),
      h('div', { class: 'modal-body' },
        preview,
        pathField,
        h('p', { class: 'help gallery-lightbox-meta' }, this.metaLine(image)),
        h('p', { class: 'sound-kicker' }, 'Dans la scène'),
        usages),
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => copyText(image.path, 'Chemin') }, 'Copier le chemin'),
        h('button', { type: 'button', class: 'btn', onclick: () => copyText(name, 'Nom') }, 'Copier le nom'),
        image.missing
          ? h('button', { type: 'button', class: 'btn', disabled: true }, 'Télécharger')
          : h('a', { class: 'btn', href: url, download: name }, 'Télécharger'),
        image.missing
          ? null
          : h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, 'Ouvrir'),
        h('button', { type: 'button', class: 'btn btn-gold', onclick: close }, 'Fermer')));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }
}
