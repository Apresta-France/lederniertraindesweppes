import { h, uid } from './dom.js';
import { formatJson } from './json-format.js';

/**
 * Monospace JSON textarea. Only valid JSON (passing `validate`) reaches `onCommit`;
 * otherwise an error message is shown and the store is left untouched.
 */
export function createJsonField({ label, rows = 6, help = '', optional = true, validate = null, onCommit }) {
  const id = uid('json');
  const errorId = `${id}-err`;
  const helpId = `${id}-help`;
  const textarea = h('textarea', {
    id,
    rows,
    class: 'mono',
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    'aria-describedby': [help ? helpId : '', errorId].filter(Boolean).join(' '),
  });
  const error = h('p', { class: 'field-error', id: errorId, hidden: true });
  const el = h('div', { class: 'field field-json' },
    label ? h('label', { for: id }, label) : null,
    textarea,
    error,
    help ? h('p', { class: 'help', id: helpId }, help) : null);

  function parse() {
    const text = textarea.value.trim();
    if (text === '') {
      return optional ? { ok: true, value: undefined } : { ok: false, message: 'Une valeur est obligatoire.' };
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      return { ok: false, message: `JSON invalide : ${e.message}` };
    }
    const message = validate ? validate(value) : null;
    return message ? { ok: false, message } : { ok: true, value };
  }

  function showResult(result) {
    error.hidden = result.ok;
    error.textContent = result.ok ? '' : result.message;
    textarea.setAttribute('aria-invalid', result.ok ? 'false' : 'true');
  }

  function render(value) {
    textarea.value = value === undefined ? '' : formatJson(value, { inlineRoot: true });
  }

  textarea.addEventListener('input', () => {
    const result = parse();
    showResult(result);
    if (result.ok) onCommit(result.value);
  });
  textarea.addEventListener('blur', () => {
    const result = parse();
    if (result.ok) render(result.value);
  });

  return {
    el,
    textarea,
    parse,
    setValue(value) {
      if (document.activeElement === textarea) return;
      render(value);
      showResult({ ok: true });
    },
    setDisabled(disabled) {
      textarea.readOnly = disabled;
    },
  };
}

export const validators = {
  array: (value) => (Array.isArray(value) ? null : 'Une liste [ … ] est attendue.'),
  object: (value) => (value && typeof value === 'object' && !Array.isArray(value) ? null : 'Un objet { … } est attendu.'),
  actions(value) {
    if (!Array.isArray(value)) return 'Une liste d’actions [ { "do": … } ] est attendue.';
    const bad = value.findIndex((action) => !action || typeof action !== 'object' || typeof action.do !== 'string');
    return bad >= 0 ? `L’action n° ${bad + 1} doit être un objet avec un champ « do ».` : null;
  },
  numberList(value) {
    return Array.isArray(value) && value.every((n) => typeof n === 'number') ? null : 'Une liste de nombres est attendue.';
  },
  stringList(value) {
    return Array.isArray(value) && value.every((n) => typeof n === 'string') ? null : 'Une liste de chaînes est attendue.';
  },
};
