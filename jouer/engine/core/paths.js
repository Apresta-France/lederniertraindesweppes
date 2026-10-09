// Chemins des fichiers de contenu.
// « assets/x.png » est relatif au dossier du fichier JSON qui le déclare (scène, personnage…),
// « @shared/x.png » pointe vers jouer/shared/.
export const ROOT = new URL('../../', import.meta.url);

export function resolve(path, base = ROOT) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  if (path.startsWith('@shared/')) return new URL('shared/' + path.slice(8), ROOT).href;
  return new URL(path, base).href;
}

export const sceneBase = id => new URL(`scenes/${id}/`, ROOT).href;
export const characterBase = id => new URL(`shared/characters/${id}/`, ROOT).href;
