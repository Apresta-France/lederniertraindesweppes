import { tween, clamp01 } from './tween.js';
import * as synth from './synth.js';

// Un lecteur <audio> seul plafonne au volume du fichier : la voix passe par Web Audio,
// amplifiée puis limitée par un compresseur.
const VOICE_BOOST = 2.6;

class MusicChannel {
  constructor(audio) {
    this.audio = audio;
    this.el = null;
    this.src = '';
    this.level = 0;
    this.duckLevel = 1;
    this.cancelFade = () => {};
    this.cancelDuck = () => {};
  }

  play(src, { fade = 2500, loop = true, volume = 1 } = {}) {
    if (this.el && this.src === src && !this.el.paused) {
      this.fadeTo(volume, fade);
      return;
    }
    this.cancelFade();
    this.el?.pause();
    const el = this.el = new Audio(src);
    el.loop = loop;
    this.src = src;
    this.level = 0;
    this.apply();
    el.play().catch(() => {});
    this.fadeTo(volume, fade);
  }

  fadeTo(target, ms, onDone) {
    this.cancelFade();
    this.cancelFade = tween(this.level, target, ms, v => { this.level = v; this.apply(); }, onDone);
  }

  stop(ms = 1200) {
    const el = this.el;
    if (!el) return;
    this.src = '';
    this.fadeTo(0, ms, () => { if (this.el === el) { el.pause(); this.el = null; } else el.pause(); });
  }

  duck(target, ms) {
    this.cancelDuck();
    this.cancelDuck = tween(this.duckLevel, target, ms, v => { this.duckLevel = v; this.apply(); });
  }

  apply() {
    if (this.el) this.el.volume = clamp01(this.audio.volume('music') * this.level * this.duckLevel);
  }
}

class VoiceChannel {
  constructor(audio) {
    this.audio = audio;
    this.current = null;
    this.active = new Set();
  }

  play(src, { duck = 0.3, exclusive = true } = {}) {
    if (exclusive) this.stop();
    const audio = this.audio;
    const el = new Audio(src);
    el.preload = 'auto';
    const handle = { el, gain: null, analyser: null, buf: null };
    const ctx = audio.context();
    if (ctx) {
      try {
        const source = ctx.createMediaElementSource(el);
        handle.gain = ctx.createGain();
        handle.analyser = ctx.createAnalyser();
        handle.analyser.fftSize = 512;
        handle.buf = new Float32Array(handle.analyser.fftSize);
        handle.gain.gain.value = audio.volume('voice') * VOICE_BOOST;
        source.connect(handle.gain);
        handle.gain.connect(audio.voiceBus);
        source.connect(handle.analyser);
      } catch (e) {
        handle.gain = null;
      }
    }
    if (!handle.gain) el.volume = Math.min(1, audio.volume('voice'));

    handle.level = () => {
      if (!handle.analyser) return -1;
      handle.analyser.getFloatTimeDomainData(handle.buf);
      let s = 0;
      for (let i = 0; i < handle.buf.length; i++) s += handle.buf[i] * handle.buf[i];
      return Math.sqrt(s / handle.buf.length);
    };
    handle.setVolume = v => {
      if (handle.gain) handle.gain.gain.setTargetAtTime(v * VOICE_BOOST, audio.ctx.currentTime, 0.05);
      else el.volume = Math.min(1, v);
    };
    handle.playing = () => !el.paused && !el.ended;

    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      this.active.delete(handle);
      if (this.current === handle) this.current = null;
      if (duck != null) audio.music.duck(1, 1200);
      handle.onEnd?.();
    };
    handle.stop = () => { el.pause(); finish(); };
    el.addEventListener('ended', finish);
    el.addEventListener('error', finish);

    this.active.add(handle);
    if (exclusive) this.current = handle;
    if (duck != null) audio.music.duck(duck, 500);
    el.play().catch(finish);
    return handle;
  }

  stop() {
    this.current?.stop();
  }

  apply() {
    const v = this.audio.volume('voice');
    this.active.forEach(h => h.setVolume(v));
  }
}

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.samples = new Set();
    this.ambienceLevel = 1;
    this.music = new MusicChannel(this);
    this.voice = new VoiceChannel(this);
    settings.on('change', () => this.apply());
  }

  // Volume effectif d'un canal (0 à 1), son coupé compris.
  volume(channel) {
    const s = this.settings.values;
    return s.sound ? (s[channel] ?? 100) / 100 : 0;
  }

  // À appeler sur un geste du joueur : les navigateurs bloquent l'audio avant.
  unlock() {
    this.context();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  context() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      const ctx = this.ctx = new C();
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ambienceBus = ctx.createGain();
      this.ambienceBus.connect(this.master);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
      comp.connect(this.master);
      this.voiceBus = comp;
      this.apply();
    } catch (e) {
      this.ctx = null;
    }
    return this.ctx;
  }

  apply() {
    this.music.apply();
    this.voice.apply();
    this.samples.forEach(el => { el.volume = Math.min(1, this.volume('sfx')); });
    if (!this.ctx) return;
    const s = this.settings.values, now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.sound ? 1 : 0, now, 0.15);
    this.sfxBus.gain.setTargetAtTime(s.sfx / 100, now, 0.05);
    this.ambienceBus.gain.setTargetAtTime(s.music / 100 * 0.7 * this.ambienceLevel, now, 0.15);
  }

  // Nappe d'ambiance du menu et sifflets : suivent le volume Musique.
  fadeAmbience(level, timeConstant = 0.3) {
    this.ambienceLevel = level;
    if (this.ctx) this.ambienceBus.gain.setTargetAtTime(this.settings.values.music / 100 * 0.7 * level, this.ctx.currentTime, timeConstant);
  }

  // duration (ms) : coupe le son avant sa fin, avec un fondu de sortie de fade ms.
  playSample(src, { loop = false, onEnded, duration, fade = 600 } = {}) {
    const el = new Audio(src);
    el.loop = loop;
    el.volume = Math.min(1, this.volume('sfx'));
    this.samples.add(el);
    const handle = {
      el,
      stop: () => { el.pause(); this.samples.delete(el); },
    };
    el.addEventListener('ended', () => { this.samples.delete(el); onEnded?.(); });
    if (this.volume('sfx') > 0) el.play().catch(() => {});
    if (duration) {
      const fadeMs = Math.min(fade, duration);
      setTimeout(() => {
        this.samples.delete(el);
        const from = el.volume, t0 = performance.now();
        const step = now => {
          const k = Math.min(1, (now - t0) / fadeMs);
          el.volume = from * (1 - k);
          if (k < 1) requestAnimationFrame(step);
          else el.pause();
        };
        requestAnimationFrame(step);
      }, duration - fadeMs);
    }
    return handle;
  }

  // Petits sons d'interface synthétisés : soft, click, ding (décor) et hover, select (menus).
  ui(kind) {
    if (!this.settings.values.sound) return;
    const ctx = this.context();
    if (ctx) synth.ui(ctx, this.sfxBus, kind);
  }
}
