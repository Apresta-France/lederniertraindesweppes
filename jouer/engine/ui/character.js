// Personnage animé : lèvres synchronisées sur le niveau de la voix, clignements, respiration.
// Les images viennent de shared/characters/<id>/character.json (idle, talk[2], blink).
export class CharacterSprite {
  constructor(el, frames) {
    this.el = el;
    this.frames = frames;
    this.cur = -1;
    const now = performance.now();
    Object.assign(this, {
      nextBlink: now + 1500 + Math.random() * 2000, blinkEnd: 0, hold: 0, lvl: 0, peak: 0, top: 0.02,
      last: 0, nod: 0, tilt: 0, tiltTo: 0, nextTilt: 0, talkAmt: 0,
    });
  }

  // 0 repos, 1 et 2 bouche ouverte, 3 yeux fermés
  setFrame(k) {
    if (k === this.cur) return;
    this.cur = k;
    this.frames.forEach((f, i) => f.classList.toggle('on', i === k || (i === 0 && !this.frames[k])));
  }

  update(now, voice) {
    const talking = !!voice?.playing();
    if (talking) {
      const l = voice.level();
      const raw = l >= 0 ? l : 0.05 + Math.random() * 0.1;
      this.lvl = this.lvl * 0.4 + raw * 0.6;
      // crête glissante : rend l'animation indépendante du volume du fichier
      this.top = Math.max(0.01, raw > this.top ? this.top + (raw - this.top) * 0.5 : this.top * 0.995);
      const n = this.lvl / this.top;
      if (now >= this.hold) {
        const k = n < 0.28 ? 0 : n < 0.75 ? 1 : this.last === 2 ? 1 : (Math.random() < 0.6 ? 2 : 1);
        this.setFrame(k);
        this.last = k;
        this.hold = now + 120 + Math.random() * 80;
      }
      if (raw > this.peak * 1.6 && n > 0.85 && this.nod < 0.05) this.nod = 1;
      this.peak = this.peak * 0.92 + raw * 0.08;
      if (now >= this.nextTilt) { this.tiltTo = (Math.random() * 2 - 1) * 0.5; this.nextTilt = now + 1800 + Math.random() * 1800; }
      if (now >= this.nextBlink && n < 0.2) { this.blinkEnd = now + 120; this.nextBlink = now + 2500 + Math.random() * 3000; }
      if (now < this.blinkEnd) this.setFrame(3);
    } else if (now < this.blinkEnd) {
      this.setFrame(3);
    } else {
      this.setFrame(0);
      this.tiltTo = 0;
      if (now >= this.nextBlink) {
        this.blinkEnd = now + 130;
        this.nextBlink = now + (Math.random() < 0.2 ? 280 : 2500 + Math.random() * 3500);
      }
    }
    this.talkAmt += ((talking ? 1 : 0) - this.talkAmt) * 0.04;
    this.tilt += (this.tiltTo - this.tilt) * 0.025;
    this.nod *= 0.94;
    const breath = Math.sin(now / 1900) * 0.003;
    const bob = Math.sin(now / 520) * 0.25 * this.talkAmt;
    this.el.style.setProperty('--gt', `translateY(${(bob + this.nod * 0.7).toFixed(2)}px) rotate(${(this.tilt * this.talkAmt + this.nod * 0.25).toFixed(2)}deg) scaleY(${(1 + breath).toFixed(4)})`);
  }
}
