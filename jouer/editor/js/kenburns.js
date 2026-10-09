import { h } from './dom.js';
import { assetUrl, formatSeconds } from './paths.js';

const VIEW_RATIO = 16 / 9;

const kbTransform = ([k, x, y]) => `translate(${x}%,${y}%) scale(${k})`;

function triple(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number') ? value : [1, 0, 0];
}

/**
 * Visible frame, in fractions of the source image, of a 16:9 viewport showing the image
 * with object-fit: cover and `translate(x%, y%) scale(k)` (transform-origin: center).
 */
export function visibleFrame([k, x, y], imageRatio) {
  const scale = k > 0 ? k : 1;
  const cropW = imageRatio > VIEW_RATIO ? VIEW_RATIO / imageRatio : 1;
  const cropH = imageRatio > VIEW_RATIO ? 1 : imageRatio / VIEW_RATIO;
  const left = 0.5 - x / 100 / scale - 0.5 / scale;
  const top = 0.5 - y / 100 / scale - 0.5 / scale;
  return {
    left: (1 - cropW) / 2 + left * cropW,
    top: (1 - cropH) / 2 + top * cropH,
    width: cropW / scale,
    height: cropH / scale,
  };
}

/** Ken Burns preview of the shot at `path`: from/to frames on the image + animated 16:9 viewport. */
export function createKenBurnsPreview(scope, path) {
  const mapImg = h('img', { alt: '', draggable: 'false' });
  const fromRect = h('div', { class: 'kb-rect kb-from' }, h('span', null, 'début'));
  const toRect = h('div', { class: 'kb-rect kb-to' }, h('span', null, 'fin'));
  const map = h('div', { class: 'kb-map' }, mapImg, fromRect, toRect);
  const viewImg = h('img', { alt: '', draggable: 'false' });
  const viewport = h('div', { class: 'kb-viewport' }, viewImg);
  const play = h('button', { type: 'button', class: 'btn btn-small' }, '▶ Lire');
  const time = h('span', { class: 'coords' }, '');
  const empty = h('p', { class: 'help' }, 'Choisissez une image pour prévisualiser le mouvement.');
  const el = h('div', { class: 'kb' },
    h('p', { class: 'kb-legend' }, h('span', { class: 'kb-swatch kb-from' }), ' cadre de début ', h('span', { class: 'kb-swatch kb-to' }), ' cadre de fin'),
    empty, map, viewport,
    h('div', { class: 'btn-row' }, play, time));

  let animations = [];
  let finished = null;
  let raf = 0;

  function item() {
    return scope.value(path) || {};
  }

  function stop() {
    animations.forEach((a) => a.cancel());
    animations = [];
    finished?.cancel();
    finished = null;
    cancelAnimationFrame(raf);
    play.textContent = '▶ Lire';
    time.textContent = '';
    viewImg.style.transform = kbTransform(triple(item().from));
    viewImg.style.opacity = '1';
  }

  function placeRect(rect, frame) {
    rect.style.left = `${frame.left * 100}%`;
    rect.style.top = `${frame.top * 100}%`;
    rect.style.width = `${frame.width * 100}%`;
    rect.style.height = `${frame.height * 100}%`;
  }

  function refresh() {
    const shot = item();
    const url = assetUrl(scope.store.id, shot.src || '');
    empty.hidden = Boolean(url);
    map.hidden = !url;
    viewport.hidden = !url;
    play.disabled = !url;
    if (mapImg.dataset.src !== url) {
      mapImg.dataset.src = url;
      if (url) {
        mapImg.src = url;
        viewImg.src = url;
      }
    }
    const ratio = mapImg.naturalWidth && mapImg.naturalHeight ? mapImg.naturalWidth / mapImg.naturalHeight : VIEW_RATIO;
    map.style.aspectRatio = String(ratio);
    placeRect(fromRect, visibleFrame(triple(shot.from), ratio));
    placeRect(toRect, visibleFrame(triple(shot.to), ratio));
    viewImg.style.filter = shot.dark ? 'brightness(.42) saturate(.8)' : '';
    if (!animations.length) viewImg.style.transform = kbTransform(triple(shot.from));
  }

  mapImg.addEventListener('load', refresh);

  play.addEventListener('click', () => {
    if (animations.length) {
      stop();
      return;
    }
    finished?.cancel();
    finished = null;
    const shot = item();
    const fade = typeof shot.fade === 'number' ? shot.fade : 1000;
    const total = Math.max(1, (Number(shot.duration) || 0) + fade);
    const easing = shot.ease || (shot.shake ? 'ease-out' : 'cubic-bezier(.3,.1,.4,1)');
    let motion;
    try {
      motion = viewImg.animate([{ transform: kbTransform(triple(shot.from)) }, { transform: kbTransform(triple(shot.to)) }], { duration: total, easing, fill: 'forwards' });
    } catch {
      motion = viewImg.animate([{ transform: kbTransform(triple(shot.from)) }, { transform: kbTransform(triple(shot.to)) }], { duration: total, fill: 'forwards' });
    }
    animations = [motion];
    if (fade > 0) animations.push(viewImg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: 'ease-in-out' }));
    play.textContent = '■ Arrêter';
    const started = performance.now();
    const tick = () => {
      const elapsed = Math.min(total, performance.now() - started);
      time.textContent = `${formatSeconds(elapsed)} / ${formatSeconds(total)}`;
      if (elapsed < total) raf = requestAnimationFrame(tick);
    };
    tick();
    motion.finished.then(() => {
      animations = [];
      finished = motion;
      play.textContent = '▶ Rejouer';
    }).catch(() => {});
  });

  scope.watch(refresh);
  scope.disposers.push(stop);
  return el;
}
