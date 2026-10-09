const WIDTH = 100;

/** Mirrors lib/JsonFormatter.php: 2-space indentation, short containers kept on one line. */
export function formatJson(value, { inlineRoot = false } = {}) {
  return format(value, 0, 0, inlineRoot);
}

function entriesOf(value) {
  if (Array.isArray(value)) return value.map((item, index) => [index, item === undefined ? null : item]);
  return Object.entries(value).filter(([, item]) => item !== undefined);
}

function format(value, depth, prefix, inlineRoot) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const isArray = Array.isArray(value);
  const entries = entriesOf(value);
  if (!entries.length) return isArray ? '[]' : '{}';
  if (depth > 0 || inlineRoot) {
    const flat = inline(value);
    if (depth * 2 + prefix + flat.length <= WIDTH) return flat;
  }
  const pad = '  '.repeat(depth + 1);
  const lines = entries.map(([key, item]) => {
    const head = isArray ? '' : `${JSON.stringify(key)}: `;
    return pad + head + format(item, depth + 1, head.length, false);
  });
  const [open, close] = isArray ? ['[', ']'] : ['{', '}'];
  return `${open}\n${lines.join(',\n')}\n${'  '.repeat(depth)}${close}`;
}

function inline(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const entries = entriesOf(value);
  if (Array.isArray(value)) return `[${entries.map(([, item]) => inline(item)).join(', ')}]`;
  if (!entries.length) return '{}';
  return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(', ')} }`;
}
