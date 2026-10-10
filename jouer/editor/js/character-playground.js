import { h, uid, clamp, slugify } from './dom.js';
import { CharacterSprite } from '../../engine/ui/character.js';

const DEFAULT_BG = new URL('../assets/salle-vide.jpg', import.meta.url).href;
const DEFAULT_HORIZON = 0.53;
// Keyboard moves in depth look too fast at the same pixel speed as sideways moves.
const DEPTH_SPEED = 0.7;

const word = (list) => new RegExp(`(^|-)(${list})($|-)`);
const WALK = word('marche|marcher|walk|walking|pas');
const RUN = word('course|courir|cours|cour|run|running|sprint');
const IDLE = word('repos|idle|attente|immobile|respire');
const UP = word('haut|dos|fond|up|back|nord|monte');
const DOWN = word('bas|face|avant|down|front|sud|descend');
const TALK = word('parle|parler|parole|talk');
const SETS = { walk: WALK, run: RUN, idle: IDLE, talk: TALK };

// Animations named "<set>-<direction>" (marche-dos-gauche…): index = 45° sector of the screen-space
// direction, clockwise from "moving right" (y points down).
const DIRS = ['droite', 'avant-droite', 'face', 'avant-gauche', 'gauche', 'dos-gauche', 'dos', 'dos-droite'];
const DIRS_BY_LENGTH = [...DIRS].sort((a, b) => b.length - a.length);
const MIRROR = Object.fromEntries(DIRS.map((d) => [d, d.replace(/droite|gauche/, (side) => (side === 'droite' ? 'gauche' : 'droite'))]));
const SET_LABELS = { walk: 'marche', run: 'course', idle: 'repos', talk: 'parole' };

function dirOf(ux, uy) {
  return DIRS[((Math.round(Math.atan2(uy, ux) / (Math.PI / 4)) % 8) + 8) % 8];
}

const ROLES = [
  { key: 'idle', label: 'Repos', test: (n) => IDLE.test(n) },
  { key: 'walk', label: 'Marche (de côté)', test: (n) => WALK.test(n) && !UP.test(n) && !DOWN.test(n) },
  { key: 'walkUp', label: 'Marche vers le fond', test: (n) => WALK.test(n) && UP.test(n) },
  { key: 'walkDown', label: 'Marche vers l’avant', test: (n) => WALK.test(n) && DOWN.test(n) },
  { key: 'run', label: 'Course (de côté)', test: (n) => RUN.test(n) && !UP.test(n) && !DOWN.test(n) },
  { key: 'runUp', label: 'Course vers le fond', test: (n) => RUN.test(n) && UP.test(n) },
  { key: 'runDown', label: 'Course vers l’avant', test: (n) => RUN.test(n) && DOWN.test(n) },
];

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
};

// Height is the sprite box as a fraction of the stage, before perspective.
// 0.75 is a quarter smaller than a figure that reaches about four-fifths of the door.
const DEFAULTS = { facing: 'right', height: 0.75, perspective: true, walkSpeed: 0.16, runSpeed: 0.4, horizon: DEFAULT_HORIZON, roles: {} };

function isObj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadSettings(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(`chared-playground:${id}`) || '{}');
    const settings = { ...DEFAULTS, ...(isObj(saved) ? saved : {}), roles: { ...(isObj(saved?.roles) ? saved.roles : {}) } };
    const version = isObj(saved) ? saved.version ?? 0 : 0;
    // 0.5 was half the door; 1 was the following default, a quarter too tall.
    if (version < 3 && (Math.abs(settings.height - 0.5) < 0.001 || Math.abs(settings.height - 1) < 0.001)) {
      settings.height = DEFAULTS.height;
    }
    settings.version = 3;
    return settings;
  } catch {
    return { ...DEFAULTS, version: 3, roles: {} };
  }
}

/**
 * Empty room where the character walks (arrows / WASD-ZQSD, click to go), runs (Shift, double-click)
 * and plays each of its animations. `state` outlives re-renders of the character editor.
 */
export class CharacterPlayground {
  constructor({ id, data, talkFrames, url, state }) {
    this.id = id;
    this.url = url;
    this.state = state;
    state.pos ||= { x: 0.5, y: 0.86 };
    state.left ||= false;
    state.dir ||= 'face';
    this.settings = loadSettings(id);
    this.animations = Object.fromEntries(Object.entries(isObj(data.animations) ? data.animations : {})
      .filter(([, a]) => isObj(a) && Array.isArray(a.frames) && a.frames.some(Boolean)));
    this.sets = this.directionalSets();
    this.talkFrames = talkFrames;
    this.keys = new Set();
    this.shift = false;
    this.target = null;
    this.show = null;
    this.voice = null;
    this.layerKey = null;
    this.layerStart = 0;
    this.last = 0;
    this.aspect = 0.5;
    this.size = { w: 0, h: 0 };
    this.statusText = '';
    this.el = this.build();
  }

  role(key) {
    const stored = this.settings.roles[key];
    if (stored !== undefined) return stored && this.animations[stored] ? stored : '';
    const role = ROLES.find((r) => r.key === key);
    return Object.keys(this.animations).find((name) => role.test(slugify(name))) || '';
  }

  directionalSets() {
    const sets = {};
    for (const name of Object.keys(this.animations)) {
      const slug = slugify(name);
      const dir = DIRS_BY_LENGTH.find((d) => slug.endsWith(`-${d}`));
      if (!dir) continue;
      const prefix = slug.slice(0, -dir.length - 1);
      const set = Object.keys(SETS).find((key) => SETS[key].test(prefix));
      if (set) (sets[set] ||= {})[dir] = name;
    }
    return Object.fromEntries(Object.entries(sets).filter(([, dirs]) => Object.keys(dirs).length >= 3));
  }

  // Animation of `set` facing `dir`, or the opposite side played mirrored.
  dirAnim(set, dir) {
    const dirs = this.sets[set];
    if (!dirs) return null;
    if (dirs[dir]) return { name: dirs[dir], flip: 1 };
    if (dirs[MIRROR[dir]]) return { name: dirs[MIRROR[dir]], flip: -1 };
    return null;
  }

  saveSettings() {
    try {
      localStorage.setItem(`chared-playground:${this.id}`, JSON.stringify(this.settings));
    } catch {
      // Settings simply do not survive a reload.
    }
  }

  destroy() {
    this.resize?.disconnect();
    this.voice = null;
  }

  // ---- DOM ----

  image(path) {
    if (!path) return h('i');
    const img = h('img', { src: this.url(path), alt: '', draggable: 'false' });
    img.addEventListener('load', () => {
      if (img.naturalHeight) this.aspect = Math.max(this.aspect, img.naturalWidth / img.naturalHeight);
    }, { once: true });
    return img;
  }

  build() {
    this.layers = new Map();
    const talkImgs = this.talkFrames.map((path) => this.image(path));
    const talkEl = h('div', { class: 'chared-pg-layer chared-pg-talk' }, talkImgs);
    this.sprite = new CharacterSprite(talkEl, talkImgs);
    this.sprite.setFrame(0);
    this.layers.set('', { el: talkEl, talk: true });
    for (const [name, anim] of Object.entries(this.animations)) {
      const frames = anim.frames.map((path) => this.image(path));
      this.layers.set(name, { el: h('div', { class: 'chared-pg-layer' }, frames), frames, fps: anim.fps > 0 ? anim.fps : 8, loop: anim.loop !== false });
    }
    this.body = h('div', { class: 'chared-pg-body' }, [...this.layers.values()].map((layer) => layer.el));
    this.charEl = h('div', { class: 'chared-pg-char' }, h('span', { class: 'chared-pg-shadow' }), this.body);
    this.marker = h('span', { class: 'chared-pg-marker', hidden: true });
    this.hint = h('p', { class: 'chared-pg-hint' }, 'Cliquez dans la salle pour prendre la main');
    this.stage = h('div', {
      class: 'chared-pg-stage',
      tabindex: '0',
      role: 'application',
      'aria-label': 'Terrain d’essai : flèches pour marcher, Maj pour courir, clic pour aller à un endroit',
    }, this.marker, this.charEl, this.hint);
    this.applyBackground();
    this.bindStage();

    this.resize = new ResizeObserver(() => {
      this.size = { w: this.stage.clientWidth, h: this.stage.clientHeight };
    });
    this.resize.observe(this.stage);

    this.status = h('span', { class: 'chared-pg-status mono', role: 'status' });
    this.root = h('div', { class: 'chared-pg' },
      this.renderMoves(),
      this.stage,
      h('div', { class: 'chared-pg-bar' },
        h('p', { class: 'help' },
          h('kbd', null, '←↑↓→'), ' ou ', h('kbd', null, 'ZQSD'), ' marcher · ', h('kbd', null, 'Maj'), ' maintenue : courir · ',
          'clic : y aller · double-clic ou ', h('kbd', null, 'Maj'), '+clic : y courir · ', h('kbd', null, 'Espace'), ' parler'),
        this.status),
      this.renderWarning(),
      this.renderSettings());
    return this.root;
  }

  applyBackground() {
    this.stage.style.backgroundImage = `url("${this.state.bg || DEFAULT_BG}")`;
  }

  renderMoves() {
    const button = (label, onclick, title) => h('button', { type: 'button', class: 'btn btn-small', title, onclick }, label);
    const names = Object.keys(this.animations);
    this.talkButton = button('Parler', () => this.toggleTalk(), 'Simule une réplique avec les images de parole');
    this.runLock = h('input', { id: uid('runlock'), type: 'checkbox' });
    const big = button('Plein écran', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.root.requestFullscreen?.().then(() => this.stage.focus()).catch(() => {});
    });
    return h('div', { class: 'btn-row chared-pg-moves' },
      h('span', { class: 'chared-label' }, 'Mouvements :'),
      button('Repos', () => this.stopAll()),
      this.talkButton,
      names.length > 8 ? this.renderMovePicker(names) : names.map((name) => button(name, () => this.play(name), `Jouer « ${name} » sur place`)),
      names.length > 1 ? button('Tout voir', () => this.parade(), 'Enchaîne toutes les animations') : null,
      h('span', { class: 'field-check chared-pg-runlock' }, this.runLock, h('label', { for: this.runLock.id }, 'Toujours courir')),
      button('Recentrer', () => {
        this.stopAll();
        this.state.pos = { x: 0.5, y: 0.86 };
      }),
      big);
  }

  renderMovePicker(names) {
    const groups = new Map();
    for (const name of names) {
      const group = name.split('-')[0];
      groups.set(group, [...(groups.get(group) || []), name]);
    }
    const select = h('select', { 'aria-label': 'Animation à jouer sur place' },
      [...groups].map(([group, list]) => h('optgroup', { label: group }, list.map((name) => h('option', { value: name }, name)))));
    select.addEventListener('change', () => this.play(select.value));
    return [select, h('button', { type: 'button', class: 'btn btn-small', onclick: () => this.play(select.value) }, 'Jouer')];
  }

  renderWarning() {
    const found = Object.keys(this.sets);
    if (found.includes('walk') || found.includes('run')) {
      return h('p', { class: 'help' },
        `Animations à ${Math.max(...found.map((set) => Object.keys(this.sets[set]).length))} directions : `,
        found.map((set) => `${SET_LABELS[set]} (${Object.keys(this.sets[set]).length})`).join(', '),
        '. Le personnage prend la direction de son déplacement et la garde à l’arrêt.');
    }
    const missing = [];
    if (!this.role('walk')) missing.push('« marche »');
    if (!this.role('run')) missing.push('« course »');
    if (!missing.length) return null;
    return h('p', { class: 'help warn' },
      `Pas d’animation ${missing.join(' ni ')} : ${this.role('walk') ? 'en courant, le personnage joue sa marche, plus vite' : 'le personnage glisse avec son image de repos'}. `,
      'Ajoutez une animation de ce nom plus bas (ou choisissez-la dans les réglages), et éventuellement « marche-haut », « marche-bas », « course-haut », « course-bas » pour les déplacements en profondeur.');
  }

  renderSettings() {
    const names = Object.keys(this.animations);
    const roles = ROLES.map((role) => {
      const id = uid('role');
      const select = h('select', { id },
        h('option', { value: '' }, '(aucune)'),
        names.map((name) => h('option', { value: name }, name)));
      select.value = this.role(role.key);
      select.addEventListener('change', () => {
        this.settings.roles[role.key] = select.value;
        this.saveSettings();
      });
      return h('div', { class: 'field' }, h('label', { for: id }, role.label), select);
    });

    const range = (label, key, min, max, step, format) => {
      const id = uid('pg');
      const out = h('output', { for: id, class: 'mono' }, format(this.settings[key]));
      const input = h('input', { id, type: 'range', min, max, step, value: String(this.settings[key]) });
      input.addEventListener('input', () => {
        this.settings[key] = Number(input.value);
        out.textContent = format(this.settings[key]);
        this.saveSettings();
      });
      return h('div', { class: 'field chared-pg-range' }, h('label', { for: id }, label, ' ', out), input);
    };
    const pct = (v) => `${Math.round(v * 100)} %`;

    const facingId = uid('facing');
    const facing = h('select', { id: facingId },
      h('option', { value: 'right' }, 'vers la droite'),
      h('option', { value: 'left' }, 'vers la gauche'));
    facing.value = this.settings.facing;
    facing.addEventListener('change', () => {
      this.settings.facing = facing.value;
      this.saveSettings();
    });

    const perspId = uid('persp');
    const persp = h('input', { id: perspId, type: 'checkbox', checked: this.settings.perspective });
    persp.addEventListener('change', () => {
      this.settings.perspective = persp.checked;
      this.saveSettings();
    });

    const file = h('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp,image/*', hidden: true });
    file.addEventListener('change', () => {
      const [picked] = file.files || [];
      if (!picked) return;
      if (this.state.bg) URL.revokeObjectURL(this.state.bg);
      this.state.bg = URL.createObjectURL(picked);
      this.applyBackground();
      file.value = '';
    });

    return h('details', { class: 'chared-pg-settings' },
      h('summary', null, 'Réglages du terrain d’essai'),
      h('p', { class: 'help' }, 'Animation jouée pour chaque déplacement. Par défaut, elles sont devinées d’après leur nom (marche, course, repos, -haut, -bas…). Ces réglages restent dans ce navigateur, ils ne modifient pas le personnage.'),
      h('div', { class: 'chared-pg-roles' }, roles),
      h('div', { class: 'chared-pg-sliders' },
        h('div', { class: 'field' }, h('label', { for: facingId }, 'Les images de côté regardent'), facing),
        range('Taille', 'height', 0.15, 1.25, 0.01, pct),
        range('Vitesse de marche', 'walkSpeed', 0.04, 0.5, 0.01, pct),
        range('Vitesse de course', 'runSpeed', 0.1, 1, 0.01, pct),
        range('Limite du sol', 'horizon', 0, 0.9, 0.01, pct),
        h('div', { class: 'field field-check' }, persp, h('label', { for: perspId }, 'Perspective (plus petit au fond)'))),
      h('div', { class: 'btn-row chared-row' },
        h('span', { class: 'chared-label' }, 'Fond :'),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => file.click() }, 'Choisir une image…'),
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          onclick: () => {
            if (this.state.bg) URL.revokeObjectURL(this.state.bg);
            this.state.bg = null;
            this.applyBackground();
          },
        }, 'Salle vide'),
        file));
  }

  bindStage() {
    const stage = this.stage;
    const point = (event) => {
      const rect = stage.getBoundingClientRect();
      return {
        x: clamp((event.clientX - rect.left) / rect.width, 0.02, 0.98),
        y: clamp((event.clientY - rect.top) / rect.height, this.settings.horizon + 0.01, 0.995),
      };
    };
    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      stage.focus();
      this.goTo(point(event), event.shiftKey);
    });
    stage.addEventListener('dblclick', (event) => this.goTo(point(event), true));
    stage.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      this.shift = event.shiftKey;
      const dir = KEYS[event.code];
      if (dir) {
        event.preventDefault();
        this.keys.add(dir);
      } else if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) this.toggleTalk();
      }
    });
    stage.addEventListener('keyup', (event) => {
      this.shift = event.shiftKey;
      const dir = KEYS[event.code];
      if (dir) this.keys.delete(dir);
    });
    stage.addEventListener('blur', () => {
      this.keys.clear();
      this.shift = false;
    });
  }

  // ---- Commands ----

  goTo(point, run) {
    this.show = null;
    this.target = { ...point, run };
    this.marker.hidden = false;
    this.marker.style.left = `${point.x * 100}%`;
    this.marker.style.top = `${point.y * 100}%`;
    this.marker.classList.toggle('is-run', run);
  }

  play(name) {
    this.target = null;
    this.marker.hidden = true;
    this.show = { name, queue: [], parade: false };
    this.restart = true;
    this.stage.focus();
  }

  parade() {
    const [first, ...rest] = Object.keys(this.animations);
    this.play(first);
    Object.assign(this.show, { queue: rest, parade: true });
  }

  stopAll() {
    this.target = null;
    this.marker.hidden = true;
    this.show = null;
    this.voice = null;
    this.syncTalk();
  }

  toggleTalk() {
    if (this.voice) {
      this.voice = null;
    } else {
      const start = performance.now();
      this.voice = {
        playing: () => true,
        level: () => {
          const t = (performance.now() - start) / 1000;
          return Math.max(0, Math.sin(t * Math.PI * 9)) * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.7))) * 0.3;
        },
      };
    }
    this.syncTalk();
  }

  syncTalk() {
    this.talkButton.textContent = this.voice ? 'Se taire' : 'Parler';
    this.talkButton.setAttribute('aria-pressed', String(Boolean(this.voice)));
  }

  // ---- Loop (called by the character editor every frame) ----

  depth(y) {
    if (!this.settings.perspective) return 1;
    const horizon = this.settings.horizon;
    return 0.45 + 0.55 * clamp((y - horizon) / Math.max(0.05, 1 - horizon), 0, 1);
  }

  tick(now) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    const { w: W, h: H } = this.size;
    if (!this.stage.isConnected || !W || !H) return;
    this.hint.hidden = document.activeElement === this.stage;

    const pos = this.state.pos;
    const s = this.settings;
    let ux = 0;
    let uy = 0;
    let run = false;
    const kx = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
    const ky = (this.keys.has('down') ? 1 : 0) - (this.keys.has('up') ? 1 : 0);
    if (kx || ky) {
      this.target = null;
      this.marker.hidden = true;
      const n = Math.hypot(kx, ky);
      ux = kx / n;
      uy = (ky / n) * DEPTH_SPEED;
      run = this.shift || this.runLock.checked;
    } else if (this.target) {
      run = this.target.run || this.runLock.checked;
      const dx = (this.target.x - pos.x) * W;
      const dy = (this.target.y - pos.y) * H;
      const dist = Math.hypot(dx, dy);
      const step = (run ? s.runSpeed : s.walkSpeed) * W * this.depth(pos.y) * dt;
      if (dist <= Math.max(1, step)) {
        pos.x = this.target.x;
        pos.y = this.target.y;
        this.target = null;
        this.marker.hidden = true;
      } else {
        ux = dx / dist;
        uy = dy / dist;
      }
    }

    const moving = Boolean(ux || uy);
    let key = '';
    let flip = null;
    const pick = (set) => {
      const found = this.dirAnim(set, this.state.dir);
      if (found) ({ name: key, flip } = found);
      return Boolean(found);
    };
    if (moving) {
      this.show = null;
      const speed = (run ? s.runSpeed : s.walkSpeed) * W * this.depth(pos.y);
      pos.x = clamp(pos.x + (ux * speed * dt) / W, 0.02, 0.98);
      pos.y = clamp(pos.y + (uy * speed * dt) / H, s.horizon + 0.01, 0.995);
      if (Math.abs(ux) > 0.15) this.state.left = ux < 0;
      this.state.dir = dirOf(ux, uy);
      if (!pick(run ? 'run' : 'walk') && !(run && pick('walk'))) {
        const vertical = Math.abs(uy) > Math.abs(ux) * 1.2 ? (uy < 0 ? 'Up' : 'Down') : '';
        const order = run ? ['run', 'walk'] : ['walk'];
        const candidates = order.flatMap((base) => (vertical ? [base + vertical, base] : [base]));
        key = candidates.map((role) => this.role(role)).find(Boolean) || '';
      }
    } else if (this.show) {
      key = this.show.name;
      if (Object.values(this.sets).some((dirs) => Object.values(dirs).includes(key))) flip = 1;
    } else if (this.voice) {
      pick('talk');
    } else if (!pick('idle')) {
      key = this.role('idle');
    }

    if (key !== this.layerKey || this.restart) {
      this.layers.get(this.layerKey ?? '')?.el.classList.remove('cur');
      this.layers.get(key)?.el.classList.add('cur');
      this.layerKey = key;
      this.layerStart = now;
      this.restart = false;
    }
    const layer = this.layers.get(key);
    if (layer.talk) {
      this.sprite.update(now, this.voice);
    } else {
      const elapsed = now - this.layerStart;
      const n = Math.floor((elapsed * layer.fps) / 1000);
      const count = layer.frames.length;
      const index = layer.loop ? n % count : Math.min(n, count - 1);
      layer.frames.forEach((frame, i) => frame.classList.toggle('on', i === index));
      if (this.show && !moving) {
        const loopMs = (count * 1000) / layer.fps;
        const showMs = layer.loop ? Math.max(1500, Math.min(loopMs * 2, 3000)) : loopMs + 500;
        if (elapsed >= showMs && this.show.queue.length) {
          const [next, ...rest] = this.show.queue;
          this.play(next);
          Object.assign(this.show, { queue: rest, parade: true });
        } else if (elapsed >= showMs && (!layer.loop || this.show.parade)) {
          this.show = null;
        }
      }
    }

    const scale = this.depth(pos.y);
    const ch = s.height * H * scale;
    const cw = ch * this.aspect;
    this.charEl.style.width = `${cw}px`;
    this.charEl.style.height = `${ch}px`;
    this.charEl.style.transform = `translate(${pos.x * W - cw / 2}px, ${pos.y * H - ch}px)`;
    this.charEl.style.zIndex = String(Math.round(pos.y * 1000));
    const looksLeft = s.facing === 'left';
    this.charEl.style.setProperty('--flip', flip ?? (this.state.left === looksLeft ? 1 : -1));

    const action = moving ? (run ? 'Course' : 'Marche') : this.show ? 'Démonstration' : this.voice ? 'Parle' : 'Repos';
    const heading = Object.keys(this.sets).length ? this.state.dir : this.state.left ? 'gauche' : 'droite';
    const text = `${action} · ${key || 'images de parole'}${moving ? ` · ${heading}` : ''}${flip === -1 ? ' (miroir)' : ''}`;
    if (text !== this.statusText) {
      this.statusText = text;
      this.status.textContent = text;
    }
  }
}
