import { Emitter } from './events.js';

export const INVENTORY_SIZE = 6;

const blank = () => ({
  scene: null,
  vars: {},
  inventory: [],
  notes: [],
  objective: null,
  done: [],
  journal: { objectives: {}, people: {}, memories: [], seen: {} },
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
    this.data.journal = Object.assign(blank().journal, this.data.journal);
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

  // Notes : { text, place } ; les anciennes sauvegardes contiennent de simples chaînes.
  addNote(text, { place } = {}) {
    if (!text || this.data.notes.some(n => (n?.text ?? n) === text)) return false;
    this.data.notes.push({ text, place });
    this.changed('notes', { added: text });
    return true;
  }

  // Libellé et lieu gardés au moment où l'objectif apparaît, pour le carnet des scènes suivantes.
  logObjective(id, { label, place } = {}) {
    if (!id || this.data.journal.objectives[id]) return;
    this.data.journal.objectives[id] = { label: label || id, place };
  }

  setObjective(id, meta) {
    this.logObjective(id, meta);
    this.data.objective = id;
    this.changed('objective');
  }

  completeObjective(id, meta) {
    this.logObjective(id, meta);
    if (!this.data.done.includes(id)) this.data.done.push(id);
    if (this.data.objective === id) this.data.objective = null;
    this.changed('objective');
  }

  // Personnage rencontré, avec éventuellement une chose apprise sur lui.
  addPerson(id, fact = '', { place } = {}) {
    if (!id) return false;
    const people = this.data.journal.people;
    const isNew = !people[id];
    const p = people[id] ??= { place, facts: [] };
    const learnt = !!fact && !p.facts.includes(fact);
    if (learnt) p.facts.push(fact);
    if (isNew || learnt) this.changed('journal', { section: 'people', person: id, fact: learnt ? fact : '' });
    return isNew || learnt;
  }

  // Souvenir : { id, title, text, src, place } ; src est relatif à la racine du jeu.
  addMemory(entry) {
    const id = entry?.id || entry?.title;
    if (!id || this.data.journal.memories.some(m => m.id === id)) return false;
    this.data.journal.memories.push({ ...entry, id });
    this.changed('journal', { section: 'memories', title: entry.title || id });
    return true;
  }
}
