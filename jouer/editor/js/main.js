import { Api } from './api.js';
import { Store } from './store.js';
import { AssetLibrary } from './asset-picker.js';
import { SceneList } from './scene-list.js';
import { Inspector } from './inspector.js';
import { SceneProps } from './scene-props.js';
import { JsonTab } from './json-tab.js';
import { SoundsTab } from './sounds.js';
import { ExploreEditor } from './explore-editor.js';
import { CinematicEditor } from './cinematic-editor.js';
import { CharacterEditor } from './character-editor.js';
import { validateScene } from './validation.js';
import { forgetCharacter, loadItems } from './data.js';
import { h, debounce, isFormField } from './dom.js';
import { choiceDialog, confirmDialog, toast } from './ui.js';

const HEARTBEAT_MS = 30000;
const LIST_REFRESH_MS = 60000;

const body = document.body;
const api = new Api(body.dataset.api || 'api.php', body.dataset.csrf || '');
const store = new Store();
const library = new AssetLibrary(api);

const $ = (id) => document.getElementById(id);
const ui = {
  title: $('game-title'),
  current: $('current-scene'),
  status: $('save-status'),
  undo: $('btn-undo'),
  redo: $('btn-redo'),
  save: $('btn-save'),
  test: $('btn-test'),
  characters: $('btn-characters'),
  banner: $('banner'),
  newScene: $('btn-new-scene'),
  tabs: [...document.querySelectorAll('[role="tab"]')],
  panels: { visual: $('panel-visual'), scene: $('panel-scene'), sounds: $('panel-sounds'), json: $('panel-json') },
  validation: $('validation'),
  validationSummary: $('validation-summary'),
  validationList: $('validation-list'),
};

const state = {
  list: null,
  editor: null,
  editorType: null,
  saving: false,
  tab: 'visual',
  lockState: 'none',
  lockForced: false,
  readOnlyByLock: false,
  lockTimer: null,
  bannerKind: null,
  assets: null,
  items: null,
};

const ctx = {
  library,
  previewDock: $('preview-dock'),
  characters: () => (state.list?.game?.characters || []).map((id) => [id, id]),
  sceneOptions: () => (state.list?.scenes || [])
    .filter((s) => !s.missing && s.id !== store.id)
    .map((s) => [s.id, `${s.label || s.title || s.id} (${s.id})`]),
  resort: (index) => state.editor?.resort?.(index),
  openCharacters: (id) => characterEditor.open(id),
};

const characterEditor = new CharacterEditor({
  api,
  getGame: () => state.list?.game,
  onChange: (id) => {
    forgetCharacter(id);
    if (state.editorType === 'explore') mountEditor();
    loadList({ quiet: true });
  },
});

const sceneList = new SceneList({
  container: $('scene-list'),
  api,
  onOpen: (id) => openScene(id),
  onReload: () => loadList(),
});
new Inspector({ store, container: $('inspector'), ctx });
new SceneProps({ store, container: ui.panels.scene, ctx });
const jsonTab = new JsonTab({ store, container: ui.panels.json });
const soundsTab = new SoundsTab({ store, container: ui.panels.sounds, library });

function showBanner(kind, message, actions = [], tone = 'alert') {
  state.bannerKind = kind;
  ui.banner.className = `banner banner-${tone}`;
  ui.banner.replaceChildren(
    h('span', null, message),
    ...actions.map((action) => (action.href
      ? h('a', { class: 'btn btn-small', href: action.href, target: '_blank', rel: 'noopener' }, action.label)
      : h('button', { type: 'button', class: 'btn btn-small', onclick: action.onClick }, action.label))),
  );
  ui.banner.hidden = false;
}

function hideBanner(kind) {
  if (kind && state.bannerKind !== kind) return;
  state.bannerKind = null;
  ui.banner.hidden = true;
  ui.banner.replaceChildren();
}

api.onUnauthorized = () => showBanner('session',
  'Votre session a expiré. Reconnectez-vous dans un autre onglet puis réessayez : vos modifications restent dans cette page.',
  [{ label: 'Se reconnecter', href: '/admin/connexion' }]);

function updateStatus() {
  const scene = store.scene;
  const dirty = store.dirty;
  let text = '';
  let tone = '';
  if (scene) {
    if (state.saving) [text, tone] = ['Enregistrement…', 'busy'];
    else if (store.readOnly) [text, tone] = ['Lecture seule', 'readonly'];
    else if (dirty) [text, tone] = ['Modifications non enregistrées', 'dirty'];
    else [text, tone] = ['Enregistré', 'saved'];
  }
  ui.status.textContent = text;
  ui.status.dataset.tone = tone;
  ui.current.textContent = scene ? `${scene.title || store.id} (${store.id})` : 'aucune';
  ui.undo.disabled = !store.canUndo;
  ui.redo.disabled = !store.canRedo;
  ui.save.disabled = !scene || store.readOnly || state.saving;
  ui.test.disabled = !scene;
  document.title = `${dirty ? '• ' : ''}${scene ? `${scene.title || store.id} — ` : ''}Éditeur de scènes`;
}

function mountEditor() {
  state.editor?.destroy();
  state.editor = null;
  const type = store.scene?.type ?? null;
  state.editorType = type;
  const container = ui.panels.visual;
  if (type === 'explore') state.editor = new ExploreEditor({ store, container, ctx });
  else if (type === 'cinematic') state.editor = new CinematicEditor({ store, container, ctx });
  else container.replaceChildren(h('p', { class: 'empty' }, store.scene ? `Type de scène inconnu : « ${type} ». Corrigez-le dans l’onglet JSON.` : 'Choisissez une scène dans la liste.'));
}

function loadIntoStore(id, scene, rev) {
  state.editor?.destroy();
  state.editor = null;
  store.load(id, scene, rev);
  mountEditor();
}

async function loadList({ quiet = false } = {}) {
  try {
    const data = await api.list();
    state.list = data;
    sceneList.setData(data);
    ui.title.textContent = data.game?.title || 'Le Dernier Train des Weppes';
    if (!state.items) {
      loadItems(data.game).then((items) => {
        state.items = items;
        runValidation();
      });
    }
    runValidation();
  } catch (error) {
    if (!quiet) toast(`Liste des scènes indisponible : ${error.message}`, 'error', 8000);
  }
}

async function openScene(id, { skipDirtyCheck = false } = {}) {
  if (id === store.id && store.scene) return;
  if (!skipDirtyCheck && store.dirty) {
    const ok = await confirmDialog(`Les modifications de « ${store.scene.title || store.id} » ne sont pas enregistrées. Les abandonner ?`, {
      title: 'Modifications non enregistrées',
      confirmLabel: 'Abandonner mes modifications',
      danger: true,
    });
    if (!ok) {
      if (store.id) window.history.replaceState(null, '', `#${encodeURIComponent(store.id)}`);
      return;
    }
  }
  let data;
  try {
    data = await api.scene(id);
  } catch (error) {
    toast(`Impossible d’ouvrir « ${id} » : ${error.message}`, 'error', 8000);
    return;
  }
  await releaseLock();
  store.setReadOnly(false);
  state.readOnlyByLock = false;
  state.assets = null;
  loadIntoStore(id, data.scene, data.rev);
  sceneList.setCurrent(id);
  window.history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  loadAssetsForValidation();
  await acquireLock();
  loadList({ quiet: true });
}

async function acquireLock() {
  const id = store.id;
  state.lockForced = false;
  try {
    const result = await api.lock(id, false);
    if (store.id === id) applyLock(result, true);
  } catch (error) {
    toast(`Présence non signalée : ${error.message}`, 'error');
  }
  clearInterval(state.lockTimer);
  state.lockTimer = setInterval(heartbeat, HEARTBEAT_MS);
}

function applyLock(result, first) {
  if (result.mine) {
    state.lockState = 'mine';
    hideBanner('lock');
    return;
  }
  state.lockState = 'other';
  const who = result.lock?.user || 'Quelqu’un';
  if (first || store.readOnly) {
    store.setReadOnly(true);
    state.readOnlyByLock = true;
    showBanner('lock', `${who} modifie cette scène en ce moment. Elle est ouverte en lecture seule.`, [{ label: 'Modifier quand même', onClick: forceEdit }]);
  } else {
    showBanner('lock', `${who} modifie aussi cette scène : vos enregistrements risquent d’entrer en conflit.`, [], 'warn');
  }
}

async function heartbeat() {
  const id = store.id;
  if (!id) return;
  try {
    const result = await api.lock(id, state.lockForced);
    if (store.id !== id) return;
    if (result.mine && store.readOnly && state.readOnlyByLock) {
      const data = await api.scene(id);
      state.readOnlyByLock = false;
      store.setReadOnly(false);
      loadIntoStore(id, data.scene, data.rev);
      hideBanner('lock');
      state.lockState = 'mine';
      toast('La scène est libre : vous pouvez maintenant la modifier (version à jour chargée).', 'success', 6000);
      return;
    }
    applyLock(result, false);
  } catch {
    // A missed heartbeat only delays presence information.
  }
}

async function forceEdit() {
  const id = store.id;
  try {
    const result = await api.lock(id, true);
    const data = await api.scene(id);
    state.lockForced = true;
    state.readOnlyByLock = false;
    store.setReadOnly(false);
    loadIntoStore(id, data.scene, data.rev);
    state.lockState = result.mine ? 'mine' : 'other';
    hideBanner('lock');
    loadList({ quiet: true });
    toast('Édition activée. Attention : l’autre personne peut encore enregistrer.', 'info', 6000);
  } catch (error) {
    toast(`Impossible de prendre la main : ${error.message}`, 'error');
  }
}

async function releaseLock() {
  clearInterval(state.lockTimer);
  state.lockTimer = null;
  const id = store.id;
  if (id && state.lockState === 'mine') {
    try {
      await api.unlock(id);
    } catch {
      // The lock expires on its own after 90 s.
    }
  }
  state.lockState = 'none';
  state.lockForced = false;
  hideBanner('lock');
}

async function save(force = false) {
  if (!store.scene || state.saving) return;
  if (store.readOnly) {
    toast('Scène en lecture seule : cliquez sur « Modifier quand même » pour pouvoir enregistrer.', 'error');
    return;
  }
  const id = store.id;
  const snapshot = structuredClone(store.scene);
  const json = JSON.stringify(snapshot);
  state.saving = true;
  updateStatus();
  let conflict = null;
  try {
    const result = await api.save(id, snapshot, store.rev, force);
    if (store.id === id) store.markSaved(result.rev, json);
    toast('Scène enregistrée.', 'success', 2500);
    loadList({ quiet: true });
  } catch (error) {
    if (error.status === 409 && error.data?.scene) conflict = error.data;
    else toast(`Enregistrement impossible : ${error.message}`, 'error', 8000);
  } finally {
    state.saving = false;
    updateStatus();
  }
  if (conflict) await resolveConflict(conflict);
}

async function resolveConflict(data) {
  const by = data.savedBy ? ` Dernier enregistrement : ${data.savedBy.user}, le ${data.savedBy.at.replace(' ', ' à ')}.` : '';
  const choice = await choiceDialog({
    title: 'Conflit d’enregistrement',
    message: `Cette scène a été modifiée par quelqu’un d’autre depuis son ouverture.${by}`,
    choices: [
      { label: 'Recharger leur version (perdre mes modifications)', value: 'reload', kind: 'danger' },
      { label: 'Écraser avec ma version', value: 'overwrite', kind: 'gold' },
      { label: 'Annuler', value: null, autofocus: true },
    ],
  });
  if (choice === 'reload') {
    loadIntoStore(store.id, data.scene, data.rev);
    toast('Version enregistrée rechargée.', 'info');
  } else if (choice === 'overwrite') {
    await save(true);
  }
}

// Sans modification locale, on teste la dernière version enregistrée : le fichier a pu changer sur le disque.
// L'onglet est ouvert avant l'attente réseau, sinon le navigateur le bloque.
async function testScene() {
  if (!store.scene) return;
  const id = store.id;
  const tab = window.open('', '_blank');
  if (!store.dirty) {
    try {
      const data = await api.scene(id);
      if (store.id === id && !store.dirty && data.rev !== store.rev) {
        loadIntoStore(id, data.scene, data.rev);
        toast('La scène avait changé sur le disque : version à jour chargée.', 'info');
      }
    } catch {
      // Hors ligne : on teste la version en mémoire.
    }
  }
  try {
    localStorage.setItem(`ldtw_preview:${id}`, JSON.stringify(store.scene));
  } catch {
    tab?.close();
    toast('Impossible de stocker le brouillon dans le navigateur (stockage plein ?).', 'error');
    return;
  }
  const url = `../?scene=${encodeURIComponent(id)}&preview=1`;
  if (tab) tab.location.href = url;
  else window.open(url, '_blank');
}

function loadAssetsForValidation() {
  const id = store.id;
  if (!id) return;
  library.load(id).then((assets) => {
    if (store.id !== id) return;
    state.assets = new Set([...assets.scene, ...assets.shared].map((a) => a.path));
    runValidation();
  }).catch(() => {
    state.assets = null;
  });
}

const runValidation = debounce(() => {
  if (!store.scene) {
    ui.validationSummary.textContent = 'Vérifications';
    ui.validationList.replaceChildren();
    ui.validation.dataset.state = '';
    return;
  }
  const warnings = validateScene(store.scene, {
    sceneIds: new Set((state.list?.scenes || []).filter((s) => !s.missing).map((s) => s.id)),
    assets: state.assets,
    items: state.items,
    characters: state.list?.game?.characters || [],
  });
  const warnCount = warnings.filter((w) => w.level === 'warn').length;
  const infoCount = warnings.length - warnCount;
  ui.validationSummary.textContent = warnings.length
    ? `Vérifications : ${warnCount} avertissement(s), ${infoCount} remarque(s)`
    : 'Vérifications : aucun problème détecté';
  ui.validation.dataset.state = warnCount ? 'warn' : (infoCount ? 'info' : 'ok');
  ui.validationList.replaceChildren(...warnings.map((w) => {
    const icon = h('span', { class: `vl-icon vl-${w.level}`, 'aria-label': w.level === 'warn' ? 'Avertissement' : 'Remarque' }, w.level === 'warn' ? '⚠' : 'ℹ');
    return h('li', { class: `vl-${w.level}` }, w.selection
      ? h('button', { type: 'button', class: 'vl-link', onclick: () => openWarning(w) }, icon, w.message)
      : h('span', null, icon, w.message));
  }));
}, 300);

function openWarning(warning) {
  if (warning.selection?.kind === 'sound') {
    selectTab('sounds');
    soundsTab.select(warning.selection.path);
    return;
  }
  selectTab('visual');
  store.setSelection(warning.selection);
}

function selectTab(name) {
  state.tab = name;
  for (const tab of ui.tabs) {
    const selected = tab.getAttribute('aria-controls') === `panel-${name}`;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const [key, panel] of Object.entries(ui.panels)) panel.hidden = key !== name;
  if (name === 'json') jsonTab.show();
  else jsonTab.hide();
  if (name === 'sounds') soundsTab.show();
  else soundsTab.hide();
}

ui.tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab.getAttribute('aria-controls').replace('panel-', '')));
  tab.addEventListener('keydown', (event) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = ui.tabs[(index + delta + ui.tabs.length) % ui.tabs.length];
    next.focus();
    next.click();
  });
});

ui.undo.addEventListener('click', () => store.undo());
ui.redo.addEventListener('click', () => store.redo());
ui.save.addEventListener('click', () => save());
ui.test.addEventListener('click', testScene);
ui.characters.addEventListener('click', () => characterEditor.open());
ui.newScene.addEventListener('click', () => sceneList.createScene());

store.addEventListener('load', () => {
  updateStatus();
  runValidation();
});
store.addEventListener('change', () => {
  if (store.scene && store.scene.type !== state.editorType) mountEditor();
  updateStatus();
  runValidation();
});
store.addEventListener('readonly', updateStatus);
store.addEventListener('saved', updateStatus);
store.addEventListener('select', updateStatus);
library.addEventListener('change', (event) => {
  if (event.detail.sceneId === store.id) loadAssetsForValidation();
});

document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (mod && key === 's') {
    event.preventDefault();
    save();
    return;
  }
  const inField = isFormField(event.target);
  if (mod && !inField && !event.altKey) {
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      store.undo();
      return;
    }
    if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      store.redo();
      return;
    }
  }
  if (inField || event.target.closest?.('[data-own-keys]') || state.tab !== 'visual') return;
  if (event.target !== document.body && !ui.panels.visual.contains(event.target)) return;
  if (state.editor?.handleKey(event)) event.preventDefault();
});

window.addEventListener('beforeunload', (event) => {
  if (!store.dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

window.addEventListener('pagehide', () => {
  if (store.id && state.lockState === 'mine') api.unlockBeacon(store.id);
});

window.addEventListener('hashchange', () => {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (id && id !== store.id) openScene(id);
});

setInterval(() => {
  if (document.visibilityState === 'visible') loadList({ quiet: true });
}, LIST_REFRESH_MS);

(async () => {
  updateStatus();
  await loadList();
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (id && state.list?.scenes.some((s) => s.id === id && !s.missing)) openScene(id);
})();
