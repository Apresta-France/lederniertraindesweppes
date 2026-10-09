export const IMAGE_RE = /\.(png|jpe?g|webp|gif|svg)$/i;
export const AUDIO_RE = /\.(mp3|ogg|wav|m4a)$/i;

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function assetUrl(sceneId, path) {
  if (!path || typeof path !== 'string') return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (path.startsWith('@shared/')) return `../shared/${encodePath(path.slice(8))}`;
  return `../scenes/${encodeURIComponent(sceneId)}/${encodePath(path.replace(/^\.\//, ''))}`;
}

export function characterUrl(characterId, path) {
  return `../shared/characters/${encodeURIComponent(characterId)}/${encodePath(path)}`;
}

export function fileName(path) {
  return String(path || '').split('/').pop();
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export function formatSeconds(ms) {
  const seconds = (Number(ms) || 0) / 1000;
  return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1).replace('.', ',')} s`;
}

export function formatClock(ms) {
  const total = Math.max(0, Number(ms) || 0);
  const minutes = Math.floor(total / 60000);
  const seconds = ((total % 60000) / 1000).toFixed(1).padStart(4, '0').replace('.', ',');
  return `${minutes}:${seconds}`;
}
