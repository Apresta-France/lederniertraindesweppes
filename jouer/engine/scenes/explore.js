import { Scene } from './scene.js';
import { test, referencedObjects } from '../core/conditions.js';
import { resolve, ROOT } from '../core/paths.js';
import { loadJSON } from '../core/loader.js';
import { INVENTORY_SIZE } from '../core/state.js';
import { CharacterSprite } from '../ui/character.js';
import { Overlay } from '../ui/overlay.js';
import { cursorCss, cursorExtent, cursorUrl, isCursor, tipPosition, CURSORS } from '../../shared/cursors/cursors.js';
import { DEFAULT_HORIZON, depthDurationFactor, depthScale, depthSpace } from '../core/perspective.js';
import { routeFeet, showsHalo } from '../core/zones.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lcfirst = s => s ? s[0].toLowerCase() + s.slice(1) : '';
const ITEMS_BASE = new URL('shared/items/', ROOT).href;

function actionsOf(list, out = []) {
  if (!Array.isArray(list)) return out;
  for (const action of list) {
    if (!action || typeof action !== 'object') continue;
    out.push(action);
    actionsOf(action.then, out);
    actionsOf(action.else, out);
  }
  return out;
}

// Sans curseur choisi : prendre, parler à un personnage, agir, ou examiner.
function inferredCursor(def) {
  const all = actionsOf(def.onUse);
  const top = Array.isArray(def.onUse) ? def.onUse : [];
  const has = (name) => all.some((action) => action.do === name);
  if (def.walkTo) return 'marcher';
  if (has('take')) return 'prendre';
  if (def.character || has('dialogue') || top.some((action) => action.do === 'voice' && action.character)) return 'parler';
  if (has('cycleState') || has('setState') || has('goto')) return 'montrer';
  if (has('examine') || has('say') || def.description) return 'loupe';
  if (all.length) return 'montrer';
  return 'fleche';
}

const HELP = [
  "Survolez le décor : les objets s'éclairent, leur nom s'affiche, et le curseur indique l'action.",
  "Au clavier, Tab ou les flèches passent d'un objet à l'autre, Entrée ou Espace l'examine.",
  "Cliquez sur un objet pour l'examiner. Certains changent d'état, d'autres s'ouvrent en grand.",
  "Les objets ramassés rejoignent l'inventaire : ouvrez-le avec l'icône du sac, en bas à gauche, puis cliquez sur un objet pour l'examiner.",
  "Le carnet garde vos objectifs et vos découvertes. L'objectif en cours s'affiche d'un clic sur la cible, en haut à gauche.",
  "La carte, en bas à gauche, montre les Weppes de l'année où vous êtes. Les nuages couvrent les communes pas encore atteintes. Survolez une commune découverte pour la mettre en lumière : le repère indique où vous êtes.",
  "Échap ferme une fenêtre ou l'inventaire, ou ouvre le menu (son, volume, sauvegarde).",
];
const ICONS = {
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M9.5 13.5h5"/></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z"/><path d="M8.5 4v13.5M15.5 6.5V20"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".9" class="dot"/></svg>',
};
const VOLUMES = [['music', 'Musique'], ['voice', 'Voix'], ['sfx', 'Effets']];
const JOURNAL_TABS = [['objectifs', 'Objectifs'], ['indices', 'Indices'], ['personnes', 'Personnages'], ['souvenirs', 'Souvenirs']];
// Nuages du cadre de la carte, un par coin. Le visuel lui-même dépend de l'année.
const MAP_CLOUDS = ['voile', 'aerien', 'ciel', 'dessus'];

// Secteurs de 45°, dans le sens horaire depuis la droite de l'écran (y vers le bas).
const WALK_DIRS = ['droite', 'avant-droite', 'face', 'avant-gauche', 'gauche', 'dos-gauche', 'dos', 'dos-droite'];
function walkHeading(dx, dy) {
  if (Math.hypot(dx, dy) < 12) return '';
  const i = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return WALK_DIRS[((i % 8) + 8) % 8];
}

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

function polygonOf(object) {
  const pts = object?.points;
  if (!Array.isArray(pts) || pts.length < 3) return null;
  for (const p of pts) {
    if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  }
  return pts;
}

function pointInPolygon(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(x - ax, y - ay);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// Vrai si le point est dans la commune, ou à moins de `pad` pixels de son contour.
function nearPolygon(points, x, y, pad) {
  if (pointInPolygon(points, x, y)) return true;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    if (distToSegment(x, y, points[j][0], points[j][1], points[i][0], points[i][1]) <= pad) return true;
  }
  return false;
}

function rectPolygon(rect) {
  if (!Array.isArray(rect) || rect.length < 4) return null;
  const [x, y, w, h] = rect;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

function polygonBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)];
}

// Décor point & click : calques, zones, contours, états d'objets, inventaire, carnet, fiches d'examen.
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
    this.depthMoved = new Set();
    this.frameTimers = {};
    this.hot = null;
    this.speaking = null;
    this.lastPick = {};
    this.loadMapTowns();
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
    const urls = [this.url(this.data.background?.src), this.mapSrc(), resolve('@shared/maps/repere.png'), ...MAP_CLOUDS.map(name => resolve(`@shared/maps/nuages/${name}.png`)), ...CURSORS.map((cursor) => cursorUrl(cursor.id))];
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

  // Zone sans image : le survol peut éclairer le décor découpé selon le contour.
  isPolyZone(o) {
    return polygonOf(o) && !o.character && !this.spriteOf(o);
  }

  focusBox(o) {
    if (o.character) return this.visualRect(o);
    const moved = this.livePos[o.id] ?? this.saved(o.id).pos;
    if (Array.isArray(moved)) return [moved[0], moved[1], o.rect[2], o.rect[3]];
    const poly = polygonOf(o);
    return poly ? polygonBounds(poly) : o.rect;
  }

  polyHtml(o) {
    const hidden = this.isHidden(o.id) ? ' is-hidden' : '';
    const pts = polygonOf(o);
    const clip = pts.map(([x, y]) => `${(x / this.W) * 100}% ${(y / this.H) * 100}%`).join(',');
    const svgPts = pts.map(([x, y]) => `${x},${y}`).join(' ');
    const glow = showsHalo(o)
      ? `<div class="room-poly-fx"><div class="room-poly-lit" style="clip-path:polygon(${clip})"><img src="${esc(this.url(this.data.background?.src))}" alt="" draggable="false"></div></div>`
      : '';
    return `<div class="room-zone room-poly${hidden}" data-id="${esc(o.id)}">
      ${glow}
      <svg class="room-poly-edge" viewBox="0 0 ${this.W} ${this.H}" preserveAspectRatio="none" aria-hidden="true"><polygon points="${svgPts}"></polygon></svg>
    </div>`;
  }

  objectHtml(o) {
    const hidden = this.isHidden(o.id) ? ' is-hidden' : '';
    const style = `${this.box(this.visualRect(o))}${this.saved(o.id).flip ? ';--flip:-1' : ''}`;
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

    const polys = this.objects.filter(o => this.isPolyZone(o));
    this.el.innerHTML = `
      <div class="room-frame" style="aspect-ratio:${this.W}/${this.H};width:min(100vw,${(this.W / this.H) * 100}vh)">
        <img class="room-bg" src="${esc(this.url(d.background?.src))}" alt="" draggable="false">
        <div class="room-polys">${polys.map(o => this.polyHtml(o)).join('')}</div>
        ${below.map(([x, i]) => this.decorHtml(x, i)).join('')}
        ${this.objects.map(o => this.isPolyZone(o) ? '' : this.objectHtml(o)).join('')}
        ${above.map(([x, i]) => this.decorHtml(x, i)).join('')}
        <div class="room-hotspots" role="group" aria-label="Objets de la scène : ${esc(d.title)}">
          ${order.map(o => `<button type="button" class="room-hotspot" data-id="${esc(o.id)}" style="${this.box(this.focusBox(o))}" aria-label="${esc(o.name)}"${this.isHidden(o.id) ? ' hidden' : ''}></button>`).join('')}
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
        <div class="room-dlg room-ui" hidden>
          <div class="room-dlg-head"><span class="room-dlg-who"></span><span class="room-dlg-prompt"></span></div>
          <div class="room-dlg-opts" role="group" aria-label="Sujets de conversation"></div>
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
    const layers = [...this.frame.children].filter(n => n.classList.contains('room-obj') || n.classList.contains('room-zone'));
    this.layerAnchor = layers.length ? layers[layers.length - 1].nextElementSibling : null;
    for (const o of this.objects) if (o.character) this.syncCharacterDepth(o.id);
    this.refreshDecor();
    this.refreshHud();
    this.applyCursor(null);
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
    if (d.town) this.game.state.visitTown(d.town);
    if (d.music?.src) this.game.audio.music.play(this.url(d.music.src), { fade: d.music.fade ?? 2500, volume: d.music.volume ?? 1 });

    this.listen(this.frame, 'mousemove', e => this.onMove(e));
    this.listen(this.frame, 'mouseleave', () => { this.setHot(null); this.tip.classList.remove('on'); });
    this.listen(this.frame, 'click', e => this.onClick(e));
    this.listen(window, 'keydown', e => {
      if (e.key !== 'Escape' || e.repeat) return;
      e.stopPropagation();
      if (this.overlay.isOpen) this.overlay.close();
      else if (this.dlg) this.endDialogue();
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
    const dlgBox = $('.room-dlg');
    dlgBox.addEventListener('click', e => this.onDlgClick(e));
    dlgBox.addEventListener('keydown', e => {
      const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (!step) return;
      const btns = [...dlgBox.querySelectorAll('.room-dlg-opt')];
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      btns[(i + step + btns.length) % btns.length].focus();
    });
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
      for (const [id, sp] of Object.entries(this.sprites)) sp.update(now, this.speaking?.aloud && this.speaking.objectId === id ? this.speaking.handle : null);
      this.tickAnims(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.onDispose(() => {
      cancelAnimationFrame(this.raf);
      Object.values(this.anims).forEach(st => st.done());
      Object.values(this.sounds).forEach(h => h.stop());
      this.speaking?.handle.stop();
      this.endDialogue();
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
    const inRect = (o, [x, y, w, h] = this.visualRect(o)) => px >= x && py >= y && px < x + w && py < y + h;
    const hitsPoly = (o) => {
      const poly = polygonOf(o);
      return poly ? pointInPolygon(poly, px, py) : null;
    };
    // L’ordre à l’écran (le dernier est devant), pas seulement l’ordre du tableau :
    // un personnage au premier plan passe devant le calque qu’il recouvre.
    const drawn = [...this.frame.querySelectorAll(':scope > .room-obj')].reverse();
    for (const el of drawn) {
      const o = this.defs.get(el.dataset.id);
      if (!o || this.isHidden(o.id) || !this.spriteOf(o) || o.hit === 'rect') continue;
      const poly = hitsPoly(o);
      if (poly !== null) {
        if (poly) return o.id;
        continue;
      }
      const box = this.visualRect(o);
      if (!inRect(o, box)) continue;
      const m = this.masks.get(o.id);
      if (!m) return o.id;
      const [, , mw, mh] = o.rect.map(Math.round);
      const scaled = box[2] !== o.rect[2] || box[3] !== o.rect[3];
      const [x, y, w, h] = scaled ? box : box.map(Math.round);
      const mx = Math.floor(scaled ? (px - x) / w * mw : px - x);
      const my = Math.floor(scaled ? (py - y) / h * mh : py - y);
      const stride = scaled ? mw : w;
      if (mx < 0 || my < 0 || mx >= (scaled ? mw : w) || my >= (scaled ? mh : h)) continue;
      if (m[(my * stride + mx) * 4 + 3] > 40) return o.id;
    }
    const zones = this.objects.filter(o => !this.spriteOf(o) || o.hit === 'rect');
    for (let i = zones.length - 1; i >= 0; i--) {
      const o = zones[i];
      if (this.isHidden(o.id)) continue;
      const poly = hitsPoly(o);
      if (poly !== null) {
        if (poly) return o.id;
        continue;
      }
      if (inRect(o)) return o.id;
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
      if (s) this.placeTip(this.item(s.dataset.item).name, cx, cy, 'loupe');
      else if (tool && !tool.classList.contains('open')) this.placeTip(tool.dataset.tip, cx, cy, 'montrer');
      else this.tip.classList.remove('on');
      return;
    }
    const id = this.isBusy ? null : this.hit(px, py);
    this.setHot(id);
    if (id) this.placeTip(this.defs.get(id).name, cx, cy, this.cursorName(id));
    else this.tip.classList.remove('on');
  }

  onClick(e) {
    if (e.target.closest('.room-ui') || e.target.closest('.room-hotspot')) return;
    const [px, py] = this.pointer(e);
    const id = this.hit(px, py);
    if (id) this.use(id, [px, py]);
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
    this.applyCursor(id);
  }

  // Flèche sur le décor. Sinon le curseur choisi, ou celui que l'action suggère.
  cursorName(id) {
    const def = id ? this.defs.get(id) : null;
    if (!def) return 'fleche';
    const chosen = def.states?.[this.objectState(id)]?.cursor || def.cursor;
    if (isCursor(chosen)) return chosen;
    return inferredCursor(def);
  }

  applyCursor(id) {
    if (!this.el) return;
    if (!this.el.dataset.cursors) {
      for (const cursor of CURSORS) this.el.style.setProperty(`--cur-${cursor.id}`, cursorCss(cursor.id));
      this.el.dataset.cursors = '1';
    }
    this.el.style.cursor = cursorCss(this.cursorName(id));
  }

  placeTip(text, x, y, cursorId = null) {
    if (this.tip.textContent !== text) this.tip.textContent = text;
    const extent = cursorId ? cursorExtent(cursorId) : null;
    const [left, top] = tipPosition(x, y, this.tip.offsetWidth, this.tip.offsetHeight, this.frame.clientWidth, this.frame.clientHeight, extent);
    this.tip.style.left = left + 'px';
    this.tip.style.top = top + 'px';
    this.tip.classList.add('on');
  }

  showTipFor(id) {
    const o = this.defs.get(id), fr = this.frame.getBoundingClientRect();
    const [x, y, w] = this.focusBox(o);
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

  use(id, point) {
    const def = this.defs.get(id);
    if (!def || this.isHidden(id) || this.overlay.isOpen || this.isBusy) return;
    if (def.walkTo) {
      this.walkActor(def, point);
      if (def.onUse) this.run(def.onUse, { object: def });
      return;
    }
    const actions = def.onUse ?? (def.description ? [{ do: 'sfx', name: 'soft' }, { do: 'say', text: def.description }] : []);
    this.run(actions, { object: def });
  }

  // Zone de sol (walkTo) : les pieds suivent le contour, sans couper le décor en diagonale.
  walkActor(zone, point) {
    const actor = this.defs.get(zone.walkTo);
    if (!actor || this.isHidden(actor.id)) return;
    const [x, y, w, h] = this.rectOf(actor);
    const here = [x + w / 2, y + h];
    const goal = point ? [point[0], point[1]] : this.walkCenter(zone);
    const route = routeFeet(here, goal, this.walkPolygons(actor.id));
    const end = route.at(-1);
    if (!end || Math.hypot(end[0] - here[0], end[1] - here[1]) < 8) return;
    this.followRoute(actor.id, route, zone.speed ?? 150);
  }

  walkCenter(zone) {
    const [zx, zy, zw, zh] = zone.rect;
    const cx = zx + zw / 2;
    const cy = zy + zh / 2;
    const poly = polygonOf(zone);
    if (!poly || pointInPolygon(poly, cx, cy)) return [cx, cy];
    return [poly[0][0], poly[0][1]];
  }

  walkPolygons(actorId) {
    const polys = [];
    for (const zone of this.objects) {
      if (!zone || zone.walkTo !== actorId || this.isHidden(zone.id)) continue;
      const poly = polygonOf(zone) || rectPolygon(zone.rect);
      if (poly) polys.push(poly);
    }
    return polys;
  }

  async followRoute(id, feetPoints, speed) {
    const token = (this.walkToken = (this.walkToken || 0) + 1);
    for (const feet of feetPoints) {
      if (this.walkToken !== token || this.disposed) return;
      const actor = this.defs.get(id);
      if (!actor) return;
      const [x, y, w, h] = this.rectOf(actor);
      if (Math.hypot(feet[0] - (x + w / 2), feet[1] - (y + h)) < 1) continue;
      const to = [Math.round(feet[0] - w / 2), Math.round(feet[1] - h)];
      const done = this.animate({ object: id, walk: true, to, speed, wait: true });
      if (done?.then) await done;
    }
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
    if (this.hot === id) this.applyCursor(id);
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
  // La largeur et la hauteur restent celles du rectangle posé : ce sont les pieds qui bougent.
  rectOf(o) {
    const p = this.livePos[o.id] ?? this.saved(o.id).pos;
    return Array.isArray(p) ? [p[0], p[1], o.rect[2], o.rect[3]] : o.rect;
  }

  // null : perspective coupée. Sinon la ligne du fond, en fraction de la hauteur.
  horizon() {
    const p = this.data.perspective;
    if (p === false) return null;
    const h = p && typeof p === 'object' ? Number(p.horizon) : NaN;
    return Number.isFinite(h) ? h : DEFAULT_HORIZON;
  }

  // 1 à l’emplacement posé dans la scène. La courbe est celle de l’éditeur de personnages.
  depthFactor(o, feetY) {
    const horizon = this.horizon();
    if (horizon == null || !o?.character) return 1;
    const ref = depthScale((o.rect[1] + o.rect[3]) / this.H, horizon);
    const here = depthScale(feetY / this.H, horizon);
    return ref > 0 ? here / ref : 1;
  }

  // Rectangle affiché : les pieds restent au même point, le corps grandit vers le bas de l’image.
  visualRect(o) {
    const logical = this.rectOf(o);
    const [x, y, w, h] = logical;
    const factor = this.depthFactor(o, y + h);
    if (factor === 1) return logical;
    const vw = w * factor;
    const vh = h * factor;
    return [x + (w - vw) / 2, y + h - vh, vw, vh];
  }

  placeObject(id) {
    const def = this.defs.get(id);
    if (def && this.isPolyZone(def)) return;
    const [x, y, w, h] = this.visualRect(def);
    for (const el of [this.els[id], this.hotspots.find(spot => spot.dataset.id === id)]) {
      if (!el) continue;
      el.style.left = this.pct(x, this.W);
      el.style.top = this.pct(y, this.H);
      el.style.width = this.pct(w, this.W);
      el.style.height = this.pct(h, this.H);
    }
    if (def?.character) this.syncCharacterDepth(id);
  }

  // Devant les calques dont la base est au-dessus des pieds, derrière ceux qui descendent plus bas.
  syncCharacterDepth(id) {
    const el = this.els[id];
    const def = this.defs.get(id);
    if (!el?.parentElement || !def?.character || this.horizon() == null) return;
    const feet = this.rectOf(def)[1] + this.rectOf(def)[3];
    const home = def.rect[1] + def.rect[3];
    if (Math.abs(feet - home) < 1) {
      if (this.depthMoved.has(id)) {
        this.depthMoved.delete(id);
        this.restoreObjectOrder();
        for (const other of this.depthMoved) this.placeCharacterDepth(other);
      }
      return;
    }
    this.depthMoved.add(id);
    this.placeCharacterDepth(id);
  }

  placeCharacterDepth(id) {
    const el = this.els[id];
    const def = this.defs.get(id);
    if (!el?.parentElement || !def) return;
    const feet = this.rectOf(def)[1] + this.rectOf(def)[3];
    const parent = el.parentElement;
    const others = [...parent.children].filter(n => n !== el && n.classList.contains('room-obj'));
    const baseline = (node) => {
      const o = this.defs.get(node.dataset.id);
      if (!o?.rect) return 0;
      const [, y, , h] = o.character ? this.rectOf(o) : o.rect;
      return y + h;
    };
    const next = others.find(n => baseline(n) > feet);
    if (next) {
      if (el.nextSibling !== next) parent.insertBefore(el, next);
    } else if (others.length && el.previousSibling !== others[others.length - 1]) {
      parent.insertBefore(el, others[others.length - 1].nextSibling);
    }
    // Les calques dont la base descend plus bas que ses pieds doivent la recouvrir :
    // le groupe « premier plan » est regroupé juste après elle, dans son ordre posé
    // (le DOM n'est pas trié par profondeur : sans cela ils repasseraient devant).
    let anchor = el;
    for (const n of others) {
      if (baseline(n) <= feet) continue;
      if (n.previousSibling !== anchor) parent.insertBefore(n, anchor.nextSibling);
      anchor = n;
    }
    // Réciproque : un calque « fond » posé loin devant dans le fichier (ex. commode)
    // la recouvrirait encore — tout ce qui reste après elle repasse derrière.
    for (const n of others) {
      if (baseline(n) > feet) continue;
      if (el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) parent.insertBefore(n, el);
    }
  }

  restoreObjectOrder() {
    const anchor = this.layerAnchor;
    if (!anchor?.parentElement) return;
    const parent = anchor.parentElement;
    for (const o of this.objects) {
      const el = this.els[o.id];
      if (el?.parentElement === parent) parent.insertBefore(el, anchor);
    }
  }

  moveTo(id, [x, y]) {
    delete this.livePos[id];
    this.game.state.setObject(this.id, id, { pos: [Math.round(x), Math.round(y)] });
    this.placeObject(id);
  }

  // animate { object, animation?, walk?, to?: [x, y], duration?, speed?, flip?, hold?, keep?, wait? }
  // walk : choisit marche-<direction> selon le trajet, puis repos-<direction> à l'arrivée.
  // Sans durée ni trajet, une animation en boucle tourne jusqu'au prochain animate sur l'objet.
  // Un personnage qui peut se déplacer garde sa direction en parlant (parle-<direction> s'il l'a).
  // Les autres, immobiles, reprennent leurs images de parole face caméra.
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

    const from = this.rectOf(def);
    const to = Array.isArray(a.to) && a.to.length >= 2 ? a.to : null;
    let name = a.animation;
    let thenIdle = '';
    if (a.walk && to && def.character) {
      const dir = walkHeading(to[0] - from[0], to[1] - from[1]);
      const anims = this.character(def.character)?.animations || {};
      if (dir && anims[`marche-${dir}`]) {
        name = `marche-${dir}`;
        if (anims[`repos-${dir}`]) thenIdle = `repos-${dir}`;
      }
    }
    const anim = name && def.character ? this.character(def.character)?.animations?.[name] : null;
    if (name && !anim) console.warn(`[animate] animation « ${name} » introuvable pour « ${id} »`);
    const layer = anim ? [...el.querySelectorAll('.room-anim')].find(x => x.dataset.anim === name) : null;
    const frames = layer ? [...layer.children] : [];
    const fps = anim?.fps > 0 ? anim.fps : 8;
    const loop = anim?.loop !== false;

    if (this.reduceMotion || (!frames.length && !to)) {
      if (to) this.moveTo(id, to);
      if (thenIdle) this.animate({ object: id, animation: thenIdle });
      return;
    }
    // La marche ralentit au fond et accélère au premier plan, comme sur le terrain d’essai.
    let depth = null;
    if (to && a.duration == null && a.walk && def.character && this.horizon() != null) {
      depth = [this.depthFactor(def, from[1] + from[3]), this.depthFactor(def, to[1] + to[3])];
    }
    const dist = to ? Math.hypot(to[0] - from[0], to[1] - from[1]) : 0;
    const moveMs = to ? Math.max(0, a.duration ?? dist / (a.speed ?? 200) * (depth ? depthDurationFactor(depth[0], depth[1]) : 1) * 1000) : 0;
    const playMs = to ? (a.keep ? Infinity : moveMs)
      : a.duration != null ? a.duration
        : loop ? Infinity : frames.length * 1000 / fps;
    let resolve;
    const finished = new Promise(res => { resolve = res; });
    const start = performance.now();
    this.anims[id] = {
      id, el, layer, frames, fps, loop, from, to, moveMs, depth, cur: -1,
      name: layer ? name : '',
      start, end: start + playMs, hold: !!a.hold, thenIdle,
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
        const u = st.moveMs ? Math.min(1, t / st.moveMs) : 1;
        const k = st.depth ? depthSpace(u, st.depth[0], st.depth[1]) : u;
        this.livePos[st.id] = [st.from[0] + (st.to[0] - st.from[0]) * k, st.from[1] + (st.to[1] - st.from[1]) * k];
        this.placeObject(st.id);
        if (u >= 1) {
          this.moveTo(st.id, st.to);
          st.to = null;
          st.done();
        }
      }
      if (st.frames.length) {
        const n = Math.max(0, Math.floor(t * st.fps / 1000));
        const i = st.loop ? n % st.frames.length : Math.min(n, st.frames.length - 1);
        if (i !== st.cur) {
          st.frames[st.cur]?.classList.remove('on');
          st.frames[i].classList.add('on');
          st.cur = i;
        }
        const faceCamera = !!this.speaking?.aloud && this.speaking.objectId === st.id && !st.to && !this.mover(st.id);
        st.el.classList.toggle('animating', !faceCamera);
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
    if (natural && st.thenIdle) {
      const dir = this.poseDir(st.thenIdle);
      const anims = this.character(this.defs.get(id)?.character)?.animations || {};
      const talkDir = this.speaking?.aloud && this.speaking.objectId === id && this.mover(id) ? this.mouthDir(anims, dir) : '';
      if (talkDir) {
        this.speaking.pose = { id, back: st.thenIdle };
        this.animate({ object: id, animation: `parle-${talkDir}` });
      } else this.animate({ object: id, animation: st.thenIdle });
    }
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

  // Direction d'une pose nommée repos-dos-droite, marche-gauche, parle-face…
  poseDir(name) {
    return /^(?:repos|marche|course|parle)-(.*)$/.exec(name || '')?.[1] || '';
  }

  // Quelqu'un peut l'emmener en cliquant une zone de sol.
  mover(id) {
    return this.objects.some(o => o?.walkTo === id);
  }

  // Elle s'adresse à quelqu'un : le champ to, ou un clic sur un autre personnage.
  // to vise un objet de la scène, même sans sprite de personnage (l'infirmière dans l'embrasure).
  // Un clic sur un objet, sans to, est une pensée.
  addressed(a, ctx) {
    const self = a.character || '';
    if (a.to) {
      const named = this.objects.find(o => o.id === a.to || o.character === a.to);
      if (named && named.character !== self && named.id !== self) return named;
    }
    const clicked = ctx?.object;
    if (clicked?.character && clicked.character !== self) return clicked;
    return null;
  }

  // parle-<direction> dont les images changent. Les vues de dos répètent souvent la bouche fermée :
  // on prend alors le profil du même côté, pour que la bouche se voie.
  mouthDir(anims, dir) {
    const open = name => new Set(anims[name]?.frames || []).size > 1;
    if (dir && open(`parle-${dir}`)) return dir;
    const side = dir?.includes('gauche') ? 'gauche' : dir?.includes('droite') ? 'droite' : '';
    const prefs = side ? [side, `avant-${side}`, 'face'] : ['face', 'droite', 'gauche'];
    return prefs.find(d => open(`parle-${d}`)) || '';
  }

  // Garde la direction en cours et joue parle-<direction> si cette animation a une bouche.
  // Renvoie la pose à rendre à la fin de la réplique.
  beginPoseTalk(id) {
    if (!id || !this.mover(id) || this.disposed) return null;
    const st = this.anims[id];
    if (!st || st.to) return null;
    const dir = this.poseDir(st.name);
    if (!dir) return null;
    const anims = this.character(this.defs.get(id)?.character)?.animations || {};
    const talkDir = this.mouthDir(anims, dir);
    const talk = talkDir ? `parle-${talkDir}` : '';
    const back = anims[`repos-${dir}`] ? `repos-${dir}` : st.name;
    if (talk && st.name !== talk) this.animate({ object: id, animation: talk });
    return talk ? { id, back } : null;
  }

  endPoseTalk(pose) {
    if (!pose?.back || this.disposed) return;
    if (this.speaking?.objectId === pose.id) return;
    const name = this.anims[pose.id]?.name || '';
    if (name.startsWith('parle-')) this.animate({ object: pose.id, animation: pose.back });
  }

  // Une pensée ne garde pas la bouche du sprite de dialogue.
  holdStill(id) {
    const name = this.anims[id]?.name || '';
    if (!name.startsWith('parle-')) return;
    const back = `repos-${this.poseDir(name)}`;
    const anims = this.character(this.defs.get(id)?.character)?.animations || {};
    if (anims[back]) this.animate({ object: id, animation: back });
  }

  // Voix : { character, to?, src | pool (+ pick), subtitle, wait }.
  // Une réplique avec personnage anime la bouche, même sans to (l'entrée dans la chambre).
  // to, ou un clic sur un autre personnage : bulle du prénom en plus.
  // Un clic sur un objet, sans to, est une pensée : la légende seule, sans bulle ni sprite.
  // Avec wait, l'action suivante attend la fin de la réplique (ou son interruption).
  // La légende (onglet Sons, ou subtitle) reste affichée le temps du son, même si la voix est coupée.
  // Un personnage mobile ne se tourne pas vers la caméra : il garde sa direction.
  speak(a, ctx = {}) {
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
      if (a.wait && legend) return this.sleep(2600 + legend.length * 45);
      return;
    }
    this.speaking?.handle.stop();
    const obj = a.character ? this.objects.find(o => o.character === a.character) : null;
    const target = this.addressed(a, ctx);
    // Bouche : toute réplique d'un personnage, y compris à l'entrée de la scène.
    // Une pensée, c'est un clic sur un objet sans to : légende seule, sans sprite de dialogue.
    const thought = !target && ctx.object && ctx.object.character !== a.character;
    const aloud = !!a.character && !thought;
    if (!audio.volume('voice')) {
      if (legend) this.showLegend(who, legend);
      const pose = aloud ? this.beginPoseTalk(obj?.id) : null;
      const ms = legend ? 2600 + legend.length * 45 : 0;
      if (!ms) return;
      const done = this.sleep(ms).then(() => this.endPoseTalk(pose));
      if (a.wait) return done;
      return;
    }
    const handle = audio.voice.play(src);
    const talk = this.el.querySelector('.room-talk');
    if (!aloud && obj?.id) this.holdStill(obj.id);
    this.speaking = { handle, objectId: obj?.id, aloud, pose: aloud ? this.beginPoseTalk(obj?.id) : null };
    this.busyChanged();
    if (target && obj?.bubble) {
      const [x, y, w, h] = this.visualRect(obj);
      const [, , rw, rh] = obj.rect;
      talk.style.left = this.pct(x + (obj.bubble[0] - obj.rect[0]) * (w / rw), this.W);
      talk.style.top = this.pct(y + (obj.bubble[1] - obj.rect[1]) * (h / rh), this.H);
      talk.querySelector('span').textContent = c?.name || obj.name;
      handle.el.addEventListener('playing', () => talk.classList.add('on'), { once: true });
    }
    let ended;
    const done = new Promise(res => { ended = res; });
    const hold = legend ? this.showLegend(who, legend, { hold: true }) : 0;
    handle.onEnd = () => {
      talk.classList.remove('on');
      if (this.speaking?.handle === handle) {
        const pose = this.speaking.pose;
        this.speaking = null;
        this.endPoseTalk(pose);
        if (!this.disposed) this.busyChanged();
      }
      if (hold && this.legendToken === hold) this.el.querySelector('.room-sub')?.classList.remove('on');
      ended();
    };
    if (a.wait) return done;
  }

  // ---- Dialogues ----

  // Interlocuteur : l'objet cliqué s'il porte un personnage, sinon celui nommé par le dialogue.
  dialoguePartner(def, ctx) {
    if (ctx.object?.character) return ctx.object;
    return this.objects.find(o => o.character === def.character) || null;
  }

  // Le personnage joué : le champ « player » du dialogue, sinon celui que les zones de sol déplacent.
  dialoguePlayer(def, partner) {
    const named = def.player ? this.objects.find(o => o.id === def.player || o.character === def.player) : null;
    return named || this.objects.find(o => o?.character && o.id !== partner?.id && this.mover(o.id)) || null;
  }

  // Variable qui garde « ce sujet a déjà été abordé » ; utilisable dans when et cond.
  topicKey(dlgId, topic, index) {
    return `dlg.${this.id}.${dlgId}.${topic?.id || `t${index}`}`;
  }

  // Répliques prêtes pour runActions : une voice attend sa fin et s'adresse à l'autre
  // partie quand « to » n'est pas écrit ; un say est suivi d'une pause de sa durée.
  dialogueLines(list, partner, player) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const line of list) {
      if (!line || typeof line !== 'object') continue;
      if (line.do === 'voice' && line.character) {
        const other = line.character === partner?.character ? player?.character : partner?.character;
        out.push({ ...line, wait: line.wait ?? true, ...(line.to || !other ? {} : { to: other }) });
        continue;
      }
      out.push(line);
      if (line.do === 'say' && line.wait !== false) {
        const text = line.byState ? line.texts?.[this.objectState(line.byState)] : line.text;
        out.push({ do: 'wait', ms: line.waitMs ?? (2600 + String(text || '').length * 45) });
      }
    }
    return out;
  }

  setTopicsOpen(open) {
    const box = this.el?.querySelector('.room-dlg');
    if (box) box.hidden = !open;
    const spots = this.el?.querySelector('.room-hotspots');
    if (spots) spots.inert = open;
    this.frame?.classList.toggle('dlg-open', open);
  }

  // Menu des sujets en bas de l'image : renvoie le sujet choisi, ou null quand on part.
  showTopics(def, list, keyOf) {
    const box = this.el.querySelector('.room-dlg');
    const c = def.character ? this.character(def.character) : null;
    box.querySelector('.room-dlg-who').textContent = def.title || c?.name || '';
    const prompt = box.querySelector('.room-dlg-prompt');
    prompt.textContent = def.prompt || '';
    prompt.hidden = !def.prompt;
    box.querySelector('.room-dlg-opts').innerHTML =
      list.map(({ topic, index }, n) =>
        `<button type="button" class="room-dlg-opt${this.game.state.get(keyOf(topic, index)) ? ' asked' : ''}" data-dlg="${n}">${esc(topic.label || '…')}</button>`
      ).join('') +
      `<button type="button" class="room-dlg-opt bye" data-dlg="bye">${esc(def.bye || 'C’est tout pour le moment.')}</button>`;
    return new Promise(resolve => {
      this.dlg = { resolve, list };
      this.setTopicsOpen(true);
      this.announce([def.title || c?.name, def.prompt,
        ...list.map(({ topic }) => topic.label), def.bye].filter(Boolean).join('. '));
      (box.querySelector('.room-dlg-opt:not(.asked)') || box.querySelector('.room-dlg-opt'))?.focus();
    });
  }

  onDlgClick(e) {
    const btn = e.target.closest('[data-dlg]');
    if (!btn || !this.dlg) return;
    const { resolve, list } = this.dlg;
    this.dlg = null;
    this.game.audio.ui('click');
    this.setTopicsOpen(false);
    resolve(btn.dataset.dlg === 'bye' ? null : list[+btn.dataset.dlg] ?? null);
  }

  // Échap, « bye » ou démontage : la conversation s'arrête.
  endDialogue() {
    if (!this.dlg) return;
    const { resolve } = this.dlg;
    this.dlg = null;
    this.setTopicsOpen(false);
    resolve(null);
  }

  // dialogue { id } : menu des sujets, échanges (voix + sous-titres), puis déblocages.
  // def : { character, title?, prompt?, bye?, player?, empty?: actions, onLeave?: actions,
  //         topics: [{ id?, label, when?, once?, end?, lines: actions, then?: actions }] }
  async openDialogue(a, ctx = {}) {
    const def = this.data.dialogues?.[a.id];
    if (!def || !Array.isArray(def.topics) || this.dlg || this.dlgRunning || this.overlay.isOpen) return;
    const partner = this.dialoguePartner(def, ctx);
    const player = this.dialoguePlayer(def, partner);
    const actx = { ...ctx, object: partner ?? ctx.object };
    const condCtx = { game: this.game, scene: this };
    const keyOf = (t, i) => this.topicKey(a.id, t, i);
    const visible = () => def.topics
      .map((topic, index) => ({ topic, index }))
      .filter(({ topic, index }) => topic && typeof topic === 'object'
        && (!topic.once || !this.game.state.get(keyOf(topic, index)))
        && test(topic.when, condCtx));

    this.dlgRunning = true;
    this.dlgReturnTo = document.activeElement;
    this.hideSay();
    this.tip.classList.remove('on');
    try {
      while (!this.disposed) {
        const list = visible();
        if (!list.length) {
          await this.run(this.dialogueLines(def.empty, partner, player), actx);
          break;
        }
        const pick = await this.showTopics(def, list, keyOf);
        if (pick == null || this.disposed) break;
        this.game.state.set(keyOf(pick.topic, pick.index), true);
        await this.run(this.dialogueLines(pick.topic.lines, partner, player), actx);
        if (this.disposed) break;
        await this.run(this.dialogueLines(pick.topic.then, partner, player), actx);
        if (pick.topic.end) break;
      }
    } finally {
      this.dlgRunning = false;
      this.dlg = null;
      this.setTopicsOpen(false);
      const back = this.dlgReturnTo;
      this.dlgReturnTo = null;
      if (back?.isConnected) back.focus();
    }
    if (!this.disposed) await this.run(this.dialogueLines(def.onLeave, partner, player), actx);
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
    // Une réplique en cours ne bloque pas un panneau déjà ouvert (essayer d'ouvrir la boîte pendant que Gisèle parle).
    if (!btn || !this.openPanelId || super.isBusy) return;
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

  // Année de la partie : variable « year », sinon l'année de départ déclarée dans game.json.
  mapYear() {
    const n = Number(this.game.state.get('year'));
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    const fallback = Number(this.game.data.game.year);
    return Number.isFinite(fallback) && fallback > 0 ? Math.trunc(fallback) : 2026;
  }

  mapSrc(year = this.mapYear()) {
    const maps = this.game.data.game.maps || {};
    const pick = maps[year] || maps[this.game.data.game.year] || maps[2026];
    return pick ? resolve(pick) : '';
  }

  // Communes déjà atteintes : la scène en cours, et celles gardées dans la partie.
  openTowns(towns) {
    if (this.data.town) this.game.state.visitTown(this.data.town);
    const known = new Set(this.game.state.data.towns || []);
    return towns.filter(t => known.has(t.id));
  }

  // Nuages semés sur la carte, sauf au-dessus des communes découvertes.
  mapCloudHtml(towns, open, W, H) {
    const clear = (x, y, pad) => open.some(t => nearPolygon(t.points, x, y, pad));
    const spots = [];
    const add = (x, y, w, rot, o, delay, dx, dy, pad = 48) => {
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) return;
      if (clear(x, y, pad)) return;
      spots.push({ x, y, w, rot, o, delay, dx, dy, kind: spots.length % MAP_CLOUDS.length });
    };
    towns.forEach((t, i) => {
      if (!t.at || open.some(o => o.id === t.id)) return;
      const [x, y] = t.at;
      const side = i % 2 ? 1 : -1;
      add(x, y, 34 + (i % 4) * 3, (i * 37) % 46 - 23, 0.92, (i % 7) * -1.4, side * 1.4, -1, 36);
      add(x + side * 110, y + 36, 26, (i * 19) % 30 - 10, 0.84, (i % 5) * -2, side, 1.2, 36);
    });
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 7; col++) {
        const x = ((col + 0.35) / 7) * W + ((row % 2) ? 50 : -30);
        const y = ((row + 0.4) / 5) * H;
        if (clear(x, y, 210)) continue;
        add(x, y, 24 + ((row + col) % 4) * 4, ((row * 3 + col * 5) % 40) - 20, 0.78 + ((row + col) % 3) * 0.06, -((row * 7 + col) % 9), (col % 2 ? 1 : -1) * 1.6, row % 2 ? -1.2 : 1);
      }
    }
    const frame = MAP_CLOUDS.map(name => `<img class="room-cloud room-cloud--${name}" src="${esc(resolve(`@shared/maps/nuages/${name}.png`))}" alt="">`).join('');
    const drift = spots.map(s => `<img class="room-cloud room-cloud--drift" src="${esc(resolve(`@shared/maps/nuages/${MAP_CLOUDS[s.kind]}.png`))}" alt="" style="left:${(s.x / W) * 100}%;top:${(s.y / H) * 100}%;width:${s.w}%;--r:${s.rot}deg;--o:${s.o};--delay:${s.delay}s;--dx:${s.dx}%;--dy:${s.dy}%">`).join('');
    return frame + drift;
  }

  // Trou adouci dans les nuages, à l'emplacement des communes découvertes.
  // Un filtre SVG dans l'image du masque n'est pas peint : le flou passe par un canvas.
  cloudMask(open, W, H) {
    if (!open.length || typeof document === 'undefined') return '';
    const S = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(W / S));
    canvas.height = Math.max(1, Math.round(H / S));
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    for (const t of open) {
      t.points.forEach(([x, y], i) => {
        const px = x / S;
        const py = y / S;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
    }
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 22 / S;
    ctx.filter = 'blur(14px)';
    ctx.fill();
    ctx.stroke();
    return canvas.toDataURL('image/png');
  }

  // Communes de la carte de l'année : polygones de survol et point du repère.
  loadMapTowns(year = this.mapYear()) {
    const src = this.mapSrc(year);
    if (!src) return Promise.resolve({ size: [1672, 941], towns: [] });
    const url = src.replace(/\.png(?=$|\?)/, '.json');
    return loadJSON(url).then(data => {
      const size = Array.isArray(data?.size) && data.size.length >= 2 ? data.size : [1672, 941];
      const towns = (Array.isArray(data?.towns) ? data.towns : []).filter(t => t?.id && t.name && Array.isArray(t.points) && t.points.length >= 3);
      return { size, towns };
    }).catch(() => ({ size: [1672, 941], towns: [] }));
  }

  async showMap() {
    if (this.mapOpening || this.overlay.isOpen) return;
    this.mapOpening = true;
    this.openPanelId = null;
    this.tip.classList.remove('on');
    const year = this.mapYear();
    const src = this.mapSrc(year);
    const { size: [W, H], towns } = await this.loadMapTowns(year);
    this.mapOpening = false;
    if (this.disposed || this.overlay.isOpen) return;
    const here = this.data.town;
    const open = this.openTowns(towns);
    const hereTown = open.find(t => t.id === here && Array.isArray(t.at));
    const clouds = this.mapCloudHtml(towns, open, W, H);
    const mask = this.cloudMask(open, W, H);
    const polys = open.map(t => {
      const pts = t.points.map(([x, y]) => `${x},${y}`).join(' ');
      const label = t.id === here ? `${t.name}, vous êtes ici` : t.name;
      return `<polygon tabindex="0" role="button" data-town="${esc(t.id)}" aria-label="${esc(label)}" points="${pts}"></polygon>`;
    }).join('');
    const pin = hereTown
      ? `<img class="room-mapview-pin" src="${esc(resolve('@shared/maps/repere.png'))}" alt="${esc(`Vous êtes à ${hereTown.name}`)}" style="left:${(hereTown.at[0] / W) * 100}%;top:${(hereTown.at[1] / H) * 100}%">`
      : '';
    this.overlay.open(`<div class="room-mapview">
      ${src ? `<img class="room-mapview-bg" src="${esc(src)}" alt="Carte des Weppes en ${year}">` : ''}
      ${src ? `<img class="room-mapview-lit" src="${esc(src)}" alt="" draggable="false">` : ''}
      <svg class="room-mapview-towns" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="group" aria-label="Communes découvertes">${polys}</svg>
      <div class="room-mapview-clouds" aria-hidden="true"${mask ? ` style="--cloud-mask:url('${mask}')"` : ''}>${clouds}</div>
      <p class="room-mapview-caption" hidden></p>
      ${pin}
    </div>`, { label: `Carte des Weppes, ${year}`, cls: 'room-card--map' });
    this.bindMapTowns(open, W, H, here);
    const found = open.map(t => t.name).join(', ');
    this.announce(found ? `Carte des Weppes, ${year}. ${found}.` : `Carte des Weppes, ${year}`);
  }

  bindMapTowns(towns, W, H, here) {
    const view = this.el.querySelector('.room-mapview');
    const svg = view?.querySelector('.room-mapview-towns');
    const lit = view?.querySelector('.room-mapview-lit');
    const caption = view?.querySelector('.room-mapview-caption');
    if (!view || !svg || !lit || !caption) return;
    const byId = new Map(towns.map(t => [t.id, t]));
    const show = (id) => {
      const town = byId.get(id);
      if (!town) return;
      view.classList.add('is-hot');
      for (const poly of svg.querySelectorAll('polygon')) poly.classList.toggle('is-hot', poly.dataset.town === id);
      lit.style.clipPath = `polygon(${town.points.map(([x, y]) => `${(x / W) * 100}% ${(y / H) * 100}%`).join(',')})`;
      caption.hidden = false;
      caption.textContent = town.id === here ? `${town.name} — vous êtes ici` : town.name;
    };
    const hide = () => {
      view.classList.remove('is-hot');
      for (const poly of svg.querySelectorAll('.is-hot')) poly.classList.remove('is-hot');
      caption.hidden = true;
    };
    svg.addEventListener('pointerover', (e) => {
      const poly = e.target.closest('polygon');
      if (poly) show(poly.dataset.town);
    });
    svg.addEventListener('pointerout', (e) => {
      if (!e.target.closest('polygon')) return;
      if (e.relatedTarget?.closest?.('polygon')) return;
      hide();
    });
    svg.addEventListener('focusin', (e) => {
      const poly = e.target.closest('polygon');
      if (poly) show(poly.dataset.town);
    });
    svg.addEventListener('focusout', (e) => {
      if (!svg.contains(e.relatedTarget)) hide();
    });
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
