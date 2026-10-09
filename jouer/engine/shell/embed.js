// Aperçu intégré dans l'éditeur (?embed=1) : pas de coquille, la page parente envoie la scène
// en cours d'édition et pilote la lecture par postMessage.
//   reçoit : ldtw:load { id, scene, at, play } · ldtw:seek { at, play } · ldtw:play · ldtw:pause · ldtw:sound { on }
//   envoie : ldtw:ready · ldtw:time { t, playing, duration } · ldtw:ended · ldtw:error { message }
const TIME_INTERVAL = 80;

export function installEmbed(game) {
  const parent = window.parent;
  const send = msg => parent.postMessage(msg, location.origin);
  let scene = null;
  let loadSeq = 0;

  game.shell = { starting: true, toMenu() {}, show() {} };
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-game'));
  document.body.classList.add('embed');

  const report = () => {
    if (!scene || scene.disposed) return;
    send({ type: 'ldtw:time', t: scene.time ?? 0, playing: scene.paused === false, duration: scene.duration ?? 0 });
  };
  setInterval(() => { if (scene && scene.paused === false) report(); }, TIME_INTERVAL);
  game.on('ended', s => { if (s === scene) { report(); send({ type: 'ldtw:ended' }); } });

  const control = (at, play) => {
    if (!scene) return;
    if (typeof scene.seek === 'function') {
      if (at != null) scene.seek(at, { play });
      else if (play) scene.resume();
      else scene.pause();
    }
    report();
  };

  window.addEventListener('message', async e => {
    if (e.origin !== location.origin || e.source !== parent) return;
    const msg = e.data || {};
    switch (msg.type) {
      case 'ldtw:load': {
        const seq = ++loadSeq;
        try {
          const next = await game.scenes.show(msg.id, structuredClone(msg.scene));
          if (seq !== loadSeq || !next) return;
          scene = next;
          control(msg.at ?? 0, !!msg.play);
        } catch (err) {
          console.error(err);
          send({ type: 'ldtw:error', message: err.message });
        }
        break;
      }
      case 'ldtw:seek': control(msg.at, msg.play); break;
      case 'ldtw:play': control(null, true); break;
      case 'ldtw:pause': control(null, false); break;
      case 'ldtw:sound':
        if (msg.on) game.audio.unlock();
        game.settings.set({ sound: !!msg.on });
        break;
    }
  });

  send({ type: 'ldtw:ready' });
}
