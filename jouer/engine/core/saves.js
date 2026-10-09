const KEY = 'ldtw_saves';
const MAX_SLOTS = 6;

// Emplacements de sauvegarde sur ce navigateur. Chaque emplacement porte l'état complet de la partie (data).
export class Saves {
  constructor() {
    this.list = [];
    this.current = null;
    try { this.list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { this.list = []; }
    this.list.forEach(s => { s.id ??= Math.random().toString(36).slice(2, 10); });
  }

  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.list)); } catch (e) { /* stockage plein ou interdit */ }
  }

  visible(account) {
    return this.list.filter(s => s.mode !== 'account' || (account && (!s.email || s.email === account.email)));
  }

  create({ mode, email, chapter = '', place = '', date = new Date().toISOString(), data = null }) {
    const slot = { id: Math.random().toString(36).slice(2, 10), chapter, place, date, mode, email, data };
    this.list = [slot, ...this.list].slice(0, MAX_SLOTS);
    this.current = slot.id;
    this.write();
    return slot;
  }

  use(slot) {
    this.current = slot?.id ?? null;
    return slot?.data ?? null;
  }

  update(data, { chapter, place } = {}) {
    const slot = this.list.find(s => s.id === this.current);
    if (!slot) return;
    Object.assign(slot, { data, date: new Date().toISOString() });
    if (chapter) slot.chapter = chapter;
    if (place) slot.place = place;
    this.write();
  }

  clear() {
    this.list = [];
    this.current = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* rien à effacer */ }
  }
}
