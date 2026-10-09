const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;

/**
 * Holds the scene being edited, the selection and the undo/redo history.
 * Events: load, change {source}, select, readonly, saved.
 */
export class Store extends EventTarget {
  constructor() {
    super();
    this.id = null;
    this.scene = null;
    this.rev = null;
    this.selection = null;
    this.readOnly = false;
    this.savedJson = '';
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = null;
    this.lastTime = 0;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  load(id, scene, rev) {
    this.id = id;
    this.scene = scene;
    this.rev = rev;
    this.selection = null;
    this.savedJson = JSON.stringify(scene);
    this.undoStack = [];
    this.redoStack = [];
    this.breakCoalescing();
    this.emit('load');
  }

  clear() {
    this.id = null;
    this.scene = null;
    this.rev = null;
    this.selection = null;
    this.savedJson = '';
    this.undoStack = [];
    this.redoStack = [];
    this.emit('load');
  }

  get dirty() {
    return this.scene !== null && JSON.stringify(this.scene) !== this.savedJson;
  }

  get canUndo() {
    return this.undoStack.length > 0 && !this.readOnly;
  }

  get canRedo() {
    return this.redoStack.length > 0 && !this.readOnly;
  }

  snapshot() {
    return { scene: structuredClone(this.scene), selection: structuredClone(this.selection) };
  }

  /**
   * Mutates the scene in place. Successive updates sharing the same `key` within a short
   * delay are merged into a single undo step (drags, typing).
   */
  update(mutator, { key = null, source = 'edit' } = {}) {
    if (!this.scene || this.readOnly) return false;
    const now = performance.now();
    const merge = key !== null && key === this.lastKey && now - this.lastTime < COALESCE_MS;
    const before = merge ? null : this.snapshot();
    mutator(this.scene);
    if (before) {
      this.undoStack.push(before);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastKey = key;
    this.lastTime = now;
    this.emit('change', { source });
    return true;
  }

  replaceScene(scene, source = 'json') {
    return this.update((current) => {
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, scene);
    }, { source });
  }

  breakCoalescing() {
    this.lastKey = null;
  }

  undo() {
    if (!this.canUndo) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
  }

  redo() {
    if (!this.canRedo) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  }

  restore(entry) {
    this.scene = entry.scene;
    this.selection = entry.selection;
    this.breakCoalescing();
    this.emit('change', { source: 'history' });
    this.emit('select');
  }

  setSelection(selection) {
    const same = JSON.stringify(selection) === JSON.stringify(this.selection);
    this.selection = selection;
    if (!same) this.emit('select');
  }

  setReadOnly(readOnly) {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    this.emit('readonly');
  }

  markSaved(rev, json) {
    this.rev = rev;
    this.savedJson = json;
    this.emit('saved');
  }
}
