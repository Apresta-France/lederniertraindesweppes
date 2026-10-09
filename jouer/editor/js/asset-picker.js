import { h, uid } from './dom.js';
import { assetUrl, fileName, formatBytes } from './paths.js';
import { confirmDialog, openDialog, toast } from './ui.js';

const ACCEPT = {
  image: '.png,.jpg,.jpeg,.webp,.gif,image/*',
  audio: '.mp3,.ogg,.wav,.m4a,audio/*',
};

export class AssetLibrary extends EventTarget {
  constructor(api) {
    super();
    this.api = api;
    this.cache = new Map();
  }

  load(sceneId) {
    if (!this.cache.has(sceneId)) {
      const promise = this.api.assets(sceneId).catch((error) => {
        this.cache.delete(sceneId);
        throw error;
      });
      this.cache.set(sceneId, promise);
    }
    return this.cache.get(sceneId);
  }

  invalidate(sceneId) {
    this.cache.delete(sceneId);
    this.dispatchEvent(new CustomEvent('change', { detail: { sceneId } }));
  }

  async upload(sceneId, file) {
    try {
      return await this.api.upload(sceneId, file, false);
    } catch (error) {
      if (error.status !== 409 || !error.data?.exists) throw error;
      const replace = await confirmDialog(`Le fichier « ${fileName(error.data.path)} » existe déjà dans la scène. Le remplacer ?`, {
        title: 'Fichier existant',
        confirmLabel: 'Remplacer',
        danger: true,
      });
      if (!replace) return null;
      return this.api.upload(sceneId, file, true);
    } finally {
      this.invalidate(sceneId);
    }
  }
}

function groupsFor(assets, kind) {
  return [
    { label: 'Scène', items: assets.scene.filter((a) => a.type === kind) },
    { label: 'Partagé', items: assets.shared.filter((a) => a.type === kind) },
  ];
}

/**
 * Select + browse dialog + upload button for an image or audio path.
 * Returns {el, control, setValue, setDisabled, destroy}.
 */
export function createAssetField({ library, sceneId, kind, label, help = '', optional = true, onChange }) {
  const id = uid('asset');
  const helpId = `${id}-help`;
  let value = '';
  let disabled = false;
  let assets = null;

  const select = h('select', { id, 'aria-describedby': help ? helpId : null });
  const browse = h('button', { type: 'button', class: 'btn btn-small', title: 'Parcourir les fichiers' }, 'Parcourir…');
  const uploadButton = h('button', { type: 'button', class: 'btn btn-small', title: 'Téléverser un fichier dans assets/' }, 'Téléverser…');
  const fileInput = h('input', { type: 'file', accept: ACCEPT[kind], hidden: true, tabindex: '-1' });
  const preview = h('div', { class: `asset-preview asset-preview-${kind}` });
  const el = h('div', { class: 'field field-asset' },
    h('label', { for: id }, label),
    h('div', { class: 'asset-row' }, select, browse, uploadButton, fileInput),
    preview,
    help ? h('p', { class: 'help', id: helpId }, help) : null);

  function commit(path) {
    value = path;
    renderOptions();
    renderPreview();
    onChange(path === '' && optional ? undefined : path);
  }

  function renderOptions() {
    const options = [h('option', { value: '' }, optional ? '(aucun)' : '(à choisir)')];
    let known = value === '';
    if (assets) {
      for (const group of groupsFor(assets, kind)) {
        if (!group.items.length) continue;
        options.push(h('optgroup', { label: group.label },
          group.items.map((item) => {
            if (item.path === value) known = true;
            return h('option', { value: item.path }, item.path.replace(/^@shared\//, ''));
          })));
      }
    }
    if (!known) options.splice(1, 0, h('option', { value }, `${value} ${assets ? '(introuvable)' : ''}`.trim()));
    select.replaceChildren(...options);
    select.value = value;
    select.classList.toggle('is-missing', Boolean(assets) && !known);
  }

  function renderPreview() {
    preview.replaceChildren();
    if (!value) return;
    const url = assetUrl(sceneId, value);
    if (kind === 'image') {
      const img = h('img', { src: url, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => preview.replaceChildren(h('span', { class: 'asset-missing' }, 'Image introuvable')));
      preview.append(img);
    } else {
      preview.append(h('audio', { src: url, controls: true, preload: 'none' }));
    }
  }

  async function refreshAssets() {
    try {
      assets = await library.load(sceneId);
    } catch (error) {
      assets = null;
      toast(`Liste des fichiers indisponible : ${error.message}`, 'error');
    }
    renderOptions();
  }

  async function openBrowser() {
    if (!assets) await refreshAssets();
    if (!assets) return;
    const filter = h('input', { type: 'search', placeholder: 'Filtrer…', 'aria-label': 'Filtrer les fichiers', class: 'asset-filter' });
    const list = h('div', { class: `asset-grid asset-grid-${kind}` });
    let resolveChoice = () => {};
    const renderGrid = () => {
      const needle = filter.value.trim().toLowerCase();
      list.replaceChildren();
      for (const group of groupsFor(assets, kind)) {
        const items = group.items.filter((item) => item.path.toLowerCase().includes(needle));
        if (!items.length) continue;
        list.append(h('h3', { class: 'asset-group' }, group.label));
        for (const item of items) {
          const pick = h('button', {
            type: 'button',
            class: `asset-tile${item.path === value ? ' is-current' : ''}`,
            title: item.path,
            onclick: () => resolveChoice(item.path),
          },
          kind === 'image' ? h('img', { src: assetUrl(sceneId, item.path), alt: '', loading: 'lazy' }) : null,
          h('span', { class: 'asset-name' }, fileName(item.path)),
          h('span', { class: 'asset-size' }, formatBytes(item.size)));
          list.append(kind === 'audio'
            ? h('div', { class: 'asset-audio-row' }, pick, h('audio', { src: assetUrl(sceneId, item.path), controls: true, preload: 'none' }))
            : pick);
        }
      }
      if (!list.children.length) list.append(h('p', { class: 'empty' }, 'Aucun fichier.'));
    };
    filter.addEventListener('input', renderGrid);
    renderGrid();
    const choice = await openDialog({
      title: kind === 'image' ? 'Choisir une image' : 'Choisir un son',
      className: 'modal-wide',
      body: [filter, list],
      buttons: [{ label: 'Fermer', value: null }],
      setup: (finish) => {
        resolveChoice = finish;
        filter.focus();
      },
    });
    if (typeof choice === 'string') commit(choice);
  }

  select.addEventListener('change', () => commit(select.value));
  browse.addEventListener('click', openBrowser);
  uploadButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    uploadButton.disabled = true;
    uploadButton.textContent = 'Envoi…';
    try {
      const result = await library.upload(sceneId, file);
      if (result) {
        await refreshAssets();
        commit(result.path);
        toast(`Fichier téléversé : ${result.path}`, 'success');
      }
    } catch (error) {
      toast(`Téléversement impossible : ${error.message}`, 'error');
    } finally {
      uploadButton.textContent = 'Téléverser…';
      uploadButton.disabled = disabled;
    }
  });

  const onLibraryChange = (event) => {
    if (event.detail.sceneId === sceneId) refreshAssets();
  };
  library.addEventListener('change', onLibraryChange);
  refreshAssets();

  return {
    el,
    control: select,
    setValue(next) {
      const normalized = typeof next === 'string' ? next : '';
      if (normalized === value && select.options.length) return;
      value = normalized;
      renderOptions();
      renderPreview();
    },
    setDisabled(next) {
      disabled = next;
      select.disabled = next;
      browse.disabled = next;
      uploadButton.disabled = next;
    },
    destroy() {
      library.removeEventListener('change', onLibraryChange);
    },
  };
}
