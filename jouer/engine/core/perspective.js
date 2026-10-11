// Même courbe que le terrain d’essai de l’éditeur de personnages :
// 0,45 à l’horizon, 1 au bas de l’image. y est une fraction de la hauteur (0 = haut).
export const DEFAULT_HORIZON = 0.53;

export function depthScale(y, horizon = DEFAULT_HORIZON) {
  const span = Math.max(0.05, 1 - horizon);
  const t = Math.min(1, Math.max(0, (y - horizon) / span));
  return 0.45 + 0.55 * t;
}

// La vitesse suit la taille : le temps d’un trajet est l’intégrale de ds / facteur,
// le facteur passant linéairement de f0 à f1.
export function depthDurationFactor(f0, f1) {
  if (!(f0 > 0) || !(f1 > 0)) return 1;
  if (Math.abs(f1 - f0) < 1e-4) return 1 / f0;
  return Math.log(f1 / f0) / (f1 - f0);
}

// Fraction du trajet (0 → 1) après la fraction de temps u.
export function depthSpace(u, f0, f1) {
  if (!(f0 > 0) || !(f1 > 0) || Math.abs(f1 - f0) < 1e-4) return u;
  const grown = f0 * (f1 / f0) ** u;
  return (grown - f0) / (f1 - f0);
}
