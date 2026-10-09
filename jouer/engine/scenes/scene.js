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

  run(actions, extra = {}) {
    return runActions(actions, { game: this.game, scene: this, ...extra }).then(() => this.game.autosave());
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
