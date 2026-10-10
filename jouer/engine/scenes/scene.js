import { resolve } from '../core/paths.js';
import { runActions } from '../core/actions.js';
import { preloadImages } from '../core/loader.js';

// Socle commun à tous les types de scène : minuteries, écouteurs et nettoyage garantis au démontage.
export class Scene {
  fadeIn = 0;

  constructor(game, data, base) {
    this.game = game;
    this.data = data;
    this.id = data.id;
    this.base = base;
    this.disposed = false;
    this.timers = new Set();
    this.cleanups = [];
    this.running = 0;
  }

  url(path) {
    return resolve(path, this.base);
  }

  imagesToPreload() {
    return [];
  }

  preload() {
    return preloadImages(this.imagesToPreload(), 3500);
  }

  mount(host) {
    const el = this.el = document.createElement('div');
    el.className = `scene scene--${this.data.type}`;
    el.dataset.scene = this.id;
    el._scene = this;
    if (this.fadeIn) el.style.animation = `scene-in ${this.fadeIn}ms ease both`;
    host.appendChild(el);
    this.render();
  }

  render() {}

  start() {}

  later(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  sleep(ms) {
    return new Promise(res => this.later(res, ms));
  }

  listen(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    this.cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  onDispose(fn) {
    this.cleanups.push(fn);
  }

  // Tant qu'une suite d'actions joue, la scène est occupée : le joueur ne peut pas en lancer une autre.
  run(actions, extra = {}) {
    const counted = Array.isArray(actions) && actions.length > 0;
    if (counted) { this.running++; this.busyChanged(); }
    return runActions(actions, { game: this.game, scene: this, ...extra })
      .finally(() => {
        if (!counted) return;
        this.running--;
        if (!this.disposed) this.busyChanged();
      })
      .then(() => this.game.autosave());
  }

  get isBusy() {
    return this.running > 0;
  }

  busyChanged() {}

  // Voile noir par-dessus la scène ; bloque aussi les clics jusqu'au démontage.
  fadeOut(ms = 1500) {
    const veil = document.createElement('div');
    veil.className = 'scene-veil';
    veil.style.animation = `scene-in ${ms}ms ease both`;
    this.el?.appendChild(veil);
    return this.sleep(ms);
  }

  announce(text) {
    this.game.announcer.say(text);
  }

  get reduceMotion() {
    return !!this.game.settings.values.reduceMotion;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimers();
    this.cleanups.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    this.el?.remove();
  }
}
