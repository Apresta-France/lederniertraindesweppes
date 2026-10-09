// Sons procéduraux (Web Audio). Chaque fonction reçoit le contexte et le bus de sortie,
// le volume du canal est porté par le bus.

export function noise(ctx, seconds, brown) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// ---- Interface ----

export function ui(ctx, out, kind) {
  const now = ctx.currentTime;
  if (kind === 'hover' || kind === 'select') {
    const notes = kind === 'select' ? [[660, 0], [990, 0.09]] : [[1150, 0]];
    notes.forEach(([f, dt]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, now + dt);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, now + dt + 0.12);
      g.gain.setValueAtTime(0, now + dt);
      g.gain.linearRampToValueAtTime(kind === 'select' ? 0.12 : 0.04, now + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dt + (kind === 'select' ? 0.5 : 0.1));
      o.connect(g); g.connect(out); o.start(now + dt); o.stop(now + dt + 0.6);
    });
    return;
  }
  const o = ctx.createOscillator(), g = ctx.createGain();
  const ding = kind === 'ding';
  o.type = ding ? 'sine' : 'triangle';
  o.frequency.setValueAtTime(ding ? 1320 : kind === 'click' ? 900 : 620, now);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(ding ? 0.12 : 0.06, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + (ding ? 0.9 : 0.12));
  o.connect(g); g.connect(out); o.start(now); o.stop(now + 1);
}

// ---- Menu ----

export function ambientLoop(ctx, out) {
  const src = noise(ctx, 4, true);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 450;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
  lfo.frequency.value = 0.07; lfoG.gain.value = 260;
  lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
  const g = ctx.createGain();
  g.gain.value = 0.35;
  src.connect(lp); lp.connect(g); g.connect(out); src.start();
  return { stop: () => { src.stop(); lfo.stop(); } };
}

export function whistle(ctx, out, level = 1) {
  const now = ctx.currentTime;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + 900 * level;
  const dl = ctx.createDelay(); dl.delayTime.value = 0.32;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  const g = ctx.createGain(); g.gain.value = 0.6;
  lp.connect(g); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(g); g.connect(out);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.09 * level, now + 0.35);
  env.gain.setValueAtTime(0.09 * level, now + 1.6);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
  env.connect(lp);
  const vib = ctx.createOscillator(), vg = ctx.createGain();
  vib.frequency.value = 5; vg.gain.value = 4; vib.connect(vg); vib.start(now); vib.stop(now + 3);
  [587, 740, 880].forEach(f => {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; vg.connect(o.frequency);
    og.gain.value = 0.25; o.connect(og); og.connect(env); o.start(now); o.stop(now + 3);
  });
}

// ---- Météo ----

export function thunder(ctx, out, power, delay) {
  const now = ctx.currentTime + delay;
  const src = noise(ctx, 4, true), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300 + power * 600, now);
  lp.frequency.exponentialRampToValueAtTime(70, now + 3.2);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(Math.min(1.4, power * 1.1), now + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
  src.connect(lp); lp.connect(g); g.connect(out); src.start(now); src.stop(now + 4);
  if (power >= 0.9) {
    const cr = noise(ctx, 0.4, false), hp = ctx.createBiquadFilter(), cg = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 1200;
    cg.gain.setValueAtTime(0.35, now);
    cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    cr.connect(hp); hp.connect(cg); cg.connect(out); cr.start(now); cr.stop(now + 0.4);
  }
}

export function rumble(ctx, out) {
  const now = ctx.currentTime, src = noise(ctx, 3, true), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 220;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(1.3, now + 0.15);
  g.gain.setValueAtTime(1.3, now + 2.7);
  g.gain.linearRampToValueAtTime(0, now + 3);
  src.connect(lp); lp.connect(g); g.connect(out); src.start(now); src.stop(now + 3);
}

// Boucles réglables : renvoient { gain, stop }.
export function rainLoop(ctx, out) {
  const src = noise(ctx, 3, false), bp = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.loop = true;
  bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.5;
  gain.gain.value = 0;
  src.connect(bp); bp.connect(gain); gain.connect(out); src.start();
  return { gain, stop: () => { try { src.stop(); } catch (e) { /* déjà arrêté */ } } };
}

export function windLoop(ctx, out) {
  const src = noise(ctx, 4, true), lp = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.loop = true;
  lp.type = 'lowpass'; lp.frequency.value = 600;
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 0.18; lg.gain.value = 350;
  lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  gain.gain.value = 0;
  src.connect(lp); lp.connect(gain); gain.connect(out); src.start();
  return { gain, stop: () => { try { src.stop(); lfo.stop(); } catch (e) { /* déjà arrêté */ } } };
}

// Horloge : grincement, les aiguilles s'emballent, ralentissent, puis « clac ».
// Renvoie les instants des tics et du clac, en secondes à partir de maintenant.
export function clockTicks(ctx, dest) {
  const t0 = ctx.currentTime + 0.05;
  const out = ctx.createGain(); out.gain.value = 1;
  const verb = ctx.createDelay(); verb.delayTime.value = 0.07;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2500;
  out.connect(dest); out.connect(verb); verb.connect(damp); damp.connect(fb); fb.connect(verb); damp.connect(dest);

  const len = Math.floor(ctx.sampleRate * 0.04), tickBuf = ctx.createBuffer(1, len, ctx.sampleRate), td = tickBuf.getChannelData(0);
  for (let i = 0; i < len; i++) td[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const tick = (t, f, amp) => {
    const src = ctx.createBufferSource(); src.buffer = tickBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9;
    const g = ctx.createGain(); g.gain.value = amp * 2.2;
    src.connect(bp); bp.connect(g); g.connect(out); src.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = f * 1.9;
    og.gain.setValueAtTime(amp * 0.05, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.06);
  };

  const cr = noise(ctx, 1.1, false), cbp = ctx.createBiquadFilter(), cg = ctx.createGain();
  cbp.type = 'bandpass'; cbp.Q.value = 14;
  cbp.frequency.setValueAtTime(700, t0); cbp.frequency.linearRampToValueAtTime(1300, t0 + 0.5); cbp.frequency.linearRampToValueAtTime(900, t0 + 1);
  cg.gain.setValueAtTime(0, t0); cg.gain.linearRampToValueAtTime(0.35, t0 + 0.15); cg.gain.linearRampToValueAtTime(0.25, t0 + 0.8); cg.gain.linearRampToValueAtTime(0, t0 + 1.05);
  cr.connect(cbp); cbp.connect(cg); cg.connect(out); cr.start(t0); cr.stop(t0 + 1.1);

  const gaps = [];
  for (let k = 0; k < 4; k++) gaps.push(0.45 - k * 0.065);
  for (let k = 0; k < 16; k++) gaps.push(Math.max(0.075, 0.15 - k * 0.006));
  for (let k = 0; k < 5; k++) gaps.push(0.12 + k * 0.07);
  let t = t0 + 0.7;
  const tickAt = [];
  gaps.forEach((gap, i) => { tickAt.push(t - ctx.currentTime); tick(t, i % 2 ? 2300 : 3100, i < 4 ? 0.9 : 0.6); t += gap; });

  const clunk = t + 0.35;
  const th = noise(ctx, 0.3, true), tl = ctx.createBiquadFilter(), tg = ctx.createGain();
  tl.type = 'lowpass'; tl.frequency.value = 400;
  tg.gain.setValueAtTime(1.6, clunk); tg.gain.exponentialRampToValueAtTime(0.0001, clunk + 0.28);
  th.connect(tl); tl.connect(tg); tg.connect(out); th.start(clunk); th.stop(clunk + 0.3);
  tick(clunk, 1800, 1.2);
  [523, 1046, 1569].forEach((f, n) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.06 / (n + 1), clunk); g.gain.exponentialRampToValueAtTime(0.0001, clunk + 1.8);
    o.connect(g); g.connect(out); o.start(clunk); o.stop(clunk + 1.9);
  });
  return { tickAt, clunk: clunk - ctx.currentTime };
}
