import { h, listen, uid } from './dom.js';
import { formatJson } from './json-format.js';
import { toast } from './ui.js';

const TYPES = ['cinematic', 'explore'];

function checkScene(value, id) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'La scène doit être un objet { … }.';
  if (value.id !== id) return `Le champ « id » doit rester « ${id} ».`;
  if (!TYPES.includes(value.type)) return 'Le champ « type » doit valoir « cinematic » ou « explore ».';
  if (typeof value.title !== 'string') return 'Le champ « title » (texte) est obligatoire.';
  if (value.type === 'explore') {
    if ('objects' in value && !Array.isArray(value.objects)) return '« objects » doit être une liste.';
    if ('decor' in value && !Array.isArray(value.decor)) return '« decor » doit être une liste.';
    if ('size' in value && !(Array.isArray(value.size) && value.size.length === 2)) return '« size » doit valoir [largeur, hauteur].';
  } else if ('timeline' in value && !Array.isArray(value.timeline)) {
    return '« timeline » doit être une liste.';
  }
  return null;
}

/** "JSON" tab: the whole scene as raw text, validated before being applied. */
export class JsonTab {
  constructor({ store, container }) {
    this.store = store;
    this.container = container;
    this.edited = false;
    this.visible = false;
    const id = uid('scenejson');
    this.textarea = h('textarea', { id, class: 'mono json-editor', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-describedby': `${id}-status` });
    this.status = h('p', { class: 'json-status', id: `${id}-status`, 'aria-live': 'polite' });
    this.applyButton = h('button', { type: 'button', class: 'btn btn-gold', disabled: true, onclick: () => this.apply() }, 'Appliquer');
    this.revertButton = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => this.revert() }, 'Annuler les modifications du texte');
    this.textarea.addEventListener('input', () => {
      this.edited = true;
      this.check();
    });
    container.replaceChildren(
      h('div', { class: 'toolbar' },
        h('label', { for: id }, 'Scène complète (JSON)'),
        this.applyButton,
        this.revertButton),
      this.status,
      this.textarea);
    listen(store, 'load', () => this.revert());
    listen(store, 'change', () => {
      if (!this.edited && this.visible) this.renderText();
    });
    listen(store, 'readonly', () => this.check());
  }

  show() {
    this.visible = true;
    if (!this.edited) this.renderText();
  }

  hide() {
    this.visible = false;
  }

  renderText() {
    this.textarea.value = this.store.scene ? `${formatJson(this.store.scene)}\n` : '';
    this.check();
  }

  parse() {
    try {
      const value = JSON.parse(this.textarea.value);
      const error = checkScene(value, this.store.id);
      return error ? { ok: false, message: error } : { ok: true, value };
    } catch (e) {
      return { ok: false, message: `JSON invalide : ${e.message}` };
    }
  }

  check() {
    this.textarea.readOnly = this.store.readOnly || !this.store.scene;
    if (!this.edited) {
      this.status.textContent = 'Modifiez le texte puis cliquez sur « Appliquer ». Le résultat est annulable (Ctrl+Z).';
      this.status.className = 'json-status';
      this.applyButton.disabled = true;
      this.revertButton.disabled = true;
      return;
    }
    const result = this.parse();
    this.status.textContent = result.ok ? 'JSON valide : cliquez sur « Appliquer » pour l’utiliser.' : result.message;
    this.status.className = `json-status ${result.ok ? 'is-ok' : 'is-error'}`;
    this.textarea.setAttribute('aria-invalid', result.ok ? 'false' : 'true');
    this.applyButton.disabled = !result.ok || this.store.readOnly;
    this.revertButton.disabled = false;
  }

  apply() {
    const result = this.parse();
    if (!result.ok) {
      this.check();
      return;
    }
    this.edited = false;
    this.store.setSelection(null);
    if (this.store.replaceScene(result.value, 'json')) toast('JSON appliqué.', 'success');
    this.renderText();
  }

  revert() {
    this.edited = false;
    this.renderText();
  }
}
