export function getIn(root, path) {
  let node = root;
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[key];
  }
  return node;
}

export function setIn(root, path, value) {
  if (!path.length) throw new Error('Chemin vide');
  let node = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (node[key] === null || typeof node[key] !== 'object') {
      if (value === undefined) return;
      node[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    node = node[key];
  }
  const last = path[path.length - 1];
  if (value === undefined) {
    if (Array.isArray(node) && typeof last === 'number') node.splice(last, 1);
    else delete node[last];
  } else {
    node[last] = value;
  }
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
