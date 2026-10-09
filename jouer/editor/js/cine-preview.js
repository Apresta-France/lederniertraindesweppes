import { h, listen, debounce } from './dom.js';
import { formatClock } from './paths.js';

const FRAME_W = 1280;
const FRAME_H = 720;
const SOUND_PREF = 'ldtw_editor_preview_sound';

/**
 * Small live preview of the cinematic, shown above the inspector. The real engine runs in an
 * iframe (`../?embed=1`) at 1280×720, scaled down; it receives the draft scene and follows
 * the playhead. Events: `time` {t, playing} while playing or after a seek.
 */
export class CinePreview extends EventTarget {
  constructor({ store, dock }) {
    super();
    this.store = store;
    this.dock = dock;
    this.t = 0;
    this.duration = 0;
    this.playing = false;
    this.ready = false;
    this.sound = localStorage.getItem(SOUND_PREF) === '1';
    this.pendingSeek = null;
    this.build();
    this.disposers = [
      listen(window, 'message', (e) => this.onMessage(e)),
      listen(store, 'change', () => this.reload()),
    ];
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.viewport);
  }

  build() {
    this.frame = h('iframe', {
      class: 'pv-frame',
      src: '../index.php?embed=1',
      title: 'Aperçu de la cinématique',
      tabindex: '-1',
      allow: 'autoplay',
      style: { width: `${FRAME_W}px`, height: `${FRAME_H}px` },
    });
    this.viewport = h('div', { class: 'pv-viewport' }, this.frame, h('div', { class: 'pv-shield', 'aria-hidden': 'true' }));
    this.btnStart = h('button', { type: 'button', class: 'btn btn-small', title: 'Revenir au début', 'aria-label': 'Revenir au début', onclick: () => this.seek(0) }, '⏮');
    this.btnPlay = h('button', { type: 'button', class: 'btn btn-small btn-gold pv-play', onclick: () => this.toggle() });
    this.timeLabel = h('span', { class: 'coords pv-time' });
    const soundId = 'pv-sound';
    this.soundBox = h('input', { type: 'checkbox', id: soundId, checked: this.sound, onchange: () => this.setSound(this.soundBox.checked) });
    this.root = h('section', { class: 'pv', 'aria-label': 'Aperçu' },
      h('div', { class: 'pv-head' }, h('h3', null, 'Aperçu'), h('span', { class: 'pv-hint' }, 'Espace : lecture / pause')),
      this.viewport,
      h('div', { class: 'pv-controls' },
        this.btnStart, this.btnPlay, this.timeLabel,
        h('label', { class: 'pv-sound', for: soundId }, this.soundBox, ' Son')));
    this.dock.replaceChildren(this.root);
    this.dock.hidden = false;
    this.updateControls();
  }

  destroy() {
    this.disposers.forEach((dispose) => dispose());
    this.resizeObserver.disconnect();
    this.reload.cancel();
    this.dock.replaceChildren();
    this.dock.hidden = true;
  }

  fit() {
    const scale = this.viewport.clientWidth / FRAME_W;
    this.frame.style.transform = `scale(${scale})`;
    this.viewport.style.height = `${FRAME_H * scale}px`;
  }

  post(msg) {
    if (this.ready) this.frame.contentWindow?.postMessage(msg, location.origin);
  }

  onMessage(event) {
    if (event.source !== this.frame.contentWindow || event.origin !== location.origin) return;
    const msg = event.data || {};
    if (msg.type === 'ldtw:ready') {
      this.ready = true;
      this.post({ type: 'ldtw:sound', on: this.sound });
      this.load();
    } else if (msg.type === 'ldtw:time') {
      this.t = msg.t;
      this.duration = msg.duration || this.duration;
      this.playing = !!msg.playing;
      this.updateControls();
      this.dispatchEvent(new CustomEvent('time', { detail: { t: this.t, playing: this.playing } }));
    } else if (msg.type === 'ldtw:ended') {
      this.playing = false;
      this.updateControls();
    }
  }

  load() {
    if (!this.store.scene) return;
    this.post({ type: 'ldtw:load', id: this.store.id, scene: this.store.scene, at: this.t, play: this.playing });
  }

  reload = debounce(() => this.load(), 250);

  /** Moves the preview to `t` ms. Calls are coalesced to one per frame while scrubbing. */
  seek(t, { play = this.playing } = {}) {
    this.t = Math.max(0, t);
    this.playing = play;
    this.updateControls();
    this.dispatchEvent(new CustomEvent('time', { detail: { t: this.t, playing: this.playing, local: true } }));
    if (this.pendingSeek) return;
    this.pendingSeek = requestAnimationFrame(() => {
      this.pendingSeek = null;
      this.post({ type: 'ldtw:seek', at: this.t, play: this.playing });
    });
  }

  toggle() {
    if (this.playing) {
      this.playing = false;
      this.post({ type: 'ldtw:pause' });
    } else {
      if (this.duration && this.t >= this.duration - 50) this.t = 0;
      this.playing = true;
      if (this.sound) this.post({ type: 'ldtw:sound', on: true });
      this.post({ type: 'ldtw:seek', at: this.t, play: true });
    }
    this.updateControls();
  }

  setSound(on) {
    this.sound = on;
    localStorage.setItem(SOUND_PREF, on ? '1' : '0');
    this.post({ type: 'ldtw:sound', on });
    if (on && this.playing) this.post({ type: 'ldtw:seek', at: this.t, play: true });
  }

  updateControls() {
    this.btnPlay.textContent = this.playing ? '❚❚ Pause' : '▶ Lecture';
    this.btnPlay.setAttribute('aria-pressed', String(this.playing));
    this.timeLabel.textContent = `${formatClock(this.t)}${this.duration ? ` / ${formatClock(this.duration)}` : ''}`;
  }
}
