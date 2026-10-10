import { Scene } from './scene.js';
import * as synth from '../audio/synth.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plain = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };
const kb = ([k, x, y], roll) => `translate(${x}%,${y}%) scale(${k})${roll != null ? ` rotate(${roll}deg)` : ''}`;
const div = (className) => Object.assign(document.createElement('div'), { className });

const LOOPS = { rain: synth.rainLoop, wind: synth.windLoop, road: synth.roadLoop };

// Bruitages enregistrés, décodés une fois pour toutes les scènes.
const samples = new Map();
const loadSample = (ctx, url) => {
  if (!samples.has(url)) {
    samples.set(url, fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => b && ctx.decodeAudioData(b)).catch(() => null));
  }
  return samples.get(url);
};

const ornament = cls => `<div class="cine-orn ${cls || ''}"><b></b><i></i><b></b></div>`;

// Mises en page des cartons. Ajouter un style = ajouter une fonction ici et ses règles dans cinematic.css.
const CARD_STYLES = {
  once(c) {
    const words = (c.title || '').split(/\s+/).filter(Boolean);
    const last = words.pop() || '';
    const w = (txt, i) => `<span class="cine-word" style="animation-delay:${600 + i * 350}ms">${esc(txt)}</span>`;
    const dots = Array.from({ length: c.dots || 0 }, (_, i) => `<span class="cine-dot" style="animation-delay:${2600 + i * 500}ms">.</span>`).join('');
    return `${c.ornament === 'both' ? ornament('top') : ''}
      <div class="cine-once-line">${words.map(w).join('')}<span class="cine-once-last">${w(last, words.length)}${dots}</span></div>
      ${c.ornament !== 'none' ? ornament('bottom') : ''}`;
  },
  date(c) {
    const title = c.titleEffect === 'letters'
      ? [...(c.title || '')].map((ch, i) => `<span style="animation-delay:${600 + i * 70}ms">${esc(ch)}</span>`).join('')
      : esc(c.title);
    return `<div class="cine-place">${title}</div>${c.ornament !== 'none' ? ornament() : ''}<div class="cine-when">${c.subtitle || ''}</div>`;
  },
  act(c) {
    return `${c.eyebrow ? `<div class="cine-eyebrow">${esc(c.eyebrow)}</div>` : ''}
      <div class="cine-act">${esc(c.title)}</div>
      ${c.subtitle ? `<div class="cine-chap">${c.subtitle}</div>` : ''}
      ${c.ornament !== 'none' ? ornament() : ''}
      <div class="cine-epi">${(c.lines || []).map(l => `<p class="${l.emphasis ? 'last' : ''}">${l.text}</p>`).join('')}</div>`;
  },
};

// Séquence minutée : plans Ken Burns, cartons, pluie, éclairs, musique. Tout vient de data.timeline.
// Tout passe par une horloge propre à la scène (this.queue) : on peut la mettre en pause, et seek()
// reconstitue instantanément l'état à n'importe quel instant (aperçu de l'éditeur).
export class CinematicScene extends Scene {
  queue = [];
  paused = false;
  pausedAt = 0;
  cursor = null;
  silent = false;
  loopLevels = {};

  imagesToPreload() {
    return (this.data.timeline || []).flatMap(it => [it.src, ...(it.frames || [])]).filter(Boolean).map(p => this.url(p));
  }

  render() {
    const { chrome = {}, skip = {} } = this.data;
    const el = this.el;
    if (chrome.background) el.style.background = chrome.background;
    const v = chrome.vignette ?? 0;
    el.innerHTML = `
      <div class="cine-stage"></div>
      <div class="cine-leak"></div>
      ${v ? `<div class="cine-vignette" style="background:radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(0,0,0,${v}) 100%)"></div>` : ''}
      ${chrome.letterbox ? '<div class="cine-bars"></div>' : ''}
      ${chrome.rainCanvas ? '<canvas class="cine-rain" aria-hidden="true"></canvas>' : ''}
      <div class="cine-flash"></div>
      <div class="cine-cards"></div>
      <div class="cine-caption"></div>
      <div class="cine-sub" aria-hidden="true"><span class="who"></span><span class="txt"></span></div>
      <div class="cine-logo"></div>
      ${skip.mode !== 'none' && skip.label ? `<div class="cine-skip">${esc(skip.label)}</div>` : ''}`;
    const $ = s => el.querySelector(s);
    this.stage = $('.cine-stage');
    this.flashEl = $('.cine-flash');
    this.cardsEl = $('.cine-cards');
    this.canvas = $('.cine-rain');
    this.rain = 0;
    this.rainTarget = 0;
    this.loops = {};
    if (skip.mode !== 'none') {
      el.classList.add('is-skippable');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', skip.label || 'Passer');
    }
  }

  start() {
    const skipMode = this.data.skip?.mode ?? 'end';
    if (skipMode !== 'none' && !this.game.embed) {
      const go = () => skipMode === 'end' ? this.askSkip() : this.skip();
      this.listen(this.el, 'click', e => { if (!e.target.closest('.cine-confirm')) go(); });
      this.listen(window, 'keydown', e => {
        if (this.confirmEl) { this.onConfirmKey(e); return; }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      }, true);
    }
    this.onDispose(() => {
      cancelAnimationFrame(this.raf);
      cancelAnimationFrame(this.tickRaf);
      clearInterval(this.tickTimer);
      this.stopLoops();
      this.dropSfx();
      this.stopVoice();
    });
    if (this.canvas) this.startRain();
    const ctx = this.game.audio.context();
    if (ctx) (this.data.timeline || []).forEach(it => { if (it.do === 'sfx' && it.src) loadSample(ctx, this.url(it.src)); });
    this.t0 = performance.now();
    const tick = () => { this.step(); this.tickRaf = requestAnimationFrame(tick); };
    this.tickRaf = requestAnimationFrame(tick);
    // rAF s'arrête quand l'onglet est masqué : l'intervalle garde l'horloge en marche.
    this.tickTimer = setInterval(() => this.step(), 250);
    this.schedule(0);
  }

  get time() {
    return this.paused ? this.pausedAt : performance.now() - this.t0;
  }

  get duration() {
    const end = (this.data.timeline || []).find(it => it.do === 'end');
    return end ? end.at : Math.max(0, ...(this.data.timeline || []).map(it => (it.at || 0) + (it.duration || 0)));
  }

  // ---- Horloge ----

  at(time, fn) {
    const ev = { time, fn };
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].time > time) i--;
    this.queue.splice(i, 0, ev);
    return ev;
  }

  later(fn, ms) {
    return this.at((this.cursor ?? this.time) + ms, fn);
  }

  clearTimers() {
    super.clearTimers();
    this.queue = [];
  }

  step() {
    if (this.disposed || this.paused) return;
    this.followMusic();
    const now = this.time;
    while (this.queue.length && this.queue[0].time <= now && !this.disposed && !this.paused) {
      const ev = this.queue.shift();
      this.cursor = ev.time;
      try { ev.fn(); } finally { this.cursor = null; }
    }
  }

  // Musique « sync » : l'horloge de la scène suit la piste (latence au démarrage, onglet masqué…),
  // pour que les coupes restent calées sur les temps forts.
  followMusic() {
    const mc = this.musicClock;
    if (!mc || mc.el !== this.game.audio.music.el || mc.el.paused || mc.el.ended || !mc.el.currentTime) return;
    const drift = this.time - (mc.from + mc.el.currentTime * 1000);
    if (Math.abs(drift) > 40) this.t0 += drift;
  }

  schedule(from) {
    (this.data.timeline || []).filter(it => it.at >= from).forEach(it => this.at(it.at, () => this.exec(it)));
  }

  pause() {
    if (this.paused) return;
    this.pausedAt = this.time;
    this.paused = true;
    this.el.getAnimations({ subtree: true }).forEach(a => { if (a.playState === 'running') a.pause(); });
    this.game.audio.music.el?.pause();
    this.applyLoops(0);
    this.muteSfx(true);
    this.voiceHandle?.el.pause();
  }

  resume() {
    if (!this.paused) return;
    this.t0 = performance.now() - this.pausedAt;
    this.paused = false;
    this.finishing = false;
    this.el.getAnimations({ subtree: true }).forEach(a => { if (a.playState === 'paused') a.play(); });
    const music = this.game.audio.music;
    if (music.el && music.src) music.el.play().catch(() => {});
    this.applyLoops();
    this.muteSfx(false);
    const rv = this.resumeVoice;
    this.resumeVoice = null;
    if (rv) this.startVoice(rv.it, this.time - rv.from);
    else this.voiceHandle?.el.play().catch(() => {});
  }

  // Reconstitue l'état à l'instant `t` : la frise est rejouée en silence et chaque animation créée
  // en route est avancée du temps écoulé depuis sa création.
  seek(t, { play = !this.paused } = {}) {
    const end = (this.data.timeline || []).find(it => it.do === 'end');
    t = Math.max(0, end ? Math.min(t, end.at - 1) : t);
    this.clearTimers();
    this.el.getAnimations({ subtree: true }).forEach(a => a.cancel());
    this.stopLoops();
    this.dropSfx();
    this.stopVoice();
    this.game.audio.music.stop(0);
    cancelAnimationFrame(this.raf);
    this.render();
    if (this.canvas) this.startRain();
    this.finishing = false;
    this.music = null;
    this.musicClock = null;
    this.pendingVoice = null;
    this.resumeVoice = null;
    this.loopLevels = {};

    const created = [];
    this.silent = true;
    this.schedule(0);
    while (this.queue.length && this.queue[0].time <= t) {
      const ev = this.queue.shift();
      const before = new Set(this.el.getAnimations({ subtree: true }));
      this.cursor = ev.time;
      try { ev.fn(); } finally { this.cursor = null; }
      this.el.getAnimations({ subtree: true }).forEach(a => { if (!before.has(a)) created.push([a, ev.time]); });
    }
    this.silent = false;
    created.forEach(([a, from]) => {
      if (a.playState !== 'idle') a.currentTime = (a.currentTime || 0) + (t - from);
    });
    this.rain = this.rainTarget;

    this.paused = true;
    this.pausedAt = t;
    this.el.getAnimations({ subtree: true }).forEach(a => { if (a.playState === 'running') a.pause(); });
    if (this.music) {
      const { it, from } = this.music;
      const music = this.game.audio.music;
      music.play(this.url(it.src), { fade: 0, loop: it.loop ?? true, volume: this.music.volume });
      const el = music.el;
      const start = from - (it.offset || 0);
      const offset = (t - start) / 1000;
      const seekTo = () => { el.currentTime = el.loop && el.duration ? offset % el.duration : offset; };
      if (el.readyState >= 1) seekTo(); else el.addEventListener('loadedmetadata', seekTo, { once: true });
      el.pause();
      if (it.sync) this.musicClock = { el, from: start };
    }
    this.resumeVoice = this.pendingVoice;
    if (play) this.resume();
  }

  // Mode « end » : le clic ne passe pas directement, la cinématique se fige et le joueur confirme.
  askSkip() {
    if (this.finishing || this.confirmEl) return;
    this.pause();
    this.game.audio.ui('select');
    this.confirmReturn = document.activeElement;
    this.el.removeAttribute('role');
    const box = this.confirmEl = div('cine-confirm');
    box.innerHTML = `<div class="cine-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="cine-confirm-t">
        <h3 id="cine-confirm-t">Voulez-vous vraiment passer la cinématique ?</h3>
        ${ornament()}
        <div class="cine-confirm-acts">
          <button type="button" class="cine-confirm-btn" data-confirm="yes">Oui</button>
          <button type="button" class="cine-confirm-btn ghost" data-confirm="no">Annuler</button>
        </div>
      </div>`;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-confirm]');
      if (b) this.closeConfirm(b.dataset.confirm === 'yes');
      else if (e.target === box) this.closeConfirm(false);
    });
    this.el.appendChild(box);
    box.querySelector('[data-confirm="no"]').focus();
    this.announce('Voulez-vous vraiment passer la cinématique ? Oui, ou Annuler.');
  }

  onConfirmKey(e) {
    if (e.repeat) { e.preventDefault(); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.closeConfirm(false);
    } else if (e.key === 'Tab') {
      const btns = [...this.confirmEl.querySelectorAll('button')];
      const i = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
    }
  }

  closeConfirm(skip) {
    const box = this.confirmEl;
    if (!box) return;
    this.confirmEl = null;
    box.remove();
    this.el.setAttribute('role', 'button');
    this.game.audio.ui(skip ? 'select' : 'soft');
    this.resume();
    if (skip) this.skip();
    else if (this.confirmReturn?.isConnected) this.confirmReturn.focus();
    this.confirmReturn = null;
  }

  skip() {
    if (this.finishing) return;
    if (this.data.skip?.mode === 'marker') {
      const now = this.time;
      const marker = (this.data.timeline || []).filter(it => it.do === 'marker' && it.at > now).sort((a, b) => a.at - b.at)[0];
      if (marker) {
        this.jumpTo(marker.at);
        return;
      }
    }
    this.finish(true);
  }

  jumpTo(at) {
    this.clearTimers();
    this.t0 = performance.now() - at;
    if (this.musicClock) this.musicClock.el.currentTime = Math.max(0, at - this.musicClock.from) / 1000;
    this.cardsEl.querySelectorAll('.cine-card').forEach(c => this.removeCard(c, 1200));
    this.schedule(at);
  }

  announce(text) {
    if (!this.silent && !this.game.embed) super.announce(text);
  }

  exec(it) {
    const fn = this.ops[it.do];
    if (fn) fn.call(this, it);
    else console.warn(`[cinématique] opération inconnue « ${it.do} »`, it);
  }

  ops = {
    card(it) {
      const style = CARD_STYLES[it.style] || CARD_STYLES.act;
      const card = document.createElement('div');
      card.className = `cine-card cine-card--${it.style || 'act'}`;
      card.innerHTML = style(it);
      this.cardsEl.appendChild(card);
      this.announce([it.eyebrow, it.title, plain(it.subtitle)].filter(Boolean).join('. '));
      const lines = card.querySelectorAll('.cine-epi p');
      (it.lines || []).forEach((l, i) => this.later(() => {
        lines[i]?.classList.add('on');
        this.announce(plain(l.text));
      }, Math.max(0, l.at - it.at)));
      if (it.until != null) this.later(() => this.removeCard(card, it.out ?? 1100), it.until - it.at);
    },

    shot(s) {
      const fade = s.fade ?? 1000, total = s.duration + fade;
      const layer = div('cine-layer'), rig = div('cine-rig'), frame = div('cine-frame');
      const ease = s.ease || (s.shake ? 'ease-out' : 'cubic-bezier(.3,.1,.4,1)');
      const from = s.from || [1, 0, 0], to = s.to || from;
      const [r0, r1] = s.roll || [];
      frame.animate([{ transform: kb(from, r0) }, { transform: kb(to, r1 ?? r0) }], { duration: total, fill: 'forwards', easing: ease });
      const addImg = (src, hidden) => {
        const img = document.createElement('img');
        img.src = this.url(src);
        img.alt = '';
        if (hidden) img.style.opacity = 0;
        if (s.dark) img.style.filter = 'brightness(.42) saturate(.8)';
        frame.appendChild(img);
        return img;
      };
      const img = addImg(s.src);
      this.frames = s.frames?.length ? [img, ...s.frames.map(f => addImg(f, true))] : null;
      if (s.glows?.length) frame.appendChild(this.glows(s.glows, img, total));
      rig.appendChild(frame);
      layer.appendChild(rig);
      if (s.drive && !this.reduceMotion) this.drive(rig, s.drive);
      if (s.lamps && !this.reduceMotion) layer.appendChild(this.lamps(s.lamps));
      this.stage.appendChild(layer);
      const prev = [...this.stage.children].filter(l => l !== layer);
      const whip = !this.reduceMotion && /^whip-(left|right)$/.exec(s.transition || '');
      if (whip) {
        const d = whip[1] === 'left' ? 1 : -1, ms = Math.max(1, fade);
        layer.animate([
          { opacity: 0, transform: `translateX(${d * 45}%) scaleX(1.15)`, filter: 'blur(18px)' },
          { opacity: 1, offset: 0.4 },
          { opacity: 1, transform: 'none', filter: 'blur(0)' },
        ], { duration: ms, fill: 'forwards', easing: 'cubic-bezier(.5,0,.2,1)' });
        prev.forEach(l => l.animate([
          { opacity: 1, transform: 'none', filter: 'blur(0)' },
          { opacity: 0, transform: `translateX(${-d * 45}%) scaleX(1.15)`, filter: 'blur(18px)' },
        ], { duration: ms, fill: 'forwards', easing: 'cubic-bezier(.5,0,.2,1)' }));
      } else {
        layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(1, fade), fill: 'forwards', easing: 'ease-in-out' });
      }
      this.later(() => prev.forEach(l => l.remove()), fade + 50);
      if (s.rain != null) this.rainTarget = s.rain;
      (s.flashes || []).forEach(([dt, p]) => this.later(() => this.flash(p, s.dark ? img : null), dt));
      if (s.shake && !this.reduceMotion) this.shake(s.shake, s.duration);
      (s.sfx || []).forEach(name => this.sound(name));
      if (s.description) this.announce(s.description);
    },

    caption(it) {
      const el = this.el.querySelector('.cine-caption');
      el.innerHTML = `${it.kicker ? `<div class="k">${esc(it.kicker)}</div>` : ''}${it.title ? `<div class="n">${esc(it.title)}</div>` : ''}${it.text ? `<div class="s">${esc(it.text)}</div>` : ''}`;
      el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 1600, fill: 'forwards', easing: 'ease-out' });
      this.announce([it.kicker, it.title, it.text].filter(Boolean).join('. '));
      if (it.duration) this.later(() => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, fill: 'forwards' }), it.duration);
    },

    music(it) {
      if (this.silent) {
        if (it.src) this.music = { it, from: this.cursor, volume: it.volume ?? 1 };
        else if (this.music) this.music.volume = it.volume ?? 1;
        return;
      }
      const { music } = this.game.audio;
      if (it.src) {
        music.play(this.url(it.src), { fade: it.fade ?? 2500, loop: it.loop ?? true, volume: it.volume ?? 1 });
        if (it.offset) music.el.currentTime = it.offset / 1000;
        this.musicClock = it.sync ? { el: music.el, from: (this.cursor ?? this.time) - (it.offset || 0) } : null;
      } else music.fadeTo(it.volume ?? 1, it.fade ?? 1000);
    },

    voice(it) {
      if (this.silent) this.pendingVoice = { it, from: this.cursor };
      else this.startVoice(it, 0);
    },

    rain(it) {
      if (it.level != null) this.rainTarget = it.level;
      if (it.sound != null) this.loopTo('rain', it.sound, 0.8);
    },

    ambience(it) {
      this.loopTo(it.kind || 'wind', it.level ?? 0.5, 1.2);
    },

    sfx(it) {
      if (it.src) this.playFile(it);
      else this.sound(it.name, it);
    },

    clear() {
      this.stage.innerHTML = '';
      this.rainTarget = 0;
      this.rain = 0;
      this.loopLevels.rain = 0;
      const rain = this.loops.rain;
      if (rain) rain.gain.gain.setValueAtTime(0, this.game.audio.ctx.currentTime);
    },

    fadeLayers(it) {
      [...this.stage.children].forEach(l => l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: it.duration ?? 1400, fill: 'forwards' }));
    },

    logo(it) {
      const el = this.el.querySelector('.cine-logo');
      el.innerHTML = `<img src="${esc(this.url(it.src))}" alt="${esc(it.alt)}">`;
      el.animate([{ opacity: 0, transform: 'scale(1.06)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }],
        { duration: it.duration ?? 2400, fill: 'forwards', easing: 'cubic-bezier(.2,.7,.2,1)' });
      if (it.alt) this.announce(it.alt);
    },

    fx(it) {
      this.el.querySelector(`.cine-${it.name}`)?.classList.toggle('on', it.on !== false);
    },

    clockTicks(it) {
      const ctx = this.silent || this.paused ? null : this.game.audio.context();
      const { tickAt, clunk } = ctx ? synth.clockTicks(ctx, this.game.audio.sfxBus) : { tickAt: [], clunk: 4 };
      const steps = it.advanceAt || [];
      steps.forEach((k, n) => this.later(() => this.clockFrame(n + 1), (tickAt.length > k ? tickAt[k] : 1.2 + n) * 1000));
      this.later(() => { this.clockFrame(steps.length + 1); this.clockJolt(); }, clunk * 1000);
    },

    marker() {},

    end(it) {
      this.finish(false, it);
    },
  };

  // Réplique { src, character?, subtitle? } : sous-titre affiché le temps du son, la musique baisse (VoiceChannel).
  // offset (ms) : reprise en cours de phrase après un seek.
  startVoice(it, offset = 0) {
    this.stopVoice();
    const sub = this.el.querySelector('.cine-sub');
    const who = (it.character && this.game.data.characters?.[it.character]?.name) || '';
    const text = (it.subtitle || this.data.sounds?.[it.src]?.caption || '').trim();
    const token = this.subToken = (this.subToken || 0) + 1;
    const hide = () => { if (this.subToken === token) sub.classList.remove('on'); };
    const show = () => {
      if (!text || this.subToken !== token) return;
      sub.querySelector('.who').textContent = who;
      sub.querySelector('.txt').textContent = text;
      sub.classList.add('on');
    };
    if (text && !offset) this.announce(who ? `${who} : ${text}` : text);
    const audio = this.game.audio;
    if (!it.src || !audio.volume('voice')) {
      const left = 2600 + text.length * 45 - offset;
      if (text && left > 0) { show(); this.later(hide, left); }
      return;
    }
    const handle = this.voiceHandle = audio.voice.play(this.url(it.src));
    handle.onEnd = () => {
      if (this.voiceHandle === handle) this.voiceHandle = null;
      hide();
    };
    if (!offset) { show(); return; }
    const el = handle.el;
    const go = () => {
      if (offset / 1000 >= el.duration) handle.stop();
      else { el.currentTime = offset / 1000; show(); }
    };
    if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, { once: true });
  }

  stopVoice() {
    const handle = this.voiceHandle;
    this.voiceHandle = null;
    this.subToken = (this.subToken || 0) + 1;
    handle?.stop();
    this.el.querySelector('.cine-sub')?.classList.remove('on');
  }

  removeCard(card, ms) {
    card.style.transition = `opacity ${ms}ms ease, filter ${ms}ms ease`;
    card.classList.add('out');
    this.later(() => card.remove(), ms + 50);
  }

  flash(p, darkImg) {
    const k = this.reduceMotion ? 0.3 : 1;
    if (!darkImg) {
      const im = this.stage.lastChild?.querySelector('img');
      im?.animate([{ filter: 'brightness(1)' }, { filter: `brightness(${1 + 0.35 * k}) contrast(1.1)` }, { filter: 'brightness(1)' }], { duration: 700, easing: 'ease-out' });
    }
    const o = Math.min(p, 1) * k;
    this.flashEl.animate([{ opacity: 0 }, { opacity: 0.85 * o }, { opacity: 0.08 * k }, { opacity: 0.55 * o }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
    darkImg?.animate([{ filter: 'brightness(.42) saturate(.8)' }, { filter: 'brightness(1.5) saturate(1.1)' }, { filter: 'brightness(.9)' }, { filter: 'brightness(.42) saturate(.8)' }], { duration: 1600, easing: 'ease-out' });
    this.sound('thunder', { level: p });
  }

  shake(px, duration) {
    const kf = [], n = Math.max(1, Math.round(duration / 45));
    for (let i = 0; i <= n; i++) {
      const a = px * Math.pow(1 - i / n, 1.4);
      kf.push({ transform: `translate(${(Math.random() * 2 - 1) * a}px,${(Math.random() * 2 - 1) * a}px)` });
    }
    this.stage.animate(kf, { duration, easing: 'linear' });
  }

  // Caméra embarquée : trépidation de la route et quelques bosses, `px` = amplitude en pixels.
  drive(el, px) {
    const kf = [], n = 32;
    for (let i = 0; i <= n; i++) {
      const bump = i % 11 === 3 ? 2.2 : i % 11 === 4 ? -1.2 : 0;
      const y = i === n ? 0 : (Math.random() * 2 - 1) * px * 0.6 + bump * px;
      const x = i === n ? 0 : (Math.random() * 2 - 1) * px * 0.35;
      kf.push({ transform: `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${(x * 0.04).toFixed(3)}deg)` });
    }
    kf[0].transform = 'none';
    el.animate(kf, { duration: 2600, iterations: Infinity, easing: 'linear' });
  }

  // Lampadaires qui défilent : une bande de lumière chaude traverse l'image à chaque période.
  lamps(o) {
    const { interval = 1400, dir = 'left', level = 0.3, color = '#ffc777' } = typeof o === 'number' ? { interval: o } : o;
    const el = div('cine-lamp');
    el.style.background = `linear-gradient(100deg,transparent 15%,${color} 50%,transparent 85%)`;
    el.style.opacity = level;
    const [a, b] = dir === 'left' ? ['330%', '-130%'] : ['-130%', '330%'];
    el.animate([
      { transform: `translateX(${a}) skewX(-12deg)` },
      { transform: `translateX(${b}) skewX(-12deg)`, offset: 0.5 },
      { transform: `translateX(${b}) skewX(-12deg)` },
    ], { duration: interval, iterations: Infinity, easing: 'linear' });
    return el;
  }

  // Lumières de la voiture (phares, feux, clignotant) posées en % de l'image ; elles suivent le cadre.
  glows(list, img, total) {
    const box = div('cine-glows');
    img.addEventListener('load', () => box.style.setProperty('--r', img.naturalWidth / img.naturalHeight), { once: true });
    list.forEach(g => {
      const el = div('cine-glow'), core = div('');
      const color = g.color || '#fff4dc', size = g.size ?? 6;
      Object.assign(el.style, { left: `${g.x}%`, top: `${g.y}%`, width: `${size}%` });
      core.style.background = `radial-gradient(circle closest-side,#fff 0,${color} 10%,color-mix(in srgb,${color} 60%,transparent) 24%,color-mix(in srgb,${color} 22%,transparent) 52%,transparent 100%)`;
      el.appendChild(core);
      const op = Array.isArray(g.opacity) ? g.opacity : [g.opacity ?? 1];
      const grow = g.grow ?? 1;
      el.animate(op.map((o, i) => ({
        opacity: o,
        transform: `translate(-50%,-50%) scale(${1 + (grow - 1) * (op.length > 1 ? i / (op.length - 1) : 1)})`,
      })).concat(op.length > 1 ? [] : [{ opacity: op[0], transform: `translate(-50%,-50%) scale(${grow})` }]),
      { duration: total, delay: g.delay || 0, fill: 'both', easing: 'ease-in-out' });
      if (g.blink) {
        core.animate([{ opacity: 1 }, { opacity: 1, offset: 0.42 }, { opacity: 0, offset: 0.5 }, { opacity: 0, offset: 0.92 }, { opacity: 1 }],
          { duration: g.blink, delay: g.delay || 0, iterations: Infinity, fill: 'both' });
      }
      box.appendChild(el);
    });
    return box;
  }

  clockFrame(n) {
    const fr = this.frames;
    if (!fr?.[n]) return;
    fr.forEach((im, i) => { if (i > 0) im.style.opacity = i <= n ? 1 : 0; });
    if (!this.reduceMotion) this.stage.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(0,2px)' }, { transform: 'none' }], { duration: 140 });
  }

  clockJolt() {
    if (!this.reduceMotion) this.stage.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(0,5px)' }, { transform: 'translate(0,-2px)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
    this.flashEl.animate([{ opacity: 0, background: '#ffd9a0' }, { opacity: 0.18, background: '#ffd9a0' }, { opacity: 0, background: '#ffd9a0' }], { duration: 500 });
  }

  // interval en ms ; les valeurs absentes prennent les défauts de synth.js.
  sound(name, { level = 1, pan, count, interval } = {}) {
    if (this.silent) return;
    const ctx = this.game.audio.context();
    if (!ctx) return;
    const out = this.sfxOut(ctx), sec = interval != null ? interval / 1000 : undefined;
    switch (name) {
      case 'thunder': synth.thunder(ctx, out, level, level >= 1 ? 0.08 : 0.35 + Math.random() * 0.4); break;
      case 'rumble': synth.rumble(ctx, out); break;
      case 'passby': synth.passby(ctx, out, level, pan); break;
      case 'wipers': synth.wipers(ctx, out, level, count, sec); break;
      case 'indicator': synth.indicator(ctx, out, level, count, sec); break;
      case 'doorOpen': synth.door(ctx, out, level, false); break;
      case 'doorClose': synth.door(ctx, out, level, true); break;
      case 'footsteps': synth.footsteps(ctx, out, level, count, sec); break;
      default: console.warn(`[cinématique] bruitage inconnu « ${name} »`);
    }
  }

  // Fichier audio { src, level?, pan? } : pan décale le son dans l'espace stéréo (-1 gauche, 1 droite).
  // S'il n'est pas encore décodé, il démarre en retard, à la bonne position, pour rester calé sur la frise.
  playFile({ src, level = 1, pan = 0 }) {
    if (this.silent) return;
    const ctx = this.game.audio.context();
    if (!ctx) return;
    const bus = this.sfxOut(ctx), t0 = ctx.currentTime;
    loadSample(ctx, this.url(src)).then(buf => {
      const late = ctx.currentTime - t0;
      if (!buf || this.sfxGain !== bus || late >= buf.duration) return;
      const node = ctx.createBufferSource(), gain = ctx.createGain();
      node.buffer = buf;
      gain.gain.value = level;
      node.connect(gain);
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        gain.connect(p); p.connect(bus);
      } else gain.connect(bus);
      node.start(0, late);
    });
  }

  // Les bruitages passent par un bus propre à la scène : pause et seek coupent aussi ceux déjà programmés.
  sfxOut(ctx) {
    if (!this.sfxGain) {
      this.sfxGain = ctx.createGain();
      this.sfxGain.connect(this.game.audio.sfxBus);
    }
    return this.sfxGain;
  }

  muteSfx(muted) {
    const ctx = this.game.audio.ctx;
    if (ctx && this.sfxGain) this.sfxGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.03);
  }

  dropSfx() {
    this.sfxGain?.disconnect();
    this.sfxGain = null;
  }

  loopTo(kind, level, timeConstant) {
    this.loopLevels[kind] = level;
    if (this.silent || this.paused) return;
    const audio = this.game.audio, ctx = audio.context();
    if (!ctx) return;
    if (!this.loops[kind]) {
      const make = LOOPS[kind];
      if (!level || !make) return;
      this.loops[kind] = make(ctx, audio.sfxBus);
    }
    this.loops[kind].gain.gain.setTargetAtTime(level, ctx.currentTime, timeConstant);
  }

  // Remet les boucles (pluie, vent) à leur niveau courant, ou à `level` (0 pour la pause).
  applyLoops(level) {
    for (const [kind, target] of Object.entries(this.loopLevels)) {
      if (level === 0) {
        const ctx = this.game.audio.ctx;
        if (ctx && this.loops[kind]) this.loops[kind].gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      } else this.loopTo(kind, target, 0.3);
    }
  }

  stopLoops() {
    Object.values(this.loops || {}).forEach(l => l.stop());
    this.loops = {};
  }

  startRain() {
    const c = this.canvas, g = c.getContext('2d');
    const drops = Array.from({ length: 320 }, () => ({ x: Math.random(), y: Math.random(), l: 0.02 + Math.random() * 0.035, v: 0.9 + Math.random() * 0.8 }));
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 2);
      g.clearRect(0, 0, w, h);
      if (this.rain > 0.01) {
        g.strokeStyle = `rgba(200,210,235,${0.32 * this.rain})`;
        g.lineWidth = Math.max(1, devicePixelRatio);
        g.beginPath();
        const count = Math.floor(drops.length * this.rain);
        for (let i = 0; i < count; i++) {
          const d = drops[i];
          d.y += d.v * dt * 1.6; d.x -= d.v * dt * 0.25;
          if (d.y > 1.05) { d.y = -0.05; d.x = Math.random() * 1.2; }
          if (d.x < -0.05) d.x += 1.1;
          const x = d.x * w, y = d.y * h;
          g.moveTo(x, y); g.lineTo(x - d.l * h * 0.16, y + d.l * h);
        }
        g.stroke();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  finish(skipped, endItem) {
    if (this.finishing) return;
    this.finishing = true;
    if (this.game.embed) {
      this.pause();
      this.game.emit('ended', this);
      return;
    }
    this.clearTimers();
    if (skipped) this.stopVoice();
    const natural = endItem?.fadeOut ?? 1400;
    const fade = skipped ? Math.min(700, natural || 0) : natural;
    if (!endItem?.keepMusic) this.game.audio.music.stop(skipped ? 650 : Math.max(fade, 600) + 300);
    const ctx = this.game.audio.ctx;
    if (ctx) Object.values(this.loops).forEach(l => l.gain.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.2, fade / 3000)));
    if (fade) this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fade, fill: 'forwards' });
    this.later(() => this.game.scenes.next(this, this.data.next), fade + 20);
  }
}
