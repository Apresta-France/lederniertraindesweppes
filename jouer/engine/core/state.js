import { Emitter } from './events.js';

export const INVENTORY_SIZE = 6;

const blank = () => ({
  scene: null,
  vars: {},
  inventory: [],
  notes: [],
  objective: null,
  done: [],
  scenes: {},
});

// État d'une partie : tout ce qui est sauvegardé. Les scènes n'ont pas d'état propre hors d'ici.
export class GameState extends Emitter {
  constructor() {
    super();
    this.data = blank();
  }

  reset() {
    this.data = blank();
    this.emit('change', { kind: 'reset' });
  }

  load(data) {
    this.data = Object.assign(blank(), structuredClone(data || {}));
    this.emit('change', { kind: 'reset' });
  }

  snapshot() {
    return structuredClone(this.data);
  }

  changed(kind, detail) {
    this.emit('change', { kind, ...detail });
  }

  get(name) {
    return this.data.vars[name];
  }

  set(name, value) {
    this.data.vars[name] = value;
    this.changed('vars', { name });
  }

  object(sceneId, objectId) {
    const scene = this.data.scenes[sceneId] ??= { objects: {} };
    return scene.objects[objectId] ??= {};
  }

  setObject(sceneId, objectId, patch) {
    Object.assign(this.object(sceneId, objectId), patch);
    this.changed('object', { scene: sceneId, object: objectId });
  }

  hasItem(id) {
    return this.data.inventory.includes(id);
  }

  addItem(id) {
    if (this.hasItem(id) || this.data.inventory.length >= INVENTORY_SIZE) return false;
    this.data.inventory.push(id);
    this.changed('inventory', { added: id });
    return true;
  }

  removeItem(id) {
    const i = this.data.inventory.indexOf(id);
    if (i < 0) return false;
    this.data.inventory.splice(i, 1);
    this.changed('inventory', { removed: id });
    return true;
  }

  addNote(text) {
    if (!text || this.data.notes.includes(text)) return false;
    this.data.notes.push(text);
    this.changed('notes', { added: text });
    return true;
  }

  setObjective(id) {
    this.data.objective = id;
    this.changed('objective');
  }

  completeObjective(id) {
    if (!this.data.done.includes(id)) this.data.done.push(id);
    if (this.data.objective === id) this.data.objective = null;
    this.changed('objective');
  }
}
