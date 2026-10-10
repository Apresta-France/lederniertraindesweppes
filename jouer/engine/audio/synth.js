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

// ---- Route ----

const stopAll = nodes => () => nodes.forEach(n => { try { n.stop(); } catch (e) { /* déjà arrêté */ } });

// Roulement d'une voiture électrique sur chaussée mouillée : grondement des pneus, chuintement de l'eau, léger sifflement moteur.
export function roadLoop(ctx, out) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(out);
  const rumble = noise(ctx, 4, true), lp = ctx.createBiquadFilter(), rg = ctx.createGain();
  rumble.loop = true;
  lp.type = 'lowpass'; lp.frequency.value = 140;
  rg.gain.value = 1.1;
  rumble.connect(lp); lp.connect(rg); rg.connect(gain);
  const hiss = noise(ctx, 3, false), bp = ctx.createBiquadFilter(), hg = ctx.createGain();
  hiss.loop = true;
  bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.6;
  hg.gain.value = 0.12;
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 0.23; lg.gain.value = 0.05;
  lfo.connect(lg); lg.connect(hg.gain);
  hiss.connect(bp); bp.connect(hg); hg.connect(gain);
  const whine = ctx.createOscillator(), wg = ctx.createGain();
  whine.frequency.value = 410; wg.gain.value = 0.006;
  whine.connect(wg); wg.connect(gain);
  const nodes = [rumble, hiss, lfo, whine];
  nodes.forEach(n => n.start());
  return { gain, stop: stopAll(nodes) };
}

// Voiture qui passe sous la pluie : la gerbe d'eau monte puis retombe (effet Doppler), panoramique de -pan à +pan.
export function passby(ctx, out, level = 1, pan = 1, seconds = 3.2) {
  const now = ctx.currentTime, peak = now + seconds * 0.45, end = now + seconds;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.9 * level, peak);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-pan, now);
    p.pan.linearRampToValueAtTime(pan, end);
    env.connect(p); p.connect(out);
  } else env.connect(out);
  const hiss = noise(ctx, seconds, false), bp = ctx.createBiquadFilter(), hg = ctx.createGain();
  bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(700, now);
  bp.frequency.exponentialRampToValueAtTime(2200, peak);
  bp.frequency.exponentialRampToValueAtTime(600, end);
  hg.gain.value = 0.7;
  hiss.connect(bp); bp.connect(hg); hg.connect(env);
  const body = noise(ctx, seconds, true), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(180, now);
  lp.frequency.linearRampToValueAtTime(320, peak);
  lp.frequency.linearRampToValueAtTime(140, end);
  body.connect(lp); lp.connect(env);
  [hiss, body].forEach(n => { n.start(now); n.stop(end); });
}

// Essuie-glaces : `count` allers-retours, le caoutchouc frotte la vitre puis bute en fin de course.
export function wipers(ctx, out, level = 1, count = 1, period = 1.858) {
  const t0 = ctx.currentTime + 0.02;
  for (let i = 0; i < count * 2; i++) {
    const t = t0 + i * period / 2, back = i % 2;
    const s = noise(ctx, 0.5, false), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(back ? 1500 : 1800, t);
    bp.frequency.linearRampToValueAtTime(back ? 1900 : 1300, t + 0.45);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * level, t + 0.08);
    g.gain.linearRampToValueAtTime(0.1 * level, t + 0.35);
    g.gain.linearRampToValueAtTime(0, t + 0.48);
    s.connect(bp); bp.connect(g); g.connect(out); s.start(t); s.stop(t + 0.5);
    const k = noise(ctx, 0.12, true), kl = ctx.createBiquadFilter(), kg = ctx.createGain();
    kl.type = 'lowpass'; kl.frequency.value = 260;
    kg.gain.setValueAtTime(0.7 * level, t + 0.48);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    k.connect(kl); kl.connect(kg); kg.connect(out); k.start(t + 0.48); k.stop(t + 0.6);
  }
}

// Clignotant : relais qui claque, tic à l'allumage, tac à l'extinction.
export function indicator(ctx, out, level = 1, count = 8, interval = 0.4645) {
  const t0 = ctx.currentTime + 0.02;
  for (let i = 0; i < count; i++) {
    const t = t0 + i * interval;
    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = i % 2 ? 1250 : 1650;
    bp.type = 'bandpass'; bp.frequency.value = i % 2 ? 2400 : 3200; bp.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.04);
  }
}

// Course sur sol mouillé : impact sourd et éclaboussure à chaque foulée, qui s'éloignent (volume et aigus baissent).
export function footsteps(ctx, out, level = 1, count = 10, interval = 0.31) {
  const t0 = ctx.currentTime + 0.02;
  for (let i = 0; i < count; i++) {
    const t = t0 + i * interval + (Math.random() - 0.5) * 0.03;
    const far = Math.pow(0.82, i) * level * (i % 2 ? 0.85 : 1);
    const th = noise(ctx, 0.12, true), tl = ctx.createBiquadFilter(), tg = ctx.createGain();
    tl.type = 'lowpass'; tl.frequency.value = 200;
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(1.3 * far, t + 0.008);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    th.connect(tl); tl.connect(tg); tg.connect(out); th.start(t); th.stop(t + 0.12);
    const sp = noise(ctx, 0.2, false), sb = ctx.createBiquadFilter(), sg = ctx.createGain();
    sb.type = 'bandpass'; sb.Q.value = 0.9; sb.frequency.value = 2600 * Math.pow(0.9, i);
    sg.gain.setValueAtTime(0.0001, t + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.35 * far, t + 0.025);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    sp.connect(sb); sb.connect(sg); sg.connect(out); sp.start(t + 0.01); sp.stop(t + 0.2);
  }
}

// Portière : déclic du loquet et souffle du joint à l'ouverture, coup sourd à la fermeture.
export function door(ctx, out, level = 1, closing = false) {
  const now = ctx.currentTime + 0.02;
  const tc = closing ? now + 0.03 : now;
  const c = noise(ctx, 0.06, false), hp = ctx.createBiquadFilter(), cg = ctx.createGain();
  hp.type = 'highpass'; hp.frequency.value = 2000;
  cg.gain.setValueAtTime(0.4 * level, tc);
  cg.gain.exponentialRampToValueAtTime(0.0001, tc + 0.05);
  c.connect(hp); hp.connect(cg); cg.connect(out); c.start(tc); c.stop(tc + 0.06);
  const tb = closing ? now : now + 0.08, dur = closing ? 0.35 : 0.25;
  const b = noise(ctx, 0.5, true), lp = ctx.createBiquadFilter(), bg = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = closing ? 170 : 420;
  bg.gain.setValueAtTime(0.0001, tb);
  bg.gain.exponentialRampToValueAtTime((closing ? 1.6 : 0.35) * level, tb + 0.01);
  bg.gain.exponentialRampToValueAtTime(0.0001, tb + dur);
  b.connect(lp); lp.connect(bg); bg.connect(out); b.start(tb); b.stop(tb + dur + 0.05);
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
