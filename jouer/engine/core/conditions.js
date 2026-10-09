// Conditions écrites dans les scènes : voir schemas/scene.schema.json ($defs.condition).
const OPS = {
  eq: (v, x) => v === x,
  ne: (v, x) => v !== x,
  gt: (v, x) => v > x,
  gte: (v, x) => v >= x,
  lt: (v, x) => v < x,
  lte: (v, x) => v <= x,
  in: (v, x) => Array.isArray(x) && x.includes(v),
};

function compare(value, cond) {
  const ops = Object.keys(OPS).filter(op => op in cond);
  if (!ops.length) return !!value;
  return ops.every(op => OPS[op](value, cond[op]));
}

export function test(cond, ctx) {
  if (cond == null) return true;
  if (Array.isArray(cond)) return cond.every(c => test(c, ctx));
  if ('all' in cond) return cond.all.every(c => test(c, ctx));
  if ('any' in cond) return cond.any.some(c => test(c, ctx));
  if ('not' in cond) return !test(cond.not, ctx);
  const { state } = ctx.game;
  if ('has' in cond) return state.hasItem(cond.has);
  if ('objective' in cond) return state.data.objective === cond.objective;
  if ('done' in cond) return state.data.done.includes(cond.done);
  if ('var' in cond) return compare(state.get(cond.var), cond);
  if ('state' in cond) return compare(ctx.scene?.objectState?.(cond.state), cond);
  return true;
}

// Objets dont l'état est lu par une condition (pour savoir quand la réévaluer).
export function referencedObjects(cond, out = new Set()) {
  if (!cond || typeof cond !== 'object') return out;
  if (Array.isArray(cond)) cond.forEach(c => referencedObjects(c, out));
  else {
    if (typeof cond.state === 'string') out.add(cond.state);
    ['all', 'any'].forEach(k => cond[k] && referencedObjects(cond[k], out));
    if (cond.not) referencedObjects(cond.not, out);
  }
  return out;
}
