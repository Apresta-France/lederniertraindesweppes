import { h, uid } from './dom.js';
import { getIn, setIn } from './object-path.js';
import { createJsonField } from './json-field.js';
import { createAssetField } from './asset-picker.js';

/**
 * Builds form controls bound to paths inside the scene. Each control re-reads its value
 * from the store on `refresh()` (except while focused), so the stage, undo/redo and the
 * inspector always agree.
 */
export class FormScope {
  constructor(store, ctx) {
    this.store = store;
    this.ctx = ctx;
    this.refreshers = [];
    this.disposers = [];
  }

  get readOnly() {
    return this.store.readOnly;
  }

  value(path) {
    return getIn(this.store.scene, path);
  }

  commit(path, value, key = `field:${path.join('.')}`) {
    this.store.update((scene) => setIn(scene, path, value), { key, source: 'inspector' });
  }

  watch(fn) {
    this.refreshers.push(fn);
    fn();
  }

  refresh() {
    for (const fn of this.refreshers) fn();
  }

  dispose() {
    for (const fn of this.disposers) fn();
    this.disposers = [];
    this.refreshers = [];
  }

  wrap(id, label, control, help, extraClass = '') {
    const helpId = help ? `${id}-help` : null;
    if (helpId) control.setAttribute('aria-describedby', helpId);
    return h('div', { class: `field ${extraClass}`.trim() },
      h('label', { for: id }, label),
      control,
      help ? h('p', { class: 'help', id: helpId }, help) : null);
  }

  text({ label, path, optional = true, placeholder = '', multiline = false, rows = 3, help = '', list = null, readOnly = false, mono = false }) {
    const id = uid('txt');
    const input = multiline
      ? h('textarea', { id, rows, placeholder, class: mono ? 'mono' : null })
      : h('input', { id, type: 'text', placeholder, list, class: mono ? 'mono' : null, autocomplete: 'off' });
    input.addEventListener('input', () => {
      const raw = input.value;
      this.commit(path, raw === '' && optional ? undefined : raw);
    });
    this.watch(() => {
      if (document.activeElement !== input) {
        const value = this.value(path);
        input.value = value === undefined || value === null ? '' : String(value);
      }
      input.readOnly = readOnly || this.readOnly;
    });
    return this.wrap(id, label, input, help);
  }

  number({ label, path, step = 1, min = null, max = null, integer = false, optional = true, placeholder = '', help = '', onChange = null }) {
    const id = uid('num');
    const input = h('input', { id, type: 'number', step, min, max, placeholder, inputmode: integer ? 'numeric' : 'decimal' });
    input.addEventListener('input', () => {
      if (input.value === '') {
        if (optional) this.commit(path, undefined);
        return;
      }
      let value = Number(input.value);
      if (!Number.isFinite(value)) return;
      if (integer) value = Math.round(value);
      this.commit(path, value);
    });
    if (onChange) input.addEventListener('change', onChange);
    this.watch(() => {
      if (document.activeElement !== input) {
        const value = this.value(path);
        input.value = typeof value === 'number' ? String(value) : '';
      }
      input.disabled = this.readOnly;
    });
    return this.wrap(id, label, input, help, 'field-number');
  }

  check({ label, path, keepFalse = false, help = '' }) {
    const id = uid('chk');
    const input = h('input', { id, type: 'checkbox' });
    input.addEventListener('change', () => {
      this.commit(path, input.checked ? true : (keepFalse ? false : undefined), `check:${Date.now()}`);
    });
    this.watch(() => {
      input.checked = this.value(path) === true;
      input.disabled = this.readOnly;
    });
    const helpId = help ? `${id}-help` : null;
    if (helpId) input.setAttribute('aria-describedby', helpId);
    return h('div', { class: 'field field-check' },
      input,
      h('label', { for: id }, label),
      help ? h('p', { class: 'help', id: helpId }, help) : null);
  }

  select({ label, path, options, optional = true, emptyLabel = '(par défaut)', help = '' }) {
    const id = uid('sel');
    const select = h('select', { id });
    let signature = '';
    const resolveOptions = () => (typeof options === 'function' ? options() : options)
      .map((option) => (Array.isArray(option) ? option : [option, option]));
    select.addEventListener('change', () => {
      this.commit(path, select.value === '' && optional ? undefined : select.value, `select:${Date.now()}`);
    });
    this.watch(() => {
      const current = this.value(path);
      const value = current === undefined || current === null ? '' : String(current);
      const list = resolveOptions();
      const known = value === '' || list.some(([v]) => v === value);
      const nextSignature = JSON.stringify([list, known ? '' : value]);
      if (nextSignature !== signature) {
        signature = nextSignature;
        select.replaceChildren(
          optional || value === '' ? h('option', { value: '' }, emptyLabel) : null,
          known ? null : h('option', { value }, `${value} (inconnu)`),
          ...list.map(([v, text]) => h('option', { value: v }, text)),
        );
      }
      select.value = value;
      select.disabled = this.readOnly;
    });
    return this.wrap(id, label, select, help);
  }

  tuple({ label, path, labels, step = 1, integer = true, optional = false, help = '' }) {
    const inputs = labels.map((name) => h('input', { type: 'number', step, 'aria-label': `${label} — ${name}`, inputmode: 'decimal' }));
    const commitFromInputs = () => {
      if (inputs.every((input) => input.value === '')) {
        if (optional) this.commit(path, undefined);
        return;
      }
      if (inputs.some((input) => input.value === '' || !Number.isFinite(Number(input.value)))) return;
      this.commit(path, inputs.map((input) => (integer ? Math.round(Number(input.value)) : Number(input.value))));
    };
    inputs.forEach((input) => input.addEventListener('input', commitFromInputs));
    this.watch(() => {
      const value = this.value(path);
      inputs.forEach((input, index) => {
        if (document.activeElement !== input) {
          input.value = Array.isArray(value) && typeof value[index] === 'number' ? String(value[index]) : '';
        }
        input.disabled = this.readOnly;
      });
    });
    const helpId = help ? uid('help') : null;
    return h('fieldset', { class: 'field field-tuple', 'aria-describedby': helpId },
      h('legend', null, label),
      h('div', { class: 'tuple-row', style: { gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` } },
        labels.map((name, index) => h('label', { class: 'tuple-cell' }, h('span', null, name), inputs[index]))),
      help ? h('p', { class: 'help', id: helpId }, help) : null);
  }

  json({ label, path, rows = 5, help = '', optional = true, validate = null }) {
    const field = createJsonField({
      label,
      rows,
      help,
      optional,
      validate,
      onCommit: (value) => this.commit(path, value),
    });
    this.watch(() => {
      field.setValue(this.value(path));
      field.setDisabled(this.readOnly);
    });
    return field.el;
  }

  asset({ label, path, kind = 'image', optional = true, help = '' }) {
    const field = createAssetField({
      library: this.ctx.library,
      sceneId: this.store.id,
      kind,
      label,
      help,
      optional,
      onChange: (value) => this.commit(path, value, `asset:${Date.now()}`),
    });
    this.disposers.push(() => field.destroy());
    this.watch(() => {
      field.setValue(this.value(path));
      field.setDisabled(this.readOnly);
    });
    return field.el;
  }
}

export function section(title, ...children) {
  return h('section', { class: 'insp-section' }, h('h3', null, title), ...children);
}

export function collapsible(title, open, ...children) {
  return h('details', { class: 'insp-details', open }, h('summary', null, title), ...children);
}
