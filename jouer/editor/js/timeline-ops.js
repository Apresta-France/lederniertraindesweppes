import { fileName, formatSeconds } from './paths.js';

export const LANES = [
  { id: 'shots', label: 'Plans' },
  { id: 'cards', label: 'Cartons' },
  { id: 'audio', label: 'Audio' },
  { id: 'fx', label: 'Effets' },
  { id: 'markers', label: 'Repères' },
];

const num = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export const OPS = {
  shot: {
    label: 'Plan (image)',
    lane: 'shots',
    template: (at) => ({ at, do: 'shot', src: '', duration: 4000, fade: 1000, from: [1, 0, 0], to: [1.1, 0, 0], description: '' }),
    end: (it) => it.at + num(it.duration),
    summary: (it) => `${fileName(it.src) || '(sans image)'} · ${formatSeconds(it.duration)}${it.description ? '' : ' · sans audiodescription'}`,
  },
  card: {
    label: 'Carton',
    lane: 'cards',
    template: (at) => ({ at, do: 'card', style: 'once', title: '', ornament: 'middle', until: at + 4000, out: 1000 }),
    end: (it) => (num(it.until) > it.at ? it.until : null),
    summary: (it) => [it.eyebrow, it.title].filter(Boolean).join(' — ') || '(carton sans titre)',
  },
  caption: {
    label: 'Légende',
    lane: 'cards',
    template: (at) => ({ at, do: 'caption', kicker: '', title: '', text: '', duration: 5000 }),
    end: (it) => (num(it.duration) > 0 ? it.at + it.duration : null),
    summary: (it) => it.title || it.text || '(légende vide)',
  },
  logo: {
    label: 'Logo',
    lane: 'cards',
    template: (at) => ({ at, do: 'logo', src: '@shared/branding/logo_intro.png', alt: 'Le Dernier Train des Weppes', duration: 2400 }),
    end: (it) => (num(it.duration) > 0 ? it.at + it.duration : null),
    summary: (it) => it.alt || fileName(it.src) || 'logo',
  },
  music: {
    label: 'Musique',
    lane: 'audio',
    template: (at) => ({ at, do: 'music', src: '', volume: 1, fade: 2500, loop: true }),
    end: () => null,
    summary: (it) => (it.src ? `${fileName(it.src)} · volume ${num(it.volume, 1)}` : `volume → ${num(it.volume, 1)} en ${formatSeconds(num(it.fade, 1000))}`),
  },
  rain: {
    label: 'Pluie',
    lane: 'audio',
    template: (at) => ({ at, do: 'rain', level: 0.5, sound: 0.1 }),
    end: () => null,
    summary: (it) => ['level' in it ? `visible ${it.level}` : '', 'sound' in it ? `son ${it.sound}` : ''].filter(Boolean).join(' · ') || 'pluie',
  },
  ambience: {
    label: 'Ambiance',
    lane: 'audio',
    template: (at) => ({ at, do: 'ambience', kind: 'wind', level: 0.5 }),
    end: () => null,
    summary: (it) => `${it.kind || '?'} ${num(it.level)}`,
  },
  fx: {
    label: 'Effet',
    lane: 'fx',
    template: (at) => ({ at, do: 'fx', name: 'leak', on: true }),
    end: () => null,
    summary: (it) => `${it.name || '?'} ${it.on === false ? 'arrêt' : 'marche'}`,
  },
  clear: {
    label: 'Effacer les calques',
    lane: 'fx',
    template: (at) => ({ at, do: 'clear' }),
    end: () => null,
    summary: () => 'efface les plans et cartons',
  },
  fadeLayers: {
    label: 'Fondu des calques',
    lane: 'fx',
    template: (at) => ({ at, do: 'fadeLayers', duration: 1400 }),
    end: (it) => (num(it.duration) > 0 ? it.at + it.duration : null),
    summary: (it) => `fondu ${formatSeconds(num(it.duration))}`,
  },
  clockTicks: {
    label: 'Tic-tac d’horloge',
    lane: 'fx',
    template: (at) => ({ at, do: 'clockTicks', advanceAt: [3, 10, 18] }),
    end: () => null,
    summary: (it) => `images aux tics ${Array.isArray(it.advanceAt) ? it.advanceAt.join(', ') : '—'}`,
  },
  marker: {
    label: 'Repère',
    lane: 'markers',
    template: (at) => ({ at, do: 'marker' }),
    end: () => null,
    summary: () => 'cible du bouton « passer » (mode marker)',
  },
  end: {
    label: 'Fin',
    lane: 'markers',
    template: (at) => ({ at, do: 'end', fadeOut: 1400 }),
    end: (it) => (num(it.fadeOut) > 0 ? it.at + it.fadeOut : null),
    summary: (it) => `fondu ${formatSeconds(num(it.fadeOut, 1400))}${it.keepMusic ? ' · musique conservée' : ''}`,
  },
};

export const OP_NAMES = Object.keys(OPS);

export function opOf(item) {
  return OPS[item?.do] || null;
}

export function laneOf(item) {
  return opOf(item)?.lane || 'markers';
}

export function itemEnd(item) {
  const op = opOf(item);
  const at = num(item?.at);
  if (!op) return null;
  const end = op.end({ ...item, at });
  return typeof end === 'number' && end > at ? end : null;
}

export function totalDuration(timeline) {
  if (!Array.isArray(timeline)) return 0;
  return timeline.reduce((max, item) => Math.max(max, itemEnd(item) ?? num(item?.at)), 0);
}

/** Stable sort by `at`; returns the new index of `tracked` (an item reference) or -1. */
export function sortTimeline(timeline, tracked = null) {
  const sorted = timeline
    .map((item, index) => ({ item, index }))
    .sort((a, b) => num(a.item?.at) - num(b.item?.at) || a.index - b.index)
    .map(({ item }) => item);
  timeline.splice(0, timeline.length, ...sorted);
  return tracked ? timeline.indexOf(tracked) : -1;
}
