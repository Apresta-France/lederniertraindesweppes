import { h, uid } from './dom.js';
import { collapsible, section } from './fields.js';
import { validators } from './json-field.js';
import { OPS, OP_NAMES, totalDuration } from './timeline-ops.js';
import { createKenBurnsPreview } from './kenburns.js';
import { formatSeconds } from './paths.js';

const SFX_NAMES = [
  ['passby', 'passby — voiture qui passe'],
  ['wipers', 'wipers — essuie-glaces'],
  ['indicator', 'indicator — clignotant'],
  ['doorOpen', 'doorOpen — portière qui s’ouvre'],
  ['doorClose', 'doorClose — portière qui claque'],
  ['footsteps', 'footsteps — course sur sol mouillé, qui s’éloigne'],
  ['thunder', 'thunder — tonnerre'],
  ['rumble', 'rumble — grondement'],
];

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
          scope.select({ label: 'Transition (transition)', path: p('transition'), optional: true, options: [['fade', 'fondu'], ['whip-left', 'filé vers la gauche'], ['whip-right', 'filé vers la droite']], help: 'Le filé dure le temps du fondu (300 à 400 ms conseillés).' }),
          scope.tuple({ label: 'Cadre de début (from)', path: p('from'), labels: ['Échelle', 'X %', 'Y %'], integer: false, step: 0.01 }),
          scope.tuple({ label: 'Cadre de fin (to)', path: p('to'), labels: ['Échelle', 'X %', 'Y %'], integer: false, step: 0.01 }),
          h('datalist', { id: easeList }, EASES.map((e) => h('option', { value: e }))),
          scope.text({ label: 'Courbe (ease)', path: p('ease'), list: easeList, mono: true, placeholder: 'cubic-bezier(.3,.1,.4,1)' }),
          scope.tuple({ label: 'Roulis (roll, degrés)', path: p('roll'), labels: ['Début', 'Fin'], integer: false, step: 0.1, optional: true, help: 'Inclinaison de la caméra. Prévoir une échelle d’au moins 1 + 0,03 × degré.' }),
          scope.number({ label: 'Caméra embarquée (drive, px)', path: p('drive'), step: 0.1, min: 0, help: 'Trépidation de la route, pour les plans dans la voiture.' }),
          createKenBurnsPreview(scope, base)),
        section('Ambiance',
          scope.check({ label: 'Plan sombre (dark)', path: p('dark') }),
          scope.number({ label: 'Secousse (shake, px)', path: p('shake'), step: 1, min: 0 }),
          scope.number({ label: 'Pluie pendant le plan (rain)', path: p('rain'), step: 0.05, min: 0, max: 1 }),
          scope.json({ label: 'Éclairs (flashes)', path: p('flashes'), rows: 2, help: '[[délai ms, intensité], …]', validate: (v) => (Array.isArray(v) && v.every((f) => Array.isArray(f) && f.length === 2 && f.every((n) => typeof n === 'number')) ? null : 'Format attendu : [[900, 1], [1450, 0.5]].') }),
          sfxField(scope, p('sfx'))),
        section('Lumières',
          scope.json({ label: 'Lampadaires qui défilent (lamps)', path: p('lamps'), rows: 2, help: '{ "interval": 1860, "dir": "left", "level": 0.25, "color": "#ffc777" } ou une période en ms.' }),
          scope.json({ label: 'Lumières de la voiture (glows)', path: p('glows'), rows: 5, validate: validators.array, help: '[{ "x": 56, "y": 62, "size": 4, "color": "#ff2a1a", "opacity": [0.3, 1], "grow": 1.8, "blink": 930 }] — x, y en % de l’image.' })),
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
        scope.check({ label: 'En boucle (loop)', path: p('loop'), keepFalse: true }),
        scope.check({ label: 'Caler la frise sur la musique (sync)', path: p('sync'), help: 'L’horloge de la scène suit la piste : les coupes restent sur les temps forts même si le fichier tarde à démarrer.' }),
        ms('Démarrer la piste à (offset, ms)', 'offset', 'Instant du fichier audio où la lecture commence.'))];
      break;
    case 'voice':
      specific = [section('Réplique',
        scope.asset({ label: 'Fichier (src)', path: p('src'), kind: 'audio', optional: false }),
        scope.text({ label: 'Personnage (character)', path: p('character'), mono: true, placeholder: 'aurelie', help: 'Identifiant dans shared/characters : son nom s’affiche au-dessus du sous-titre.' }),
        scope.text({ label: 'Sous-titre', path: p('subtitle'), multiline: true, rows: 3, help: 'Affiché le temps de la réplique et lu par les lecteurs d’écran.' }))];
      break;
    case 'rain':
      specific = [section('Pluie',
        scope.number({ label: 'Pluie visible (level)', path: p('level'), step: 0.05, min: 0, max: 1 }),
        scope.number({ label: 'Volume du bruit (sound)', path: p('sound'), step: 0.01, min: 0, max: 1 }))];
      break;
    case 'ambience':
      specific = [section('Ambiance sonore',
        scope.select({ label: 'Type (kind)', path: p('kind'), optional: false, options: [['wind', 'wind — vent'], ['road', 'road — roulement sur route mouillée']] }),
        scope.number({ label: 'Niveau', path: p('level'), step: 0.05, min: 0, max: 1 }))];
      break;
    case 'sfx':
      specific = [section('Bruitage',
        scope.asset({ label: 'Fichier (src)', path: p('src'), kind: 'audio', help: 'Prioritaire sur le son synthétisé. Voitures qui passent : @shared/audio/sfx/voiture_passe_01.mp3 à 08.' }),
        scope.select({ label: 'Son synthétisé (name)', path: p('name'), options: SFX_NAMES }),
        scope.number({ label: 'Intensité (level)', path: p('level'), step: 0.05, min: 0 }),
        scope.number({ label: 'Panoramique (pan)', path: p('pan'), step: 0.1, min: -1, max: 1, help: 'passby : la voiture passe de -pan (gauche) à +pan (droite). Fichier : décalage stéréo fixe.' }),
        scope.number({ label: 'Répétitions (count)', path: p('count'), integer: true, min: 1, help: 'wipers : allers-retours. indicator : clics. footsteps : foulées.' }),
        ms('Intervalle (interval, ms)', 'interval', 'wipers : un aller-retour (1858 = 4 temps à 129 bpm). indicator : entre deux clics.'))];
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
