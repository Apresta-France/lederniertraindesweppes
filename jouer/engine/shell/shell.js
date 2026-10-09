import * as synth from '../audio/synth.js';
import { resolve } from '../core/paths.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const MENU = ['new', 'continue', 'load', 'options', 'credits', 'quit'];
const TITLES = { newgame: 'Nouvelle partie', options: 'Options', load: 'Charger une partie', credits: 'Crédits', quit: 'Quitter' };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const fmt = iso => { try { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

// Écrans hors scènes : accueil, intros studio et logo, menu, options, sauvegardes.
export class Shell {
  constructor(game) {
    this.game = game;
    this.config = { skipIntro: false, introSpeed: 1, showLeaves: true, ...game.config.shell };
    this.ui = { screen: 'consent', active: 0, panel: null, ngStep: 'choice', ngMode: 'local', lastMode: null };
    this.timers = [];
    this.fading = false;
    this.starting = false;
    this.shownAt = 0;
    this.account = null;
    try { this.account = JSON.parse(localStorage.getItem('ldtw_account') || 'null'); } catch (e) { /* aucun compte */ }
    this.returning = /(^|; )ldtw_player=/.test(document.cookie) || game.settings.stored;
    this.bind();
    this.render();
  }

  get settings() { return this.game.settings.values; }
  get saves() { return this.game.saves; }

  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  speed() { return this.config.introSpeed; }

  // ---- Audio de la coquille ----

  startAmbient() {
    const audio = this.game.audio, ctx = audio.context();
    if (!ctx || this.ambient) return;
    this.ambient = synth.ambientLoop(ctx, audio.ambienceBus);
  }

  whistle(level) {
    const audio = this.game.audio, ctx = audio.context();
    if (ctx) synth.whistle(ctx, audio.ambienceBus, level);
  }

  menuIn() {
    const { audio, data } = this.game;
    audio.fadeAmbience(1, 0.5);
    if (data.game.shell?.menuMusic) audio.music.play(resolve(data.game.shell.menuMusic), { fade: 2000 });
  }

  menuOut(slow = false) {
    this.game.audio.fadeAmbience(0, slow ? 0.45 : 0.2);
    this.game.audio.music.stop(slow ? 1400 : 700);
  }

  // ---- Écrans ----

  show(screen) {
    this.voicePreview?.stop();
    $$('.screen').forEach(el => el.classList.remove('leaving'));
    this.ui.screen = screen;
    this.ui.panel = null;
    this.shownAt = Date.now();
    if (screen === 'consent') this.starting = false;
    if (screen !== 'game') {
      this.game.scenes.clear();
      this.game.audio.voice.stop();
      this.game.audio.music.stop(800);
    }
    $$('.screen').forEach(el => el.classList.toggle('active', el.id === 'screen-' + screen));
    this.render();
    const focus = { consent: '#btn-start', menu: '#menu .item:not(.disabled)' }[screen];
    if (focus) requestAnimationFrame(() => $(focus)?.focus({ preventScroll: true }));
  }

  go(screen, after) {
    this.fading = true;
    $('#fade').classList.add('on');
    this.later(() => {
      this.show(screen);
      $('#fade').classList.remove('on');
      this.fading = false;
      after?.();
    }, 700);
  }

  toMenu() {
    this.go('menu', () => this.menuIn());
  }

  playScene(id) {
    this.go('game', () => this.game.scenes.goto(id));
  }

  setCookie(on) {
    if (on) {
      const m = document.cookie.match(/ldtw_player=([^;]+)/);
      const id = m ? m[1] : Math.random().toString(36).slice(2, 10);
      document.cookie = `ldtw_player=${id}; max-age=31536000; path=/; SameSite=Lax`;
    } else {
      document.cookie = 'ldtw_player=; max-age=0; path=/';
      this.game.settings.forget();
      this.saves.clear();
    }
  }

  start() {
    if (this.starting) return;
    this.starting = true;
    document.activeElement?.blur();
    this.setCookie(this.settings.consent);
    this.game.settings.persist();
    this.game.audio.unlock();
    if (this.settings.sound) this.startAmbient();
    this.clearTimers();
    if (this.config.skipIntro) { this.go('menu', () => this.menuIn()); return; }
    this.go('studio', () => this.studioTimeline());
  }

  studioTimeline() {
    const sp = this.speed();
    this.later(() => this.whistle(0.55), 1400 * sp);
    this.later(() => $('#screen-studio').classList.add('leaving'), 6600 * sp);
    this.later(() => this.toLogo(), 7600 * sp);
  }

  logoTimeline() {
    const sp = this.speed();
    this.later(() => this.whistle(1), 1100 * sp);
    this.later(() => $('#screen-logo').classList.add('leaving'), 5800 * sp);
    this.later(() => this.toMenuFromLogo(), 6800 * sp);
  }

  toLogo() {
    this.clearTimers();
    $('#screen-studio').classList.add('leaving');
    this.go('logo', () => this.logoTimeline());
  }

  toMenuFromLogo() {
    this.clearTimers();
    $('#screen-logo').classList.add('leaving');
    this.go('menu', () => this.menuIn());
  }

  skip() {
    if (this.fading || Date.now() - this.shownAt < 1200) return;
    if (this.ui.screen === 'studio') this.toLogo();
    else if (this.ui.screen === 'logo') this.toMenuFromLogo();
  }

  // ---- Parties ----

  visibleSaves() {
    return this.saves.visible(this.account);
  }

  disabled(id) {
    if (id === 'continue') return this.visibleSaves().length === 0;
    if (id === 'load') return this.visibleSaves().length === 0 && !!this.account;
    return false;
  }

  select(id) {
    this.game.audio.ui('select');
    if (id === 'new') {
      if (this.account) this.startNew('account');
      else { Object.assign(this.ui, { panel: 'newgame', ngStep: 'choice', ngMode: 'local' }); this.render(); this.focusPanel(); }
    } else if (id === 'continue') {
      this.loadSlot(this.visibleSaves()[0]);
    } else {
      this.ui.panel = id;
      this.render();
      this.focusPanel();
    }
  }

  startNew(mode) {
    const { game } = this;
    if (mode === 'local' && !this.settings.consent) { game.settings.set({ consent: true }); this.setCookie(true); }
    this.ui.lastMode = mode;
    game.state.reset();
    this.saves.create({ mode, email: mode === 'account' && this.account ? this.account.email : undefined, chapter: 'Prologue', place: 'Nouvelle partie' });
    this.menuOut(true);
    this.later(() => this.playScene(game.data.game.start), 700);
  }

  loadSlot(slot) {
    if (!slot) return;
    const { game } = this;
    const data = this.saves.use(slot);
    if (data) game.state.load(data); else game.state.reset();
    this.menuOut();
    this.playScene(data?.scene || game.data.game.continue || game.data.game.start);
  }

  ngGo() {
    this.game.audio.ui('select');
    if (this.ui.ngMode === 'account') { this.ui.ngStep = 'account'; this.render(); this.later(() => $('#ng-form input').focus(), 50); }
    else this.startNew('local');
  }

  rememberAccount() {
    try {
      localStorage.setItem('ldtw_account', JSON.stringify(this.account));
      localStorage.setItem('ldtw_known_account', JSON.stringify(this.account));
    } catch (e) { /* stockage indisponible */ }
  }

  submitAccount(form) {
    const f = new FormData(form);
    const pseudo = (f.get('pseudo') || '').trim(), email = (f.get('email') || '').trim(), pass = f.get('pass') || '';
    const err = !pseudo ? 'Choisissez un pseudo.' : !EMAIL.test(email) ? 'Adresse e-mail invalide.' : pass.length < 6 ? 'Le mot de passe doit faire au moins 6 caractères.' : '';
    $('#ng-error').textContent = err;
    if (err) return;
    this.game.audio.ui('select');
    this.account = { pseudo, email };
    this.rememberAccount();
    form.reset();
    this.startNew('account');
  }

  // Prototype : la connexion simule la récupération d'une partie stockée sur le serveur.
  submitLogin(form) {
    const f = new FormData(form);
    const email = (f.get('email') || '').trim(), pass = f.get('pass') || '';
    const err = !EMAIL.test(email) ? 'Adresse e-mail invalide.' : pass.length < 6 ? 'Mot de passe incorrect.' : '';
    $('#login-error').textContent = err;
    if (err) return;
    this.game.audio.ui('select');
    let known = null;
    try { known = JSON.parse(localStorage.getItem('ldtw_known_account') || 'null'); } catch (e) { /* aucun */ }
    this.account = known && known.email.toLowerCase() === email.toLowerCase() ? known : { pseudo: email.split('@')[0], email };
    if (!this.saves.list.some(s => s.mode === 'account' && s.email === this.account.email)) {
      this.saves.create({ mode: 'account', email: this.account.email, chapter: 'Chapitre I', place: 'La chambre de Gisèle', date: new Date(Date.now() - 864e5).toISOString() });
      this.saves.current = null;
    }
    this.rememberAccount();
    form.reset();
    this.render();
  }

  move(dir) {
    let i = this.ui.active;
    for (let k = 0; k < MENU.length; k++) {
      i = (i + dir + MENU.length) % MENU.length;
      if (!this.disabled(MENU[i])) break;
    }
    this.ui.active = i;
    this.game.audio.ui('hover');
    this.render();
    $$('#menu .item')[i]?.focus();
  }

  focusPanel() {
    requestAnimationFrame(() => {
      const body = $('.panel-body.active');
      (body?.querySelector('button:not([disabled]),input,[tabindex="0"]') || $('#panel .panel-close'))?.focus();
    });
  }

  closePanel() {
    this.ui.panel = null;
    this.render();
    $$('#menu .item')[this.ui.active]?.focus();
  }

  // ---- Réglages ----

  toggle(name) {
    const { game } = this;
    if (name === 'sound') {
      game.settings.set({ sound: !this.settings.sound });
      if (this.settings.sound && this.ui.screen !== 'consent') {
        game.audio.unlock();
        this.startAmbient();
        if (this.ui.screen === 'menu' && !game.audio.music.src) this.menuIn();
      }
    } else if (name === 'consent') {
      const on = !this.settings.consent;
      game.settings.set({ consent: on });
      if (this.ui.screen !== 'consent') { this.setCookie(on); if (on) game.settings.persist(); }
    } else {
      game.settings.set({ [name]: !this.settings[name] });
    }
    this.render();
  }

  previewVoice() {
    const { game } = this;
    const cfg = game.data.game.shell?.voicePreview;
    const c = cfg && game.data.characters[cfg.character];
    const pool = c?.voice?.[cfg.pool] || [];
    if (!pool.length) return;
    if (!this.settings.sound || !this.settings.voice) { this.voicePreview?.stop(); return; }
    if (this.voicePreview?.playing()) return;
    let n;
    do { n = Math.floor(Math.random() * pool.length); } while (pool.length > 1 && n === this.lastPreview);
    this.lastPreview = n;
    game.audio.unlock();
    this.voicePreview = game.audio.voice.play(resolve(pool[n].src, c.base), { duck: null, exclusive: false });
  }

  // ---- Rendu ----

  render() {
    const s = this.settings, ui = this.ui;
    $('#greeting').textContent = this.returning ? 'Bon retour à bord' : 'Avant le départ';
    ['sound', 'consent', 'reduceMotion'].forEach(name => {
      $$(`[data-switch="${name}"]`).forEach(el => el.classList.toggle('on', !!s[name]));
      $$(`[data-toggle="${name}"]`).forEach(el => el.setAttribute('aria-checked', String(!!s[name])));
    });
    $('#sound-chip').textContent = s.sound ? 'Son activé' : 'Son coupé';
    $('#leaves').style.display = this.config.showLeaves ? '' : 'none';

    $$('#menu .item').forEach((el, i) => {
      const dis = this.disabled(el.dataset.id);
      el.classList.toggle('disabled', dis);
      el.setAttribute('aria-disabled', String(dis));
      el.classList.toggle('active', i === ui.active && !dis);
    });

    const panel = $('#panel');
    panel.hidden = !ui.panel;
    $('#panel-title').textContent = TITLES[ui.panel] || '';
    $$('.panel-body').forEach(el => el.classList.toggle('active', el.dataset.panel === ui.panel));

    $('#login-form').style.display = this.account ? 'none' : '';
    $('#account-bar').style.display = this.account ? '' : 'none';
    $('#account-name').textContent = this.account ? this.account.pseudo : '';
    $('#slots-label').textContent = this.account ? 'Vos parties' : 'Sur ce navigateur';
    $$('.choice[data-mode]').forEach(el => {
      const on = el.dataset.mode === (ui.ngMode || 'local');
      el.classList.toggle('selected', on);
      el.setAttribute('aria-checked', String(on));
    });
    $$('.ng-step').forEach(el => el.classList.toggle('active', el.dataset.step === ui.ngStep));
    for (const id of ['music', 'voice', 'sfx']) {
      $('#' + id).value = s[id];
      $(`#${id}-val`).textContent = s[id];
    }
    $('#text-scale').value = Math.round(s.textScale * 100);
    $('#text-scale-val').textContent = Math.round(s.textScale * 100) + ' %';

    const list = this.visibleSaves();
    $('#slots').innerHTML = [0, 1, 2].map(i => {
      const sv = list[i];
      const mode = sv?.mode === 'account' ? ' · Compte' : sv?.mode === 'local' ? ' · Ce navigateur' : '';
      return `<button type="button" class="slot${sv ? '' : ' empty'}" data-slot="${i}"${sv ? '' : ' disabled'}>
        <span class="label">Emplacement ${i + 1}</span>
        <span>${sv ? `${sv.chapter} · ${sv.place}${mode}` : 'Vide'}</span>
        <span class="date">${sv ? fmt(sv.date) : '—'}</span></button>`;
    }).join('');

    $('#quit-note').textContent = s.consent ? 'Votre progression est sauvegardée.' : 'Sans cookie, votre progression sera perdue.';
  }

  // ---- Événements ----

  bind() {
    const { game } = this;
    document.addEventListener('click', e => {
      const t = e.target;
      const tog = t.closest('[data-toggle]');
      if (tog) { this.toggle(tog.dataset.toggle); return; }
      if (t.closest('#btn-start')) { this.start(); return; }
      if (t.closest('.skippable')) { this.skip(); return; }
      const item = t.closest('#menu .item');
      if (item) {
        const i = MENU.indexOf(item.dataset.id);
        if (!this.disabled(item.dataset.id)) { this.ui.active = i; this.select(item.dataset.id); }
        return;
      }
      if (t.closest('#btn-logout')) {
        this.account = null;
        try { localStorage.removeItem('ldtw_account'); } catch (x) { /* rien */ }
        this.ui.active = 0;
        this.render();
        return;
      }
      const ch = t.closest('.choice[data-mode]');
      if (ch) { game.audio.ui('hover'); this.ui.ngMode = ch.dataset.mode; this.render(); return; }
      if (t.closest('#ng-go')) { this.ngGo(); return; }
      if (t.closest('#ng-back')) { this.ui.ngStep = 'choice'; $('#ng-error').textContent = ''; this.render(); return; }
      if (t.closest('[data-close]') && t.closest('#panel')) { this.closePanel(); return; }
      const slot = t.closest('#slots .slot');
      if (slot && !slot.classList.contains('empty')) { game.audio.ui('select'); this.loadSlot(this.visibleSaves()[+slot.dataset.slot]); return; }
      if (t.closest('#btn-erase')) { this.saves.clear(); this.ui.active = 0; this.render(); return; }
      if (t.closest('#btn-quit')) { this.clearTimers(); this.menuOut(); this.returning = true; this.ui.active = 0; this.go('consent'); }
    });

    $('#menu').addEventListener('mouseover', e => {
      const item = e.target.closest('.item');
      if (!item) return;
      const i = MENU.indexOf(item.dataset.id);
      if (!this.disabled(item.dataset.id) && i !== this.ui.active) { this.ui.active = i; game.audio.ui('hover'); this.render(); }
    });

    $('#login-form').addEventListener('submit', e => { e.preventDefault(); this.submitLogin(e.target); });
    $('#ng-form').addEventListener('submit', e => { e.preventDefault(); this.submitAccount(e.target); });
    $('#music').addEventListener('input', e => { game.settings.set({ music: +e.target.value }); this.render(); });
    $('#voice').addEventListener('input', e => { game.settings.set({ voice: +e.target.value }); this.render(); });
    $('#voice').addEventListener('change', () => this.previewVoice());
    $('#sfx').addEventListener('input', e => { game.settings.set({ sfx: +e.target.value }); game.audio.ui('hover'); this.render(); });
    $('#text-scale').addEventListener('input', e => { game.settings.set({ textScale: +e.target.value / 100 }); this.render(); });

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const screen = this.ui.screen;
      const onButton = document.activeElement?.matches('button, input, [role="switch"]');
      if (screen === 'consent' && e.key === 'Enter' && !onButton) { this.start(); return; }
      if (screen === 'studio' || screen === 'logo') { this.skip(); return; }
      if (screen === 'menu') {
        if (this.ui.panel) {
          if (e.key === 'Escape') this.closePanel();
          if (this.ui.panel === 'newgame' && this.ui.ngStep === 'choice' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            this.ui.ngMode = this.ui.ngMode === 'account' ? 'local' : 'account';
            game.audio.ui('hover');
            this.render();
          }
          return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
        if (e.key === 'Enter' && !document.activeElement?.closest('#menu .item')) {
          const id = MENU[this.ui.active];
          if (!this.disabled(id)) this.select(id);
        }
      }
      if (screen === 'game' && e.key === 'Escape') this.toMenu();
    });

    document.addEventListener('keydown', e => {
      const radio = e.target.closest?.('[role="radio"]');
      if (radio && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); radio.click(); }
    }, true);
  }
}
