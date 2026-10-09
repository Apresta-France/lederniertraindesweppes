import { ROOT, sceneBase, characterBase, resolve } from './paths.js';

const cache = new Map();

export function loadJSON(url) {
  const key = String(url);
  if (!cache.has(key)) {
    cache.set(key, fetch(key, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`Chargement impossible (${r.status}) : ${key}`);
      return r.json();
    }));
  }
  return cache.get(key).then(d => structuredClone(d));
}

export const PREVIEW_KEY = id => 'ldtw_preview:' + id;

// En aperçu depuis l'éditeur, la scène testée vient du brouillon non enregistré.
export async function loadScene(id, { preview = false } = {}) {
  if (preview) {
    try {
      const draft = localStorage.getItem(PREVIEW_KEY(id));
      if (draft) return JSON.parse(draft);
    } catch (e) { /* brouillon illisible : on charge la version enregistrée */ }
  }
  return loadJSON(sceneBase(id) + 'scene.json');
}

export async function loadGameData() {
  const game = await loadJSON(new URL('game.json', ROOT));
  const [items, characters] = await Promise.all([
    game.items ? loadJSON(resolve(game.items, ROOT)).catch(() => ({})) : {},
    Promise.all((game.characters || []).map(async id => {
      const base = characterBase(id);
      const c = await loadJSON(base + 'character.json');
      return [id, { ...c, base }];
    })),
  ]);
  return { game, items, characters: Object.fromEntries(characters) };
}

export function preloadImages(urls, timeout = 4000) {
  const jobs = urls.filter(Boolean).map(src => new Promise(res => {
    const im = new Image();
    im.onload = im.onerror = () => res();
    im.src = src;
  }));
  return Promise.race([Promise.all(jobs), new Promise(res => setTimeout(res, timeout))]);
}
