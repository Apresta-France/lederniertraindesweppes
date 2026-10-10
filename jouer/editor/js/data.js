import { characterUrl } from './paths.js';

const characters = new Map();
let itemsPromise = null;

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export function loadCharacter(id) {
  if (!characters.has(id)) characters.set(id, fetchJson(characterUrl(id, 'character.json')));
  return characters.get(id);
}

export function forgetCharacter(id) {
  characters.delete(id);
}

export function characterIdleUrl(id, data) {
  const idle = data?.sprites?.idle;
  const path = Array.isArray(idle) ? idle[0] : idle;
  return typeof path === 'string' && path ? characterUrl(id, path) : '';
}

export function loadItems(game) {
  if (!itemsPromise) {
    const path = typeof game?.items === 'string' && !game.items.includes('..') ? game.items : 'shared/items/items.json';
    itemsPromise = fetchJson(`../${path}`).then((data) => (data && typeof data === 'object' ? data : {}));
  }
  return itemsPromise;
}
