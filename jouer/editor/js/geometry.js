export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function isRect(value) {
  return Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function radiusPair(radius) {
  if (typeof radius === 'number') return [radius, radius];
  if (Array.isArray(radius) && radius.length >= 2 && radius.every((n) => typeof n === 'number')) return [radius[0], radius[1]];
  return null;
}

/** Contour cliquable : au moins trois sommets [x, y]. */
export function isPolygon(points) {
  return Array.isArray(points)
    && points.length >= 3
    && points.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export function clonePoints(points) {
  return points.map((p) => [p[0], p[1]]);
}

/** Rectangle englobant [x, y, largeur, hauteur]. */
export function boundsOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)];
}

/** Déplace et étire `points` pour que leur rectangle englobant `from` devienne `to`. */
export function mapPoints(points, from, to) {
  const [x0, y0, w0, h0] = from;
  const [x1, y1, w1, h1] = to;
  return points.map(([x, y]) => [
    Math.round(x1 + (w0 ? ((x - x0) / w0) * w1 : 0)),
    Math.round(y1 + (h0 ? ((y - y0) / h0) * h1 : 0)),
  ]);
}

export function pointInPolygon(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Box [x, y, w, h] of an object or decor item in reference pixels, or null if it has none. */
export function getBox(item, kind) {
  if (!item || typeof item !== 'object') return null;
  if (kind === 'object') return isRect(item.rect) ? item.rect.slice() : null;
  if (isRect(item.rect)) return item.rect.slice();
  const center = Array.isArray(item.center) && item.center.length >= 2 ? item.center : null;
  const radius = radiusPair(item.radius);
  if (center && radius) return [center[0] - radius[0], center[1] - radius[1], radius[0] * 2, radius[1] * 2];
  return null;
}

export function applyBox(item, kind, box) {
  const [x, y, w, h] = box;
  if (kind === 'object' && isPolygon(item.points)) {
    const from = isRect(item.rect) ? item.rect : boundsOf(item.points);
    item.points = mapPoints(item.points, from, [x, y, w, h]);
    item.rect = boundsOf(item.points);
    return;
  }
  if (kind === 'object' || isRect(item.rect) || !Array.isArray(item.center)) {
    item.rect = [x, y, w, h];
    return;
  }
  const rx = round1(w / 2);
  const ry = round1(h / 2);
  item.center = [round1(x + rx), round1(y + ry)];
  item.radius = [rx, ry];
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function contains(box, x, y) {
  return box && x >= box[0] && y >= box[1] && x <= box[0] + box[2] && y <= box[1] + box[3];
}

/** Clic dans le contour s’il existe, sinon dans le rectangle. */
export function hitItem(item, kind, x, y) {
  if (!item) return false;
  if (kind === 'object' && isPolygon(item.points)) return pointInPolygon(item.points, x, y);
  return contains(getBox(item, kind), x, y);
}

/** Box resized from `start` by the delta (dx, dy) dragged on `handle`. */
export function resizeBox(start, handle, dx, dy, keepRatio) {
  const [x0, y0, w0, h0] = start;
  let x = x0;
  let y = y0;
  let w = w0;
  let h = h0;
  if (handle.includes('e')) w = w0 + dx;
  if (handle.includes('w')) { w = w0 - dx; x = x0 + dx; }
  if (handle.includes('s')) h = h0 + dy;
  if (handle.includes('n')) { h = h0 - dy; y = y0 + dy; }
  w = Math.max(1, w);
  h = Math.max(1, h);

  if (keepRatio && w0 > 0 && h0 > 0) {
    const ratio = w0 / h0;
    const horizontal = handle.includes('e') || handle.includes('w');
    const vertical = handle.includes('n') || handle.includes('s');
    if (horizontal && vertical) {
      if (w / w0 >= h / h0) h = w / ratio;
      else w = h * ratio;
    } else if (horizontal) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
    if (!horizontal) x = x0 + (w0 - w) / 2;
    if (!vertical) y = y0 + (h0 - h) / 2;
  }
  if (handle.includes('w')) x = x0 + w0 - w;
  if (handle.includes('n')) y = y0 + h0 - h;
  return [Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
}

export function uniqueId(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
