// Curseurs des scènes d'exploration. Le point (hot) est le pixel qui clique.
// size : largeur et hauteur du dessin, pour poser l'infobulle hors de ce dessin.
export const CURSORS = [
  { id: 'fleche', label: 'Flèche', hot: [3, 1], size: [46, 64] },
  { id: 'loupe', label: 'Examiner', hot: [23, 23], size: [64, 64] },
  { id: 'montrer', label: 'Montrer', hot: [6, 1], size: [60, 64] },
  { id: 'parler', label: 'Parler', hot: [5, 55], size: [64, 56] },
  { id: 'marcher', label: 'Marcher', hot: [24, 31], size: [49, 64] },
  { id: 'gauche', label: 'À gauche', hot: [1, 26], size: [64, 53] },
  { id: 'droite', label: 'À droite', hot: [63, 27], size: [64, 54] },
  { id: 'prendre', label: 'Prendre', hot: [33, 40], size: [64, 62] },
  { id: 'interdit', label: 'Interdit', hot: [3, 1], size: [62, 64] },
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

// Pixels du dessin autour du point qui clique : left/up vers le haut-gauche du fichier.
export function cursorExtent(id) {
  const cursor = byId.get(id) || byId.get('fleche');
  const [hx, hy] = cursor.hot;
  const [w, h] = cursor.size || [0, 0];
  return { left: hx, right: Math.max(0, w - hx), up: hy, down: Math.max(0, h - hy) };
}

// Coin haut-gauche de l'infobulle. Elle reste dans le cadre et ne passe pas sous le curseur
// (la bulle « parler », par exemple, est dessinée au-dessus du point qui clique).
export function tipPosition(x, y, width, height, frameWidth, frameHeight, extent = null) {
  const box = extent || { left: 0, right: 0, up: 0, down: 0 };
  const gap = Math.max(4, frameWidth * 0.012);
  const margin = Math.max(6, frameWidth * 0.008);
  const maxL = Math.max(margin, frameWidth - width - margin);
  const maxT = Math.max(margin, frameHeight - height - margin);
  const clamp = (l, t) => [Math.min(Math.max(l, margin), maxL), Math.min(Math.max(t, margin), maxT)];
  const inside = (l, t) => l >= margin && t >= margin && l <= maxL && t <= maxT;
  const overlaps = (l, t) => l < x + box.right && l + width > x - box.left && t < y + box.down && t + height > y - box.up;
  const spots = [
    [x + gap, y - box.up - gap - height],
    [x - box.left - gap - width, y - box.up - gap - height],
    [x + box.right + gap, y - height * 0.5],
    [x - box.left - gap - width, y - height * 0.5],
    [x + gap, y + box.down + gap],
    [x - box.left - gap - width, y + box.down + gap],
  ];
  for (const [l, t] of spots) if (inside(l, t) && !overlaps(l, t)) return [Math.round(l), Math.round(t)];
  for (const [l, t] of spots) {
    const clamped = clamp(l, t);
    if (!overlaps(clamped[0], clamped[1])) return [Math.round(clamped[0]), Math.round(clamped[1])];
  }
  const [l, t] = clamp(spots[0][0], spots[0][1]);
  return [Math.round(l), Math.round(t)];
}
