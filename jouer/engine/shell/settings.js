import { Emitter } from '../core/events.js';

const KEY = 'ldtw_settings';
const PERSISTED = ['sound', 'consent', 'music', 'voice', 'sfx', 'reduceMotion', 'textScale'];

// Réglages du joueur, partagés par la coquille et toutes les scènes.
export class Settings extends Emitter {
  constructor() {
    super();
    this.values = {
      sound: true,
      consent: true,
      music: 60,
      voice: 100,
      sfx: 80,
      reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      textScale: 1,
    };
    this.stored = false;
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) {
        this.stored = true;
        PERSISTED.forEach(k => { if (k in s) this.values[k] = s[k]; });
      }
    } catch (e) { /* réglages illisibles : valeurs par défaut */ }
  }

  set(patch) {
    Object.assign(this.values, patch);
    this.persist();
    this.emit('change', patch);
  }

  persist() {
    if (!this.values.consent) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSISTED.map(k => [k, this.values[k]]))));
    } catch (e) { /* stockage indisponible */ }
  }

  forget() {
    try { localStorage.removeItem(KEY); } catch (e) { /* rien à effacer */ }
  }
}
