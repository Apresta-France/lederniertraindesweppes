import { h, uid } from './dom.js';
import { collapsible, section } from './fields.js';
import { validators } from './json-field.js';
import { OPS, OP_NAMES, totalDuration } from './timeline-ops.js';
import { createKenBurnsPreview } from './kenburns.js';
import { formatSeconds } from './paths.js';

const EASES = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier(.3,.1,.4,1)', 'cubic-bezier(.45,.05,.55,.95)'];

function itemValidator(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Un objet { … } est attendu.';
  if (typeof value.at !== 'number' || value.at < 0) return 'Le champ « at » (millisecondes, ≥ 0) est obligatoire.';
  if (typeof value.do !== 'string') return 'Le champ « do » est obligatoire.';
  return null;
}

function sfxField(scope, path) {
  const legendId = uid('sfx');
  const boxes = ['rumble', 'thunder'].map((name) => {
    const input = h('input', { type: 'checkbox', id: uid('sfx') });
    input.addEventListener('change', () => {
      const current = Array.isArray(scope.value(path)) ? scope.value(path) : [];
      const next = input.checked ? [...new Set([...current, name])] : current.filter((n) => n !== name);
      scope.commit(path, next.length ? next : undefined, `sfx:${Date.now()}`);
    });
    scope.watch(() => {
      const current = scope.value(path);
      input.checked = Array.isArray(current) && current.includes(name);
      input.disabled = scope.readOnly;
    });
    return h('span', { class: 'field-check' }, input, h('label', { for: input.id }, name === 'rumble' ? 'rumble (grondement)' : 'thunder (tonnerre)'));
  });
  return h('fieldset', { class: 'field field-inline', 'aria-labelledby': legendId }, h('legend', { id: legendId }, 'Bruitages (sfx)'), boxes);
}

export function renderCinematicNone(scope) {
  const timeline = Array.isArray(scope.store.scene.timeline) ? scope.store.scene.timeline : [];
  const shots = timeline.filter((i) => i?.do === 'shot');
  const missing = shots.filter((s) => !s.description).length;
  return [
    section('Aucune sélection',
      h('p', null, `${timeline.length} élément(s), dont ${shots.length} plan(s). Durée totale : ${formatSeconds(totalDuration(timeline))}.`),
      missing ? h('p', { class: 'help warn' }, `${missing} plan(s) sans audiodescription.`) : null,
      h('p', { class: 'help' }, 'Cliquez sur un élément de la frise ou de la liste pour le modifier. « Ajouter… » crée un élément au temps de la sélection (les plans se placent après le dernier plan).')),
  ];
}

export function renderItemInspector(scope, index, { resort }) {
  const base = ['timeline', index];
  const p = (...keys) => [...base, ...keys];
  const item = scope.value(base) || {};
  const op = item.do;
  const common = [
    scope.number({ label: 'Instant (at, ms)', path: p('at'), integer: true, min: 0, step: 100, optional: false, onChange: () => resort(index) }),
    scope.select({ label: 'Opération (do)', path: p('do'), optional: false, options: OP_NAMES.map((name) => [name, `${name} — ${OPS[name].label}`]) }),
  ];
  const ms = (label, key, help = '') => scope.number({ label, path: p(key), integer: true, min: 0, step: 100, help });

  let specific = [];
  switch (op) {
    case 'shot': {
      const easeList = uid('eases');
      specific = [
        section('Image',
          scope.asset({ label: 'Image (src)', path: p('src'), kind: 'image', optional: false }),
          scope.text({
            label: 'Audiodescription (lue par les lecteurs d’écran)',
            path: p('description'),
            optional: false,
            multiline: true,
            rows: 3,
            help: 'Décrivez ce que montre le plan : lu au début du plan.',
          }),
          scope.json({ label: 'Images superposées (frames)', path: p('frames'), rows: 3, validate: validators.stringList, help: 'Révélées une à une par clockTicks.' })),
        section('Mouvement',
          ms('Durée (duration, ms)', 'duration'),
          ms('Fondu enchaîné (fade, ms)', 'fade', '0 = cut. Par défaut : 1000.'),
          scope.tuple({ label: 'Cadre de début (from)', path: p('from'), labels: ['Échelle', 'X %', 'Y %'], integer: false, step: 0.01 }),
          scope.tuple({ label: 'Cadre de fin (to)', path: p('to'), labels: ['Échelle', 'X %', 'Y %'], integer: false, step: 0.01 }),
          h('datalist', { id: easeList }, EASES.map((e) => h('option', { value: e }))),
          scope.text({ label: 'Courbe (ease)', path: p('ease'), list: easeList, mono: true, placeholder: 'cubic-bezier(.3,.1,.4,1)' }),
          createKenBurnsPreview(scope, base)),
        section('Ambiance',
          scope.check({ label: 'Plan sombre (dark)', path: p('dark') }),
          scope.number({ label: 'Secousse (shake, px)', path: p('shake'), step: 1, min: 0 }),
          scope.number({ label: 'Pluie pendant le plan (rain)', path: p('rain'), step: 0.05, min: 0, max: 1 }),
          scope.json({ label: 'Éclairs (flashes)', path: p('flashes'), rows: 2, help: '[[délai ms, intensité], …]', validate: (v) => (Array.isArray(v) && v.every((f) => Array.isArray(f) && f.length === 2 && f.every((n) => typeof n === 'number')) ? null : 'Format attendu : [[900, 1], [1450, 0.5]].') }),
          sfxField(scope, p('sfx'))),
      ];
      break;
    }
    case 'card':
      specific = [section('Carton',
        scope.select({ label: 'Style', path: p('style'), options: [['once', 'once — « Il était une fois »'], ['date', 'date — lieu et date'], ['act', 'act — titre d’acte']] }),
        scope.text({ label: 'Surtitre (eyebrow)', path: p('eyebrow') }),
        scope.text({ label: 'Titre', path: p('title') }),
        scope.select({ label: 'Effet du titre', path: p('titleEffect'), options: [['none', 'aucun'], ['letters', 'lettre par lettre'], ['words', 'mot par mot']] }),
        scope.text({ label: 'Sous-titre', path: p('subtitle'), help: 'HTML court autorisé : <sup>, <em>, <span>.' }),
        scope.json({ label: 'Lignes (lines)', path: p('lines'), rows: 5, validate: validators.array, help: '[{ "at": 2800, "text": "…", "emphasis": true }] — at relatif au carton.' }),
        scope.number({ label: 'Points de suspension (dots)', path: p('dots'), integer: true, min: 0 }),
        scope.select({ label: 'Ornement', path: p('ornament'), options: ['none', 'middle', 'both'] }),
        ms('Disparition (until, ms absolu)', 'until'),
        ms('Fondu de sortie (out, ms)', 'out'))];
      break;
    case 'caption':
      specific = [section('Légende',
        scope.text({ label: 'Surtitre (kicker)', path: p('kicker') }),
        scope.text({ label: 'Titre', path: p('title') }),
        scope.text({ label: 'Texte', path: p('text'), multiline: true, rows: 2 }),
        ms('Durée (ms)', 'duration'))];
      break;
    case 'music':
      specific = [section('Musique',
        scope.asset({ label: 'Piste (src)', path: p('src'), kind: 'audio', help: 'Vide : ne change que le volume de la piste en cours.' }),
        scope.number({ label: 'Volume (0 à 1)', path: p('volume'), step: 0.05, min: 0, max: 1 }),
        ms('Fondu (fade, ms)', 'fade'),
        scope.check({ label: 'En boucle (loop)', path: p('loop'), keepFalse: true }))];
      break;
    case 'rain':
      specific = [section('Pluie',
        scope.number({ label: 'Pluie visible (level)', path: p('level'), step: 0.05, min: 0, max: 1 }),
        scope.number({ label: 'Volume du bruit (sound)', path: p('sound'), step: 0.01, min: 0, max: 1 }))];
      break;
    case 'ambience':
      specific = [section('Ambiance sonore',
        scope.select({ label: 'Type (kind)', path: p('kind'), optional: false, options: [['wind', 'wind — vent']] }),
        scope.number({ label: 'Niveau', path: p('level'), step: 0.05, min: 0, max: 1 }))];
      break;
    case 'fadeLayers':
      specific = [section('Fondu des calques', ms('Durée (ms)', 'duration'))];
      break;
    case 'logo':
      specific = [section('Logo',
        scope.asset({ label: 'Image (src)', path: p('src'), kind: 'image' }),
        scope.text({ label: 'Texte alternatif (alt)', path: p('alt'), help: 'Lu par les lecteurs d’écran.' }),
        ms('Durée (ms)', 'duration'))];
      break;
    case 'fx':
      specific = [section('Effet',
        scope.select({ label: 'Nom', path: p('name'), optional: false, options: [['leak', 'leak — fuite de lumière']] }),
        scope.check({ label: 'Activé (on)', path: p('on'), keepFalse: true }))];
      break;
    case 'clockTicks':
      specific = [section('Tic-tac',
        scope.json({ label: 'Changer d’image aux tics (advanceAt)', path: p('advanceAt'), rows: 2, validate: validators.numberList, help: 'Numéros de tic où l’image suivante de frames apparaît.' }))];
      break;
    case 'end':
      specific = [section('Fin',
        ms('Fondu de sortie (fadeOut, ms)', 'fadeOut'),
        scope.check({ label: 'Garder la musique (keepMusic)', path: p('keepMusic'), help: 'La musique continue dans la scène suivante.' }))];
      break;
    case 'clear':
      specific = [h('p', { class: 'help' }, 'Efface tous les plans et cartons affichés.')];
      break;
    case 'marker':
      specific = [h('p', { class: 'help' }, 'Repère : quand « passer » est en mode marker, un clic saute au prochain repère.')];
      break;
    default:
      specific = [h('p', { class: 'help warn' }, `Opération inconnue « ${op} » : le moteur l’ignorera.`)];
  }

  return [
    section(OPS[op]?.label || 'Élément', ...common),
    ...specific,
    collapsible('JSON complet de l’élément', op === undefined || !OPS[op],
      scope.json({ label: 'Élément', path: base, rows: 10, optional: false, validate: itemValidator })),
  ];
}
