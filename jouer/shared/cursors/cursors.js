// Curseurs des scènes d'exploration. Le point (hot) est le pixel qui clique.
export const CURSORS = [
  { id: 'fleche', label: 'Flèche', hot: [3, 1] },
  { id: 'loupe', label: 'Examiner', hot: [23, 23] },
  { id: 'montrer', label: 'Montrer', hot: [6, 1] },
  { id: 'parler', label: 'Parler', hot: [5, 55] },
  { id: 'marcher', label: 'Marcher', hot: [24, 31] },
  { id: 'gauche', label: 'À gauche', hot: [1, 26] },
  { id: 'droite', label: 'À droite', hot: [63, 27] },
  { id: 'prendre', label: 'Prendre', hot: [33, 40] },
  { id: 'interdit', label: 'Interdit', hot: [3, 1] },
];

const byId = new Map(CURSORS.map((cursor) => [cursor.id, cursor]));

export function isCursor(id) {
  return byId.has(id);
}

export function cursorUrl(id) {
  return new URL(`${byId.has(id) ? id : 'fleche'}.png`, import.meta.url).href;
}

export function cursorCss(id = 'fleche') {
  const cursor = byId.get(id) || byId.get('fleche');
  return `url("${cursorUrl(cursor.id)}") ${cursor.hot[0]} ${cursor.hot[1]}, auto`;
}
