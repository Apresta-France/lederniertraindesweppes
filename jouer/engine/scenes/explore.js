import { Scene } from './scene.js';
import { test, referencedObjects } from '../core/conditions.js';
import { resolve, ROOT } from '../core/paths.js';
import { INVENTORY_SIZE } from '../core/state.js';
import { CharacterSprite } from '../ui/character.js';
import { Overlay } from '../ui/overlay.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lcfirst = s => s ? s[0].toLowerCase() + s.slice(1) : '';
const ITEMS_BASE = new URL('shared/items/', ROOT).href;

const HELP = [
  "Survolez le décor : les objets s'éclairent et affichent leur nom.",
  "Au clavier, Tab ou les flèches passent d'un objet à l'autre, Entrée ou Espace l'examine.",
  "Cliquez sur un objet pour l'examiner. Certains changent d'état, d'autres s'ouvrent en grand.",
  "Les objets ramassés rejoignent l'inventaire : ouvrez-le avec l'icône du sac, en bas à gauche, puis cliquez sur un objet pour l'examiner.",
  "Le carnet garde vos objectifs et vos découvertes. L'objectif en cours s'affiche d'un clic sur la cible, en haut à gauche.",
  "Échap ferme une fenêtre ou l'inventaire, ou ouvre le menu (son, volume, sauvegarde).",
];
const ICONS = {
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M9.5 13.5h5"/></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z"/><path d="M8.5 4v13.5M15.5 6.5V20"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".9" class="dot"/></svg>',
};
const VOLUMES = [['music', 'Musique'], ['voice', 'Voix'], ['sfx', 'Effets']];
const JOURNAL_TABS = [['objectifs', 'Objectifs'], ['indices', 'Indices'], ['personnes', 'Personnages'], ['souvenirs', 'Souvenirs']];

const masks = new Map();
function alphaMask(url, w, h) {
  const key = `${url}|${w}x${h}`;
  if (!masks.has(key)) {
    masks.set(key, new Promise(res => {
      const im = new Image();
      im.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(im, 0, 0, w, h);
          res(g.getImageData(0, 0, w, h).data);
        } catch (e) { res(null); }
      };
      im.onerror = () => res(null);
      im.src = url;
    }));
  }
  return masks.get(key);
}

// Décor point & click : calques, zones, états d'objets, inventaire, carnet, fiches d'examen.
export class ExploreScene extends Scene {
  fadeIn = 900;

  constructor(game, data, base) {
    super(game, data, base);
    [this.W, this.H] = data.size || [1672, 941];
    this.objects = data.objects || [];
    this.defs = new Map(this.objects.map(o => [o.id, o]));
    this.masks = new Map();
    this.sounds = {};
    this.sprites = {};
    this.anims = {};
    this.livePos = {};
    this.frameTimers = {};
    this.hot = null;
    this.speaking = null;
    this.lastPick = {};
  }

  // ---- Lecture de l'état ----

  saved(id) {
    return this.game.state.data.scenes[this.id]?.objects?.[id] || {};
  }

  objectDef(id) {
    return this.defs.get(id);
  }

  objectState(id) {
    return this.saved(id).state ?? this.defs.get(id)?.state ?? null;
  }

  isHidden(id) {
    return this.saved(id).hidden ?? !!this.defs.get(id)?.hidden;
  }

  spriteOf(def) {
    if (def.character) return this.character(def.character)?.sprites?.idle && this.characterUrl(def.character, this.character(def.character).sprites.idle);
    const st = def.states?.[this.objectState(def.id)];
    const own = st?.sprite ?? st?.frames?.[0];
    return own ? this.url(own) : def.sprite ? this.url(def.sprite) : '';
  }

  character(id) {
    return this.game.data.characters[id];
  }

  characterUrl(id, path) {
    return resolve(path, this.character(id)?.base);
  }

  imagesToPreload() {
    const urls = [this.url(this.data.background?.src)];
    for (const o of this.objects) {
      if (o.sprite) urls.push(this.url(o.sprite));
      Object.values(o.states || {}).forEach(s => [s.sprite, ...(s.frames || [])].forEach(p => p && urls.push(this.url(p))));
      if (o.character) {
        const c = this.character(o.character), sp = c?.sprites || {};
        [sp.idle, ...(sp.talk || []), sp.blink].forEach(p => p && urls.push(this.characterUrl(o.character, p)));
        Object.values(c?.animations || {}).forEach(a => (a?.frames || []).forEach(p => p && urls.push(this.characterUrl(o.character, p))));
      }
    }
    return urls;
  }

  // ---- Rendu ----

  pct(v, total) {
    return `${(v / total) * 100}%`;
  }

  box([x, y, w, h]) {
    return `left:${this.pct(x, this.W)};top:${this.pct(y, this.H)};width:${this.pct(w, this.W)};height:${this.pct(h, this.H)}`;
  }

  decorHtml(d, i) {
    const cls = ['room-decor', `room-decor--${d.type}`];
    let style = '';
    if (d.type === 'shadow') {
      const [cx, cy] = d.center, [rx, ry] = d.radius, o = d.opacity ?? 0.6;
      style = `${this.box([cx - rx, cy - ry, rx * 2, ry * 2])};transform:rotate(${d.rotate || 0}deg);background:radial-gradient(ellipse 50% 50% at 50% 50%,rgba(20,10,4,${o}) 0%,rgba(20,10,4,${o * 0.55}) 45%,transparent 100%)`;
    } else {
      if (d.rect) style += this.box(d.rect) + ';';
      else style += 'inset:0;';
      if (d.background) style += `background:${d.background};`;
      if (d.type === 'shape' && typeof d.radius === 'string') style += `border-radius:${d.radius};`;
      if (d.opacity != null) style += `--o:${d.opacity};`;
    }
    if (d.blend) style += `mix-blend-mode:${d.blend};`;
    if (d.animation) cls.push(`anim-${d.animation}`);
    if (d.preset) cls.push(`preset-${d.preset}`);
    if (!d.when) cls.push('on');
    return `<div class="${cls.join(' ')}" data-decor="${i}" aria-hidden="true" style="${esc(style)}"></div>`;
  }

  objectHtml(o) {
    const hidden = this.isHidden(o.id) ? ' is-hidden' : '';
    const style = `${this.box(this.rectOf(o))}${this.saved(o.id).flip ? ';--flip:-1' : ''}`;
    if (o.character) {
      const c = this.character(o.character);
      const sp = c?.sprites || {};
      const img = p => `<img src="${esc(this.characterUrl(o.character, p))}" alt="" draggable="false">`;
      const frames = [sp.idle, sp.talk?.[0], sp.talk?.[1], sp.blink]
        .map((p, i) => p ? img(p).replace('<img ', `<img class="room-frame-img${i === 0 ? ' on' : ''}" `) : '<i></i>')
        .join('');
      const anims = Object.entries(c?.animations || {})
        .map(([name, a]) => `<div class="room-anim" data-anim="${esc(name)}">${(a?.frames || []).map(p => p ? img(p) : '<i></i>').join('')}</div>`)
        .join('');
      return `<div class="room-obj room-char${hidden}" data-id="${esc(o.id)}" style="${style}">${frames}${anims}</div>`;
    }
    const src = this.spriteOf(o);
    if (!src) return `<div class="room-zone${hidden}" data-id="${esc(o.id)}" style="${style}"></div>`;
    return `<img class="room-obj${hidden}" data-id="${esc(o.id)}" src="${esc(src)}" alt="" draggable="false" style="${style}">`;
  }

  render() {
    const d = this.data, decor = d.decor || [];
    const below = decor.map((x, i) => [x, i]).filter(([x]) => x.layer === 'below' || (x.type === 'shadow' && x.layer !== 'above'));
    const above = decor.map((x, i) => [x, i]).filter(([x]) => !below.some(([y]) => y === x));
    const order = [...this.objects].sort((a, b) => a.rect[0] - b.rect[0] || a.rect[1] - b.rect[1]);

    this.el.innerHTML = `
      <div class="room-frame" style="aspect-ratio:${this.W}/${this.H};width:min(100vw,${(this.W / this.H) * 100}vh)">
        <img class="room-bg" src="${esc(this.url(d.background?.src))}" alt="" draggable="false">
        ${below.map(([x, i]) => this.decorHtml(x, i)).join('')}
        ${this.objects.map(o => this.objectHtml(o)).join('')}
        ${above.map(([x, i]) => this.decorHtml(x, i)).join('')}
        <div class="room-hotspots" role="group" aria-label="Objets de la scène : ${esc(d.title)}">
          ${order.map(o => `<button type="button" class="room-hotspot" data-id="${esc(o.id)}" style="${this.box(this.rectOf(o))}" aria-label="${esc(o.name)}"${this.isHidden(o.id) ? ' hidden' : ''}></button>`).join('')}
        </div>
        <div class="room-hud-tl">
          <div class="room-place" aria-hidden="true">${esc(d.title)}</div>
          <button type="button" class="room-objective room-ui" aria-expanded="false" data-tip="Objectif">${ICONS.target}<span class="room-objective-t"></span></button>
        </div>
        <div class="room-hud-tr room-ui">
          <button type="button" class="room-tool room-help" aria-label="Aide" data-tip="Aide">?</button>
          <button type="button" class="room-pill room-menu">Menu</button>
        </div>
        <div class="room-dock room-ui">
          <button type="button" class="room-tool room-map" aria-label="Carte" data-tip="Carte">${ICONS.map}</button>
          <button type="button" class="room-tool room-carnet" data-tip="Carnet"><span class="room-nb"></span><span class="room-badge"></span></button>
          <div class="room-inv">
            <button type="button" class="room-tool room-inv-btn" aria-expanded="false" aria-controls="room-slots-${esc(this.id)}" aria-label="Inventaire" data-tip="Inventaire">${ICONS.bag}</button>
            <div class="room-slots" id="room-slots-${esc(this.id)}" role="group" aria-label="Inventaire">${'<button type="button" class="room-slot" aria-disabled="true" tabindex="-1" aria-label="Emplacement vide"></button>'.repeat(INVENTORY_SIZE)}</div>
          </div>
        </div>
        <div class="room-ov room-ui" hidden><div class="room-card" role="dialog" aria-modal="true"></div></div>
        <div class="room-talk" aria-hidden="true"><span></span><i></i><i></i><i></i></div>
        <div class="room-captions" aria-hidden="true">
          <div class="room-sub"><span class="who"></span><span class="txt"></span></div>
          <div class="room-say"><span class="who"></span><span class="txt"></span></div>
        </div>
        <div class="room-tip" aria-hidden="true"></div>
        <div class="room-dbgxy" aria-hidden="true"></div>
      </div>`;

    const $ = s => this.el.querySelector(s);
    this.frame = $('.room-frame');
    this.tip = $('.room-tip');
    this.overlay = new Overlay($('.room-ov'), $('.room-card'));
    this.els = Object.fromEntries([...this.el.querySelectorAll('.room-obj[data-id],.room-zone[data-id]')].map(e => [e.dataset.id, e]));
    this.hotspots = [...this.el.querySelectorAll('.room-hotspot')];
    this.decorEls = [...this.el.querySelectorAll('[data-decor]')].map(e => ({ el: e, def: decor[+e.dataset.decor] }));
    this.decorEls.forEach(x => { x.refs = referencedObjects(x.def.when); });

    for (const o of this.objects) {
      const el = this.els[o.id];
      if (o.character && el) this.sprites[o.id] = new CharacterSprite(el, [...el.children].slice(0, 4));
      this.updateMask(o);
    }
    this.refreshDecor();
    this.refreshHud();
  }

  updateMask(o) {
    const url = this.spriteOf(o);
    if (!url || o.hit === 'rect') { this.masks.set(o.id, undefined); return; }
    const [, , w, h] = o.rect.map(Math.round);
    alphaMask(url, w, h).then(m => { if (this.spriteOf(o) === url) this.masks.set(o.id, m); });
  }

  // ---- Démarrage ----

  start() {
    const d = this.data;
    if (d.music?.src) this.game.audio.music.play(this.url(d.music.src), { fade: d.music.fade ?? 2500 });

    this.listen(this.frame, 'mousemove', e => this.onMove(e));
    this.listen(this.frame, 'mouseleave', () => { this.setHot(null); this.tip.classList.remove('on'); });
    this.listen(this.frame, 'click', e => this.onClick(e));
    this.listen(window, 'keydown', e => {
      if (e.key !== 'Escape' || e.repeat) return;
      e.stopPropagation();
      if (this.overlay.isOpen) this.overlay.close();
      else if (this.invOpen) this.toggleInventory(false);
      else { this.game.audio.ui('select'); this.showPause(); }
    }, true);
    this.hotspots.forEach(b => {
      b.addEventListener('click', () => this.use(b.dataset.id));
      b.addEventListener('focus', () => { this.setHot(b.dataset.id); this.showTipFor(b.dataset.id); });
      b.addEventListener('blur', () => { this.setHot(null); this.tip.classList.remove('on'); });
      b.addEventListener('keydown', e => this.onHotspotKey(e, b));
    });
    const $ = s => this.el.querySelector(s);
    $('.room-menu').addEventListener('click', () => { this.game.audio.ui('select'); this.showPause(); });
    $('.room-carnet').addEventListener('click', () => {
      if (this.isBusy) return;
      this.game.audio.ui('click');
      const unseen = this.journalUnseen();
      this.showCarnet(JOURNAL_TABS.map(([id]) => id).find(id => unseen[id]));
    });
    $('.room-map').addEventListener('click', () => { if (this.isBusy) return; this.game.audio.ui('click'); this.showMap(); });
    $('.room-help').addEventListener('click', () => { if (this.isBusy) return; this.game.audio.ui('click'); this.showHelp(); });
    $('.room-inv-btn').addEventListener('click', () => { this.game.audio.ui('soft'); this.toggleInventory(); });
    $('.room-objective').addEventListener('click', () => { this.game.audio.ui('soft'); this.toggleObjective(); });
    $('.room-inv').addEventListener('pointerenter', () => { if (this.invPeeking) this.toggleInventory(true); });
    $('.room-slots').addEventListener('click', e => {
      const s = e.target.closest('.room-slot');
      if (!s || this.isBusy) return;
      if (this.invPeeking) this.toggleInventory(true);
      if (!s.classList.contains('full')) {
        const src = this.game.data.game.hud?.emptySlotVoice;
        if (src) this.speak({ src });
        return;
      }
      const it = this.item(s.dataset.item);
      this.game.audio.ui('soft');
      this.say(it.name, it.desc);
    });
    $('.room-card').addEventListener('click', e => this.onCardClick(e));
    $('.room-card').addEventListener('keydown', e => {
      const tab = e.target.closest('[role="tab"]');
      const step = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[e.key];
      if (!tab || !step) return;
      e.preventDefault();
      const ids = JOURNAL_TABS.map(([id]) => id);
      const i = Math.max(0, Math.min(ids.length - 1, ids.indexOf(tab.dataset.tab) + step));
      this.showCarnet(ids[i], { focusTab: true });
    });
    $('.room-card').addEventListener('input', e => {
      const r = e.target.closest('[data-volume]');
      if (!r) return;
      this.game.settings.set({ [r.dataset.volume]: +r.value });
      if (r.dataset.volume === 'sfx') this.game.audio.ui('hover');
      this.refreshPause();
    });

    this.cleanups.push(this.game.state.on('change', ev => this.onStateChange(ev)));
    this.cleanups.push(this.game.on('debug', () => this.applyDebug()));
    this.applyDebug();
    if (matchMedia('(hover: none)').matches) this.frame.classList.add('touch');

    for (const o of this.objects) if (o.animation) this.animate({ object: o.id, animation: o.animation });

    const loop = now => {
      for (const [id, sp] of Object.entries(this.sprites)) sp.update(now, this.speaking?.objectId === id ? this.speaking.handle : null);
      this.tickAnims(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.onDispose(() => {
      cancelAnimationFrame(this.raf);
      Object.values(this.anims).forEach(st => st.done());
      Object.values(this.sounds).forEach(h => h.stop());
      this.speaking?.handle.stop();
    });

    for (const o of this.objects) {
      const snd = o.states?.[this.objectState(o.id)]?.sound;
      if (snd) this.playStateSound(o.id, this.objectState(o.id), snd);
      this.cycleFrames(o.id);
    }

    this.announce([d.title, d.background?.alt, this.objectiveText()].filter(Boolean).join('. '));
    this.later(() => this.peekObjective(), 1600);
    this.run(d.onEnter);
  }

  // ---- Souris et clavier ----

  pointer(e) {
    const r = this.frame.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * this.W, (e.clientY - r.top) / r.height * this.H, e.clientX - r.left, e.clientY - r.top];
  }

  hit(px, py) {
    const inRect = (o, [x, y, w, h] = this.rectOf(o)) => px >= x && py >= y && px < x + w && py < y + h;
    const drawn = this.objects.filter(o => this.spriteOf(o) && o.hit !== 'rect');
    for (let i = drawn.length - 1; i >= 0; i--) {
      const o = drawn[i];
      if (this.isHidden(o.id) || !inRect(o)) continue;
      const m = this.masks.get(o.id);
      if (!m) return o.id;
      const [x, y, w] = this.rectOf(o).map(Math.round);
      if (m[((Math.floor(py - y) * w) + Math.floor(px - x)) * 4 + 3] > 40) return o.id;
    }
    const zones = this.objects.filter(o => !this.spriteOf(o) || o.hit === 'rect');
    for (let i = zones.length - 1; i >= 0; i--) {
      if (!this.isHidden(zones[i].id) && inRect(zones[i])) return zones[i].id;
    }
    return null;
  }

  onMove(e) {
    const [px, py, cx, cy] = this.pointer(e);
    if (this.debug) this.el.querySelector('.room-dbgxy').textContent = `x ${Math.round(px)} · y ${Math.round(py)}${this.hit(px, py) ? ' · ' + this.hit(px, py) : ''}`;
    if (e.target.closest('.room-ui')) {
      this.setHot(null);
      const s = e.target.closest('.room-slot.full');
      const tool = e.target.closest('[data-tip]');
      if (s) this.placeTip(this.item(s.dataset.item).name, cx, cy);
      else if (tool && !tool.classList.contains('open')) this.placeTip(tool.dataset.tip, cx, cy);
      else this.tip.classList.remove('on');
      return;
    }
    const id = this.isBusy ? null : this.hit(px, py);
    this.setHot(id);
    if (id) this.placeTip(this.defs.get(id).name, cx, cy);
    else this.tip.classList.remove('on');
  }

  onClick(e) {
    if (e.target.closest('.room-ui') || e.target.closest('.room-hotspot')) return;
    const [px, py] = this.pointer(e);
    const id = this.hit(px, py);
    if (id) this.use(id);
    else this.hideSay();
  }

  onHotspotKey(e, b) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const list = this.hotspots.filter(h => !h.hidden);
    const i = list.indexOf(b);
    list[(i + keys[e.key] + list.length) % list.length]?.focus();
  }

  setHot(id) {
    if (id === this.hot) return;
    if (this.hot) this.els[this.hot]?.classList.remove('hot');
    this.hot = id;
    if (id) this.els[id]?.classList.add('hot');
    this.frame.classList.toggle('hot', !!id);
  }

  placeTip(text, x, y) {
    this.tip.textContent = text;
    this.tip.style.left = x + 'px';
    this.tip.style.top = y + 'px';
    this.tip.classList.add('on');
  }

  showTipFor(id) {
    const o = this.defs.get(id), fr = this.frame.getBoundingClientRect();
    const [x, y, w] = this.rectOf(o);
    this.placeTip(o.name, (x + w / 2) / this.W * fr.width, y / this.H * fr.height + 8);
  }

  applyDebug() {
    this.debug = !!this.game.debug.zones;
    this.frame.classList.toggle('dbg', this.debug);
  }

  // ---- Interaction ----

  // Occupée aussi tant qu'un personnage parle, même si la suite d'actions est déjà finie.
  get isBusy() {
    return super.isBusy || !!this.speaking;
  }

  busyChanged() {
    const busy = this.isBusy;
    this.frame?.classList.toggle('busy', busy);
    if (busy) {
      this.setHot(null);
      this.tip?.classList.remove('on');
    }
  }

  use(id) {
    const def = this.defs.get(id);
    if (!def || this.isHidden(id) || this.overlay.isOpen || this.isBusy) return;
    const actions = def.onUse ?? (def.description ? [{ do: 'sfx', name: 'soft' }, { do: 'say', text: def.description }] : []);
    this.run(actions, { object: def });
  }

  setObjectState(id, state) {
    const def = this.defs.get(id);
    if (!def || state == null) return;
    this.game.state.setObject(this.id, id, { state });
    const el = this.els[id];
    const src = this.spriteOf(def);
    if (el?.tagName === 'IMG' && src && el.src !== src) el.src = src;
    this.updateMask(def);
    this.sounds[id]?.stop();
    delete this.sounds[id];
    const snd = def.states?.[state]?.sound;
    if (snd) this.playStateSound(id, state, snd);
    this.cycleFrames(id);
    this.decorEls.forEach(x => {
      if (x.def.preset === 'crt-on' && x.refs.has(id) && test(x.def.when, { game: this.game, scene: this })) {
        x.el.classList.remove('go');
        void x.el.offsetWidth;
        x.el.classList.add('go');
      }
    });
  }

  // État avec frames : les images alternent toutes les interval ms (2500 par défaut) tant que l'état dure.
  cycleFrames(id) {
    clearTimeout(this.frameTimers[id]);
    delete this.frameTimers[id];
    const st = this.defs.get(id)?.states?.[this.objectState(id)];
    const frames = st?.frames || [];
    const el = this.els[id];
    if (frames.length < 2 || el?.tagName !== 'IMG' || this.reduceMotion) return;
    let i = 0;
    const step = () => {
      i = (i + 1) % frames.length;
      el.src = this.url(frames[i]);
      this.frameTimers[id] = this.later(step, st.interval ?? 2500);
    };
    this.frameTimers[id] = this.later(step, st.interval ?? 2500);
  }

  playStateSound(id, state, snd) {
    this.showSoundLegend(snd.src);
    this.sounds[id] = this.game.audio.playSample(this.url(snd.src), {
      loop: !!snd.loop,
      onEnded: () => {
        delete this.sounds[id];
        if (!this.disposed && this.objectState(id) === state) this.run(snd.onEnded, { object: this.defs.get(id) });
      },
    });
  }

  setObjectHidden(id, hidden, { fade = false } = {}) {
    if (!this.defs.has(id)) return;
    this.game.state.setObject(this.id, id, { hidden });
    const el = this.els[id];
    if (el) {
      el.classList.toggle('fade', fade);
      el.classList.toggle('is-hidden', hidden);
    }
    const b = this.hotspots.find(h => h.dataset.id === id);
    if (b) {
      if (hidden && document.activeElement === b) this.focusNeighbour(b);
      b.hidden = hidden;
    }
    if (hidden && this.hot === id) this.setHot(null);
  }

  focusNeighbour(b) {
    const list = this.hotspots.filter(h => !h.hidden);
    const i = list.indexOf(b);
    (list[i + 1] || list[i - 1])?.focus();
  }

  // ---- Animations (character.json › animations) et déplacements ----

  // Rectangle courant : la position déplacée (sauvegardée, ou en cours de trajet) remplace x, y.
  rectOf(o) {
    const p = this.livePos[o.id] ?? this.saved(o.id).pos;
    return Array.isArray(p) ? [p[0], p[1], o.rect[2], o.rect[3]] : o.rect;
  }

  placeObject(id) {
    const [x, y] = this.rectOf(this.defs.get(id));
    for (const el of [this.els[id], this.hotspots.find(h => h.dataset.id === id)]) {
      if (!el) continue;
      el.style.left = this.pct(x, this.W);
      el.style.top = this.pct(y, this.H);
    }
  }

  moveTo(id, [x, y]) {
    delete this.livePos[id];
    this.game.state.setObject(this.id, id, { pos: [Math.round(x), Math.round(y)] });
    this.placeObject(id);
  }

  // animate { object, animation?, to?: [x, y], duration?, speed?, flip?, hold?, keep?, wait? }
  // Sans durée ni trajet, une animation en boucle tourne jusqu'au prochain animate sur l'objet.
  // Pendant une réplique, un personnage immobile reprend ses images de parole.
  animate(a, ctx = {}) {
    const id = a.object ?? ctx.object?.id;
    const def = this.defs.get(id), el = this.els[id];
    if (!def || !el) return;
    this.endAnim(id);
    el.classList.remove('animating');
    el.querySelectorAll('.room-anim.cur, .room-anim > .on').forEach(x => x.classList.remove('cur', 'on'));
    if (typeof a.flip === 'boolean') {
      this.game.state.setObject(this.id, id, { flip: a.flip });
      el.style.setProperty('--flip', a.flip ? -1 : 1);
    }

    const name = a.animation;
    const anim = name && def.character ? this.character(def.character)?.animations?.[name] : null;
    if (name && !anim) console.warn(`[animate] animation « ${name} » introuvable pour « ${id} »`);
    const layer = anim ? [...el.querySelectorAll('.room-anim')].find(x => x.dataset.anim === name) : null;
    const frames = layer ? [...layer.children] : [];
    const fps = anim?.fps > 0 ? anim.fps : 8;
    const loop = anim?.loop !== false;
    const from = this.rectOf(def);
    const to = Array.isArray(a.to) && a.to.length >= 2 ? a.to : null;

    if (this.reduceMotion || (!frames.length && !to)) {
      if (to) this.moveTo(id, to);
      return;
    }
    const moveMs = to ? Math.max(0, a.duration ?? Math.hypot(to[0] - from[0], to[1] - from[1]) / (a.speed ?? 200) * 1000) : 0;
    const playMs = to ? (a.keep ? Infinity : moveMs)
      : a.duration != null ? a.duration
        : loop ? Infinity : frames.length * 1000 / fps;
    let resolve;
    const finished = new Promise(res => { resolve = res; });
    const start = performance.now();
    this.anims[id] = {
      id, el, layer, frames, fps, loop, from, to, moveMs, cur: -1,
      start, end: start + playMs, hold: !!a.hold,
      done: () => { resolve(); },
    };
    if (layer) {
      layer.classList.add('cur');
      el.classList.add('animating');
    }
    if (a.wait && (Number.isFinite(playMs) || to)) return finished;
  }

  tickAnims(now) {
    for (const st of Object.values(this.anims)) {
      const t = now - st.start;
      if (st.to) {
        const k = st.moveMs ? Math.min(1, t / st.moveMs) : 1;
        this.livePos[st.id] = [st.from[0] + (st.to[0] - st.from[0]) * k, st.from[1] + (st.to[1] - st.from[1]) * k];
        this.placeObject(st.id);
        if (k >= 1) {
          this.moveTo(st.id, st.to);
          st.to = null;
          st.done();
        }
      }
      if (st.frames.length) {
        const n = Math.floor(t * st.fps / 1000);
        const i = st.loop ? n % st.frames.length : Math.min(n, st.frames.length - 1);
        if (i !== st.cur) {
          st.frames[st.cur]?.classList.remove('on');
          st.frames[i].classList.add('on');
          st.cur = i;
        }
        const talking = this.speaking?.objectId === st.id && !st.to;
        st.el.classList.toggle('animating', !talking);
      }
      if (now >= st.end) this.endAnim(st.id, true);
    }
  }

  // natural : fin prévue (hold garde alors la dernière image) ; sinon interruption par un autre animate.
  endAnim(id, natural = false) {
    const st = this.anims[id];
    if (!st) return;
    delete this.anims[id];
    if (st.to) this.moveTo(id, this.livePos[id] ?? st.from);
    if (!(natural && st.hold)) {
      st.el.classList.remove('animating');
      st.layer?.classList.remove('cur');
      st.frames.forEach(f => f.classList.remove('on'));
    }
    st.done();
  }

  say(who, text) {
    const s = this.el.querySelector('.room-say');
    clearTimeout(this.sayT);
    const w = s.querySelector('.who');
    w.textContent = who || '';
    w.style.display = who ? '' : 'none';
    s.querySelector('.txt').textContent = text;
    s.classList.remove('on');
    void s.offsetWidth;
    s.classList.add('on');
    this.sayT = this.later(() => s.classList.remove('on'), 2600 + text.length * 45);
    this.announce(who ? `${who} : ${text}` : text);
  }

  hideSay() {
    this.el.querySelector('.room-say').classList.remove('on');
  }

  // Légende d'un fichier (sounds[src].caption), ou le sous-titre écrit sur l'action s'il y en a un.
  legendFor(src, explicit = '') {
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    const entry = src && this.data.sounds?.[src];
    return entry && typeof entry.caption === 'string' ? entry.caption.trim() : '';
  }

  // Bandeau du bas, pour les personnes malentendantes. hold : reste jusqu'à hideLegend (fin du son).
  showLegend(who, text, { hold = false } = {}) {
    const el = this.el.querySelector('.room-sub');
    if (!el || !text) return 0;
    clearTimeout(this.legendT);
    this.legendToken = (this.legendToken || 0) + 1;
    const token = this.legendToken;
    el.querySelector('.who').textContent = who || '';
    el.querySelector('.txt').textContent = text;
    el.classList.add('on');
    this.announce(who ? `${who} : ${text}` : text);
    if (!hold) {
      this.legendT = this.later(() => {
        if (this.legendToken === token) el.classList.remove('on');
      }, 2600 + text.length * 45);
    }
    return token;
  }

  hideLegend() {
    clearTimeout(this.legendT);
    this.legendToken = (this.legendToken || 0) + 1;
    this.el.querySelector('.room-sub')?.classList.remove('on');
  }

  showSoundLegend(src) {
    const text = this.legendFor(src);
    if (text) this.showLegend('', text);
  }

  // Voix : { character, src | pool (+ pick), subtitle, wait }. La bouche du personnage suit le son.
  // Avec wait, l'action suivante attend la fin de la réplique (ou son interruption).
  // La légende (onglet Sons, ou subtitle) reste affichée le temps du son, même si la voix est coupée.
  speak(a) {
    const audio = this.game.audio;
    let file = a.src || '';
    let src = file ? this.url(file) : '';
    let explicit = a.subtitle;
    const c = a.character ? this.character(a.character) : null;
    if (!src && c && a.pool) {
      const pool = c.voice?.[a.pool] || [];
      if (!pool.length) return;
      const key = `${a.character}:${a.pool}`;
      let n = 0;
      if (pool.length > 1) {
        do { n = Math.floor(Math.random() * pool.length); } while (n === this.lastPick[key]);
      }
      this.lastPick[key] = n;
      file = '';
      src = this.characterUrl(a.character, pool[n].src);
      if (typeof explicit !== 'string' || !explicit.trim()) explicit = pool[n].subtitle;
    }
    const legend = this.legendFor(file, explicit);
    const who = c?.name || '';
    if (!src) {
      if (legend) this.showLegend(who, legend);
      return;
    }
    this.speaking?.handle.stop();
    if (!audio.volume('voice')) {
      if (legend) this.showLegend(who, legend);
      return;
    }
    const handle = audio.voice.play(src);
    const obj = a.character ? this.objects.find(o => o.character === a.character) : null;
    const talk = this.el.querySelector('.room-talk');
    this.speaking = { handle, objectId: obj?.id };
    this.busyChanged();
    if (obj?.bubble) {
      const [x, y] = this.rectOf(obj);
      talk.style.left = this.pct(obj.bubble[0] + x - obj.rect[0], this.W);
      talk.style.top = this.pct(obj.bubble[1] + y - obj.rect[1], this.H);
      talk.querySelector('span').textContent = c?.name || obj.name;
      handle.el.addEventListener('playing', () => talk.classList.add('on'), { once: true });
    }
    let ended;
    const done = new Promise(res => { ended = res; });
    const hold = legend ? this.showLegend(who, legend, { hold: true }) : 0;
    handle.onEnd = () => {
      talk.classList.remove('on');
      if (this.speaking?.handle === handle) {
        this.speaking = null;
        if (!this.disposed) this.busyChanged();
      }
      if (hold && this.legendToken === hold) this.el.querySelector('.room-sub')?.classList.remove('on');
      ended();
    };
    if (a.wait) return done;
  }

  // ---- HUD ----

  item(id) {
    const it = this.game.data.items[id] || { name: id, desc: '' };
    return { ...it, id, iconUrl: it.icon ? resolve(it.icon, ITEMS_BASE) : '' };
  }

  objectiveText() {
    const st = this.game.state.data, id = st.objective;
    if (!id) return '';
    return `Objectif : ${lcfirst(this.data.objectives?.[id] ?? st.journal.objectives[id]?.label ?? id)}`;
  }

  onStateChange(ev) {
    this.refreshDecor();
    this.refreshHud(ev);
    if (ev.kind === 'objective' && this.game.state.data.objective) this.announce(this.objectiveText());
  }

  refreshDecor() {
    const ctx = { game: this.game, scene: this };
    this.decorEls.forEach(x => { if (x.def.when) x.el.classList.toggle('on', test(x.def.when, ctx)); });
  }

  // Tiroir d'inventaire (icône du sac). peek : ouverture brève à la prise d'un objet.
  toggleInventory(open = !this.invOpen, { peek = false } = {}) {
    clearTimeout(this.invPeekT);
    this.invOpen = open;
    this.invPeeking = open && peek;
    const inv = this.el.querySelector('.room-inv');
    inv.classList.toggle('open', open);
    this.frame.classList.toggle('inv-open', open);
    inv.querySelector('.room-inv-btn').setAttribute('aria-expanded', String(open));
    if (this.invPeeking) this.invPeekT = this.later(() => this.toggleInventory(false), 3200);
  }

  // Objectif replié en une cible ; un clic le déplie, et il se montre seul quelques secondes quand il change.
  toggleObjective(open = !this.objOpen) {
    clearTimeout(this.objPeekT);
    this.objOpen = open;
    const b = this.el.querySelector('.room-objective');
    b.classList.toggle('open', open);
    b.setAttribute('aria-expanded', String(open));
    if (open) this.tip.classList.remove('on');
  }

  peekObjective(ms = 6000) {
    if (!this.objectiveText() || this.objOpen) return;
    this.toggleObjective(true);
    this.objPeekT = this.later(() => this.toggleObjective(false), ms);
  }

  refreshHud(ev = {}) {
    const st = this.game.state.data;
    const obj = this.el.querySelector('.room-objective');
    const text = this.objectiveText();
    obj.hidden = !text;
    obj.setAttribute('aria-label', text || 'Objectif');
    obj.querySelector('.room-objective-t').textContent = text;
    if (ev.kind === 'objective' && text) {
      obj.classList.remove('new');
      void obj.offsetWidth;
      obj.classList.add('new');
      this.peekObjective();
    }
    if (ev.kind === 'inventory' && ev.added && (!this.invOpen || this.invPeeking)) this.toggleInventory(true, { peek: true });

    this.el.querySelectorAll('.room-slot').forEach((s, i) => {
      const id = st.inventory[i];
      s.className = 'room-slot' + (id ? ' full' : '');
      if (id) {
        s.removeAttribute('aria-disabled');
        s.removeAttribute('tabindex');
      } else {
        s.setAttribute('aria-disabled', 'true');
        s.setAttribute('tabindex', '-1');
      }
      if (!id) {
        s.removeAttribute('data-item');
        s.setAttribute('aria-label', 'Emplacement vide');
        s.innerHTML = '';
        return;
      }
      const it = this.item(id);
      s.dataset.item = id;
      s.setAttribute('aria-label', it.name);
      s.innerHTML = it.iconUrl ? `<img src="${esc(it.iconUrl)}" alt="">` : esc(it.name);
      if (ev.kind === 'inventory' && ev.added === id) { void s.offsetWidth; s.classList.add('new'); }
    });

    const badge = this.el.querySelector('.room-carnet .room-badge');
    const unseen = Object.values(this.journalUnseen()).reduce((a, b) => a + b, 0);
    badge.textContent = unseen;
    badge.classList.toggle('on', unseen > 0);
    this.el.querySelector('.room-carnet').setAttribute('aria-label', unseen ? `Carnet, ${unseen} nouveauté(s)` : 'Carnet');
    if (ev.kind === 'notes') this.announce(`Nouvel indice dans le carnet : ${ev.added}`);
    if (ev.kind === 'journal' && ev.section === 'people') {
      const name = this.character(ev.person)?.name || ev.person;
      this.announce(ev.fact ? `Carnet, ${name} : ${ev.fact}` : `Nouveau personnage dans le carnet : ${name}`);
    }
    if (ev.kind === 'journal' && ev.section === 'memories') this.announce(`Nouveau souvenir dans le carnet : ${ev.title}`);
  }

  // ---- Carnet ----

  journalCounts() {
    const st = this.game.state.data, people = Object.values(st.journal.people);
    return {
      indices: st.notes.length,
      personnes: people.length + people.reduce((n, p) => n + p.facts.length, 0),
      souvenirs: st.journal.memories.length,
    };
  }

  journalUnseen() {
    const counts = this.journalCounts(), seen = this.game.state.data.journal.seen;
    return Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, Math.max(0, n - (seen[k] ?? 0))]));
  }

  // ---- Fenêtres ----

  onCardClick(e) {
    if (e.target.closest('[data-close]')) { this.overlay.close(); return; }
    const pause = e.target.closest('[data-pause]');
    if (pause) { this.pauseAction(pause.dataset.pause); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab && this.carnetOpen) {
      this.game.audio.ui('soft');
      this.showCarnet(tab.dataset.tab, { focusTab: tab.getAttribute('role') === 'tab' });
      return;
    }
    const mem = e.target.closest('[data-memory]');
    if (mem && this.carnetOpen) {
      this.game.audio.ui('soft');
      this.showCarnet('souvenirs', { memory: +mem.dataset.memory });
      this.el.querySelector('.room-memory-full .room-btn')?.focus();
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn || !this.openPanelId || this.isBusy) return;
    const action = this.visiblePanelActions()[+btn.dataset.action];
    if (!action) return;
    const panelId = this.openPanelId;
    this.run(action.do, { object: this.panelObject }).then(() => {
      if (this.overlay.isOpen && this.openPanelId === panelId) this.renderPanel(true);
    });
  }

  visiblePanelActions() {
    const ctx = { game: this.game, scene: this };
    return (this.data.panels?.[this.openPanelId]?.actions || []).filter(a => test(a.when, ctx));
  }

  openPanel(panelId, ctx = {}) {
    if (!this.data.panels?.[panelId]) return;
    this.openPanelId = panelId;
    this.panelObject = ctx.object;
    this.panelNoteText = '';
    this.overlay.onClose = () => { this.openPanelId = null; };
    this.hideSay();
    this.tip.classList.remove('on');
    this.renderPanel(false);
  }

  renderPanel(refresh) {
    const p = this.data.panels[this.openPanelId];
    const ctx = { game: this.game, scene: this };
    const image = (p.image || []).find(im => test(im.when, ctx));
    const facts = (p.facts || []).filter(f => test(f.when, ctx));
    const html = `
      ${image ? `<div class="room-zoom"><div class="shade"></div><img src="${esc(this.url(image.src))}" alt=""></div>` : ''}
      <div class="room-info">
        ${p.kicker ? `<div class="k">${esc(p.kicker)}</div>` : ''}
        <h3>${esc(p.title)}</h3>
        <div class="room-orn"><b></b><i></i><b></b></div>
        ${p.text ? `<p>${esc(p.text)}</p>` : ''}
        ${facts.length ? `<dl class="room-facts">${facts.map(f => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>` : ''}
        <div class="room-note" role="status">${esc(this.panelNoteText)}</div>
        <div class="room-acts">${this.visiblePanelActions().map((a, i) => `<button type="button" class="room-btn${a.style === 'ghost' ? ' ghost' : ''}" data-action="${i}">${esc(a.label)}</button>`).join('')}</div>
      </div>`;
    if (refresh) this.overlay.refresh(html);
    else {
      this.overlay.open(html, { single: !image, label: p.title });
      this.announce([p.title, p.text, ...facts.map(f => `${f.label} : ${f.value}`)].filter(Boolean).join('. '));
    }
  }

  panelNote(text) {
    this.panelNoteText = text || '';
    const n = this.el.querySelector('.room-note');
    if (n) n.textContent = this.panelNoteText;
  }

  closePanel() {
    this.overlay.close();
  }

  // Carnet à onglets. memory : index d'un souvenir à afficher en grand dans l'onglet Souvenirs.
  showCarnet(tab = this.carnetTab || 'objectifs', { memory = null, focusTab = false } = {}) {
    const st = this.game.state.data;
    const unseen = this.journalUnseen();
    const seenBefore = { ...st.journal.seen };
    this.carnetTab = tab;
    if (tab in unseen) {
      st.journal.seen[tab] = this.journalCounts()[tab];
      this.game.autosave();
    }
    const body = {
      objectifs: () => this.carnetObjectives(),
      indices: () => this.carnetNotes(seenBefore.indices ?? 0),
      personnes: () => this.carnetPeople(),
      souvenirs: () => memory != null ? this.carnetMemory(memory) : this.carnetMemories(seenBefore.souvenirs ?? 0),
    }[tab]();
    const tabs = JOURNAL_TABS.map(([id, label]) => {
      const n = id === tab ? 0 : unseen[id] || 0;
      return `<button type="button" role="tab" class="room-tab" id="room-tab-${id}" data-tab="${id}" aria-selected="${id === tab}" aria-controls="room-tabpanel" tabindex="${id === tab ? 0 : -1}">${label}${n ? `<span class="room-tab-dot" aria-label="${n} nouveauté(s)">${n}</span>` : ''}</button>`;
    }).join('');
    const html = `<div class="room-info room-journal">
      <div class="k">Carnet</div>
      <div class="room-tabs" role="tablist" aria-label="Rubriques du carnet">${tabs}</div>
      <div class="room-tabpanel" id="room-tabpanel" role="tabpanel" aria-labelledby="room-tab-${tab}">${body}</div>
    </div>`;
    if (this.carnetOpen && this.overlay.isOpen) this.overlay.refresh(html);
    else {
      this.openPanelId = null;
      this.overlay.open(html, { single: true, label: 'Carnet', cls: 'room-card--journal' });
      this.carnetOpen = true;
      this.overlay.onClose = () => { this.carnetOpen = false; };
    }
    if (focusTab) this.el.querySelector(`#room-tab-${tab}`)?.focus();
    this.refreshHud();
  }

  // Regroupe des entrées { place } par lieu, dans l'ordre d'apparition.
  byPlace(entries, row) {
    const groups = new Map();
    entries.forEach((e, i) => {
      const k = e.place || '';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(row(e, i));
    });
    return [...groups].map(([place, rows]) => `${place ? `<div class="room-journal-place">${esc(place)}</div>` : ''}<ul class="room-list">${rows.join('')}</ul>`).join('');
  }

  carnetObjectives() {
    const st = this.game.state.data, log = { ...st.journal.objectives };
    for (const id of [...st.done, st.objective].filter(Boolean)) {
      log[id] ??= { label: this.data.objectives?.[id] ?? id, place: this.data.title };
    }
    const cur = st.objective && log[st.objective];
    const done = st.done.filter(id => log[id]).map(id => log[id]);
    return `<div class="room-journal-h">En cours</div>
      <ul class="room-list">${cur ? `<li class="cur"><span class="sr-only">En cours : </span>${esc(cur.label)}</li>` : '<li class="muted">Aucun objectif en cours.</li>'}</ul>
      ${done.length ? `<div class="room-journal-h">Accomplis</div>${this.byPlace(done, o => `<li class="done"><span class="sr-only">Terminé : </span>${esc(o.label)}</li>`)}` : ''}`;
  }

  carnetNotes(seen) {
    const notes = this.game.state.data.notes.map(n => typeof n === 'string' ? { text: n } : n);
    if (!notes.length) return '<p class="room-journal-empty">Aucun indice pour le moment. Examinez les lieux.</p>';
    return this.byPlace(notes, (n, i) => `<li${i >= seen ? ' class="new"' : ''}>${esc(n.text)}</li>`);
  }

  carnetPeople() {
    const people = Object.entries(this.game.state.data.journal.people);
    if (!people.length) return '<p class="room-journal-empty">Personne pour le moment.</p>';
    return `<ul class="room-people">${people.map(([id, p]) => {
      const c = this.character(id);
      const pic = c?.portrait || c?.sprites?.idle;
      return `<li class="room-person">
        <div class="room-person-pic">${pic ? `<img src="${esc(this.characterUrl(id, pic))}" alt="">` : ''}</div>
        <div class="room-person-txt">
          <div class="room-person-name">${esc(c?.name || id)}</div>
          ${c?.role ? `<div class="room-person-role">${esc(c.role)}</div>` : ''}
          ${p.facts.length ? `<ul class="room-list">${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="room-journal-empty">Rien de plus pour l\'instant.</p>'}
        </div>
      </li>`;
    }).join('')}</ul>`;
  }

  carnetMemories(seen) {
    const list = this.game.state.data.journal.memories;
    if (!list.length) return '<p class="room-journal-empty">Aucun souvenir pour le moment.</p>';
    return `<ul class="room-memories">${list.map((m, i) => `<li><button type="button" class="room-memory${i >= seen ? ' new' : ''}" data-memory="${i}">
      <span class="room-memory-pic">${m.src ? `<img src="${esc(resolve(m.src, ROOT))}" alt="">` : ''}</span>
      <span class="room-memory-t">${esc(m.title || '')}</span>
    </button></li>`).join('')}</ul>`;
  }

  carnetMemory(i) {
    const m = this.game.state.data.journal.memories[i];
    if (!m) return this.carnetMemories(Infinity);
    return `<div class="room-memory-full">
      ${m.src ? `<img src="${esc(resolve(m.src, ROOT))}" alt="">` : ''}
      <h3>${esc(m.title || '')}</h3>
      ${m.place ? `<div class="room-journal-place">${esc(m.place)}</div>` : ''}
      ${m.text ? `<p>${esc(m.text)}</p>` : ''}
      <div class="room-acts"><button type="button" class="room-btn ghost" data-tab="souvenirs">Retour aux souvenirs</button></div>
    </div>`;
  }

  showMap() {
    this.openPanelId = null;
    this.overlay.open(`<div class="room-info">
      <div class="k">Carte</div><h3>${esc(this.data.title)}</h3><div class="room-orn"><b></b><i></i><b></b></div>
      <p>La carte des Weppes se dévoilera au fil de l'aventure.</p>
      <div class="room-acts"><button type="button" class="room-btn" data-close>Fermer</button></div>
    </div>`, { single: true, label: 'Carte' });
  }

  showHelp() {
    this.openPanelId = null;
    this.overlay.open(`<div class="room-info">
      <div class="k">Aide</div><h3>Comment jouer</h3><div class="room-orn"><b></b><i></i><b></b></div>
      <ul class="room-list">${HELP.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
      <div class="room-acts"><button type="button" class="room-btn" data-close>Compris</button></div>
    </div>`, { single: true, label: 'Aide' });
  }

  // popup { kicker?, title, text: texte ou liste de paragraphes, button? } : attend la fermeture.
  popup(a) {
    const paras = (Array.isArray(a.text) ? a.text : [a.text]).filter(Boolean);
    this.openPanelId = null;
    this.hideSay();
    this.tip.classList.remove('on');
    return new Promise(res => {
      this.overlay.onClose = () => { this.overlay.onClose = null; res(); };
      this.overlay.open(`<div class="room-info">
        ${a.kicker ? `<div class="k">${esc(a.kicker)}</div>` : ''}<h3>${esc(a.title)}</h3><div class="room-orn"><b></b><i></i><b></b></div>
        ${paras.map(p => `<p>${esc(p)}</p>`).join('')}
        <div class="room-acts"><button type="button" class="room-btn" data-close>${esc(a.button || 'Continuer')}</button></div>
      </div>`, { single: true, label: a.title || '' });
      this.announce([a.title, ...paras].filter(Boolean).join('. '));
    });
  }

  showPause() {
    const s = this.game.settings.values;
    this.openPanelId = null;
    this.panelNoteText = '';
    this.hideSay();
    this.tip.classList.remove('on');
    const ranges = VOLUMES.map(([id, label]) => `<label class="room-range"><span class="room-range-l"><span>${label}</span><span class="v">${s[id]}</span></span><input type="range" min="0" max="100" value="${s[id]}" data-volume="${id}"></label>`).join('');
    this.overlay.open(`<div class="room-info">
      <div class="k">Menu</div><h3>Pause</h3><div class="room-orn"><b></b><i></i><b></b></div>
      <button type="button" class="room-opt" data-pause="sound" role="switch" aria-checked="${!!s.sound}"><span>Son</span><span class="room-switch" aria-hidden="true"></span></button>
      <div class="room-ranges" role="group" aria-label="Volume">${ranges}</div>
      <div class="room-note" role="status"></div>
      <div class="room-acts room-acts--col">
        <button type="button" class="room-btn" data-close>Reprendre</button>
        <button type="button" class="room-btn ghost" data-pause="save">Sauvegarder</button>
        <button type="button" class="room-btn ghost" data-pause="quit">Revenir au menu principal</button>
      </div>
    </div>`, { single: true, label: 'Menu' });
    this.refreshPause();
  }

  refreshPause() {
    const card = this.el.querySelector('.room-card'), s = this.game.settings.values;
    const sw = card.querySelector('[data-pause="sound"]');
    if (!sw) return;
    sw.setAttribute('aria-checked', String(!!s.sound));
    card.querySelector('.room-ranges').classList.toggle('off', !s.sound);
    card.querySelectorAll('[data-volume]').forEach(r => {
      r.value = s[r.dataset.volume];
      r.closest('.room-range').querySelector('.v').textContent = s[r.dataset.volume];
    });
  }

  pauseAction(id) {
    const { game } = this;
    if (id === 'sound') {
      const on = !game.settings.values.sound;
      game.settings.set({ sound: on });
      if (on) { game.audio.unlock(); game.audio.ui('click'); }
      this.refreshPause();
      this.announce(on ? 'Son activé' : 'Son coupé');
    } else if (id === 'save') {
      const ok = game.save();
      game.audio.ui(ok ? 'ding' : 'soft');
      const text = ok ? 'Partie sauvegardée.' : 'Sauvegarde impossible : le cookie de sauvegarde est désactivé dans les options.';
      this.panelNote(text);
      this.announce(text);
    } else if (id === 'quit') {
      game.audio.ui('select');
      if (game.saves.current) game.save();
      this.overlay.close();
      game.shell.toMenu();
    }
  }
}
