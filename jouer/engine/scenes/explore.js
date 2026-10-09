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
  "Les objets ramassés rejoignent l'inventaire, en bas de l'écran. Cliquez dessus pour les examiner.",
  "Le carnet garde vos objectifs et vos découvertes.",
  "Échap ferme une fenêtre ouverte, ou ouvre le menu (son, volume, sauvegarde).",
];
const VOLUMES = [['music', 'Musique'], ['voice', 'Voix'], ['sfx', 'Effets']];

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
    return st?.sprite ? this.url(st.sprite) : def.sprite ? this.url(def.sprite) : '';
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
      Object.values(o.states || {}).forEach(s => s.sprite && urls.push(this.url(s.sprite)));
      if (o.character) {
        const sp = this.character(o.character)?.sprites || {};
        [sp.idle, ...(sp.talk || []), sp.blink].forEach(p => p && urls.push(this.characterUrl(o.character, p)));
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
    if (o.character) {
      const c = this.character(o.character);
      const sp = c?.sprites || {};
      const frames = [sp.idle, sp.talk?.[0], sp.talk?.[1], sp.blink]
        .map((p, i) => p ? `<img class="room-frame-img${i === 0 ? ' on' : ''}" src="${esc(this.characterUrl(o.character, p))}" alt="" draggable="false">` : '<i></i>')
        .join('');
      return `<div class="room-obj room-char${hidden}" data-id="${esc(o.id)}" style="${this.box(o.rect)}">${frames}</div>`;
    }
    const src = this.spriteOf(o);
    if (!src) return `<div class="room-zone${hidden}" data-id="${esc(o.id)}" style="${this.box(o.rect)}"></div>`;
    return `<img class="room-obj${hidden}" data-id="${esc(o.id)}" src="${esc(src)}" alt="" draggable="false" style="${this.box(o.rect)}">`;
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
          ${order.map(o => `<button type="button" class="room-hotspot" data-id="${esc(o.id)}" style="${this.box(o.rect)}" aria-label="${esc(o.name)}"${this.isHidden(o.id) ? ' hidden' : ''}></button>`).join('')}
        </div>
        <div class="room-hud-tl" aria-hidden="true">
          <div class="room-pill room-place">${esc(d.title)}</div>
          <div class="room-pill room-objective"><span class="room-nb"></span><span class="room-objective-t"></span></div>
        </div>
        <button type="button" class="room-pill room-menu room-ui">Menu</button>
        <div class="room-bar room-ui">
          <div class="room-slots" role="group" aria-label="Inventaire">${'<button type="button" class="room-slot" disabled aria-label="Emplacement vide"></button>'.repeat(INVENTORY_SIZE)}</div>
          <div class="room-sep"></div>
          <button type="button" class="room-carnet"><span class="room-nb"></span><span>Carnet</span><span class="room-badge"></span></button>
          <button type="button" class="room-help" aria-label="Aide" title="Aide">?</button>
        </div>
        <div class="room-ov room-ui" hidden><div class="room-card" role="dialog" aria-modal="true"></div></div>
        <div class="room-talk" aria-hidden="true"><span></span><i></i><i></i><i></i></div>
        <div class="room-say" aria-hidden="true"><span class="who"></span><span class="txt"></span></div>
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
      if (o.character && el) this.sprites[o.id] = new CharacterSprite(el, [...el.children]);
      this.updateMask(o);
    }
    this.notesSeen = this.game.state.data.notes.length;
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
    $('.room-carnet').addEventListener('click', () => { this.game.audio.ui('click'); this.showCarnet(); });
    $('.room-help').addEventListener('click', () => { this.game.audio.ui('click'); this.showHelp(); });
    $('.room-slots').addEventListener('click', e => {
      const s = e.target.closest('.room-slot.full');
      if (!s) return;
      const it = this.item(s.dataset.item);
      this.game.audio.ui('soft');
      this.say(it.name, it.desc);
    });
    $('.room-card').addEventListener('click', e => this.onCardClick(e));
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

    const loop = now => {
      for (const [id, sp] of Object.entries(this.sprites)) sp.update(now, this.speaking?.objectId === id ? this.speaking.handle : null);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.onDispose(() => {
      cancelAnimationFrame(this.raf);
      Object.values(this.sounds).forEach(h => h.stop());
      this.speaking?.handle.stop();
    });

    for (const o of this.objects) {
      const snd = o.states?.[this.objectState(o.id)]?.sound;
      if (snd) this.playStateSound(o.id, this.objectState(o.id), snd);
    }

    this.announce([d.title, d.background?.alt, this.objectiveText()].filter(Boolean).join('. '));
    this.run(d.onEnter);
  }

  // ---- Souris et clavier ----

  pointer(e) {
    const r = this.frame.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * this.W, (e.clientY - r.top) / r.height * this.H, e.clientX - r.left, e.clientY - r.top];
  }

  hit(px, py) {
    const inRect = (o, [x, y, w, h] = o.rect) => px >= x && py >= y && px < x + w && py < y + h;
    const drawn = this.objects.filter(o => this.spriteOf(o) && o.hit !== 'rect');
    for (let i = drawn.length - 1; i >= 0; i--) {
      const o = drawn[i];
      if (this.isHidden(o.id) || !inRect(o)) continue;
      const m = this.masks.get(o.id);
      if (!m) return o.id;
      const [x, y, w] = o.rect.map(Math.round);
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
      if (s) this.placeTip(this.item(s.dataset.item).name, cx, cy);
      else this.tip.classList.remove('on');
      return;
    }
    const id = this.hit(px, py);
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
    const [x, y, w] = o.rect;
    this.placeTip(o.name, (x + w / 2) / this.W * fr.width, y / this.H * fr.height + 8);
  }

  applyDebug() {
    this.debug = !!this.game.debug.zones;
    this.frame.classList.toggle('dbg', this.debug);
  }

  // ---- Interaction ----

  use(id) {
    const def = this.defs.get(id);
    if (!def || this.isHidden(id) || this.overlay.isOpen) return;
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
    this.decorEls.forEach(x => {
      if (x.def.preset === 'crt-on' && x.refs.has(id) && test(x.def.when, { game: this.game, scene: this })) {
        x.el.classList.remove('go');
        void x.el.offsetWidth;
        x.el.classList.add('go');
      }
    });
  }

  playStateSound(id, state, snd) {
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

  // Voix : { character, src | pool (+ pick), subtitle }. La bouche du personnage suit le son.
  speak(a) {
    const audio = this.game.audio;
    let src = a.src ? this.url(a.src) : '', subtitle = a.subtitle;
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
      src = this.characterUrl(a.character, pool[n].src);
      subtitle ??= pool[n].subtitle;
    }
    if (!src) return;
    this.speaking?.handle.stop();
    if (!audio.volume('voice')) return;
    const handle = audio.voice.play(src);
    const obj = a.character ? this.objects.find(o => o.character === a.character) : null;
    const talk = this.el.querySelector('.room-talk');
    this.speaking = { handle, objectId: obj?.id };
    if (obj?.bubble) {
      talk.style.left = this.pct(obj.bubble[0], this.W);
      talk.style.top = this.pct(obj.bubble[1], this.H);
      talk.querySelector('span').textContent = c?.name || obj.name;
      handle.el.addEventListener('playing', () => talk.classList.add('on'), { once: true });
    }
    handle.onEnd = () => {
      talk.classList.remove('on');
      if (this.speaking?.handle === handle) this.speaking = null;
    };
    if (subtitle) this.say(c?.name || '', subtitle);
  }

  // ---- HUD ----

  item(id) {
    const it = this.game.data.items[id] || { name: id, desc: '' };
    return { ...it, id, iconUrl: it.icon ? resolve(it.icon, ITEMS_BASE) : '' };
  }

  objectiveText() {
    const id = this.game.state.data.objective;
    if (!id) return '';
    return `Objectif : ${lcfirst(this.data.objectives?.[id] ?? id)}`;
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

  refreshHud(ev = {}) {
    const st = this.game.state.data;
    const obj = this.el.querySelector('.room-objective');
    const text = this.objectiveText();
    obj.hidden = !text;
    obj.querySelector('.room-objective-t').textContent = text;

    this.el.querySelectorAll('.room-slot').forEach((s, i) => {
      const id = st.inventory[i];
      s.className = 'room-slot' + (id ? ' full' : '');
      s.disabled = !id;
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

    const badge = this.el.querySelector('.room-badge');
    const unseen = st.notes.length > this.notesSeen;
    badge.textContent = st.notes.length;
    badge.classList.toggle('on', unseen);
    this.el.querySelector('.room-carnet').setAttribute('aria-label', unseen ? `Carnet, ${st.notes.length - this.notesSeen} nouvelle(s) note(s)` : 'Carnet');
    if (ev.kind === 'notes') this.announce(`Nouvelle note dans le carnet : ${ev.added}`);
  }

  // ---- Fenêtres ----

  onCardClick(e) {
    if (e.target.closest('[data-close]')) { this.overlay.close(); return; }
    const pause = e.target.closest('[data-pause]');
    if (pause) { this.pauseAction(pause.dataset.pause); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn || !this.openPanelId) return;
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

  showCarnet() {
    const st = this.game.state.data;
    this.notesSeen = st.notes.length;
    this.refreshHud();
    const objectives = Object.entries(this.data.objectives || {})
      .filter(([id]) => st.done.includes(id) || st.objective === id)
      .map(([id, label]) => st.done.includes(id)
        ? `<li class="done"><span class="sr-only">Terminé : </span>${esc(label)}</li>`
        : `<li class="cur"><span class="sr-only">En cours : </span>${esc(label)}</li>`)
      .join('') || '<li class="muted">Aucun objectif pour le moment.</li>';
    const notes = st.notes.length
      ? st.notes.map(n => `<li>${esc(n)}</li>`).join('')
      : '<li class="muted">Aucune note pour le moment. Examinez les lieux.</li>';
    this.openPanelId = null;
    this.overlay.open(`<div class="room-info">
      <div class="k">Carnet</div><h3>${esc(this.data.title)}</h3><div class="room-orn"><b></b><i></i><b></b></div>
      <div class="k">Objectifs</div><ul class="room-list">${objectives}</ul>
      <div class="k">Notes</div><ul class="room-list">${notes}</ul>
    </div>`, { single: true, label: 'Carnet' });
  }

  showHelp() {
    this.openPanelId = null;
    this.overlay.open(`<div class="room-info">
      <div class="k">Aide</div><h3>Comment jouer</h3><div class="room-orn"><b></b><i></i><b></b></div>
      <ul class="room-list">${HELP.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
      <div class="room-acts"><button type="button" class="room-btn" data-close>Compris</button></div>
    </div>`, { single: true, label: 'Aide' });
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
