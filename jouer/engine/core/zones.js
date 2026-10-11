// Halo d’une zone libre, et chemin des pieds sur le sol.
// WALK_SLACK laisse passer un mince interstice entre deux zones posées côte à côte,
// sans autoriser une diagonale qui sort vraiment du contour.

const BOUNDARY = 1.5;
const WALK_SLACK = 5;

/** true : halo forcé. false : jamais. Absent : allumé, sauf si la zone déplace un personnage. */
export function showsHalo(object) {
  if (!object || object.halo === false) return false;
  if (object.halo === true) return true;
  return !object.walkTo;
}

function pointInPolygon(points, x, y) {
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

function project(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distToSegment(point, a, b) {
  return dist(point, project(point, a, b));
}

function nearPolygon(poly, x, y, slack) {
  if (pointInPolygon(poly, x, y)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (distToSegment([x, y], poly[i], poly[(i + 1) % poly.length]) <= slack) return true;
  }
  return false;
}

function nearAny(polys, x, y, slack) {
  return polys.some((poly) => nearPolygon(poly, x, y, slack));
}

function segmentNear(polys, a, b, slack) {
  const steps = Math.max(1, Math.ceil(dist(a, b) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!nearAny(polys, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, slack)) return false;
  }
  return true;
}

function closestBoundary(polys, point) {
  let best = null;
  let bestD = Infinity;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const hit = project(point, poly[i], poly[(i + 1) % poly.length]);
      const gap = dist(point, hit);
      if (gap < bestD) {
        bestD = gap;
        best = hit;
      }
    }
  }
  return best;
}

function simplify(points, polys) {
  if (points.length < 3) return points;
  const kept = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (!segmentNear(polys, points[anchor], points[i], WALK_SLACK)) {
      kept.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  kept.push(points[points.length - 1]);
  return kept;
}

function shortest(start, goal, polys) {
  const nodes = [start, goal, ...polys.flat()];
  const n = nodes.length;
  const distTo = Array(n).fill(Infinity);
  const prev = Array(n).fill(-1);
  const used = Array(n).fill(false);
  distTo[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!used[i] && (u < 0 || distTo[i] < distTo[u])) u = i;
    }
    if (u < 0 || !Number.isFinite(distTo[u])) break;
    if (u === 1) break;
    used[u] = true;
    for (let v = 0; v < n; v++) {
      if (used[v] || u === v || !segmentNear(polys, nodes[u], nodes[v], WALK_SLACK)) continue;
      const next = distTo[u] + dist(nodes[u], nodes[v]);
      if (next < distTo[v]) {
        distTo[v] = next;
        prev[v] = u;
      }
    }
  }
  let end = 1;
  if (!Number.isFinite(distTo[1])) {
    let best = 0;
    let bestD = dist(nodes[0], goal);
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(distTo[i])) continue;
      const gap = dist(nodes[i], goal);
      if (gap < bestD) {
        bestD = gap;
        best = i;
      }
    }
    end = best;
  }
  const path = [];
  for (let i = end; i !== -1; i = prev[i]) path.push(nodes[i]);
  path.reverse();
  return simplify(path, polys);
}

/**
 * Points des pieds après la position actuelle, jusqu’au but.
 * Le trajet reste dans l’union des polygones. S’il n’y a pas de passage,
 * il s’arrête au point du sol le plus proche du but.
 */
export function routeFeet(start, goal, polygons) {
  const polys = (polygons || []).filter((poly) => Array.isArray(poly) && poly.length >= 3);
  if (!Array.isArray(start) || !Array.isArray(goal)) return [];
  if (!polys.length) return [goal];
  let from = start;
  const head = [];
  if (!nearAny(polys, start[0], start[1], BOUNDARY)) {
    const entry = closestBoundary(polys, start);
    if (!entry) return [goal];
    head.push(entry);
    from = entry;
  }
  let dest = goal;
  if (!nearAny(polys, goal[0], goal[1], BOUNDARY)) dest = closestBoundary(polys, goal) || goal;
  const path = shortest(from, dest, polys);
  const full = [...head, ...path.slice(1)];
  return full.filter((point, index) => index === 0 || dist(point, full[index - 1]) >= 1);
}
