import { h } from './dom.js';
import { collapsible, section } from './fields.js';
import { actionsField } from './actions.js';
import { validators } from './json-field.js';

function objectValidator(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Un objet { … } est attendu.';
  if (typeof value.id !== 'string') return 'Le champ « id » (texte) est obligatoire.';
  if (typeof value.name !== 'string') return 'Le champ « name » (texte) est obligatoire.';
  if (!Array.isArray(value.rect) || value.rect.length !== 4) return 'Le champ « rect » [x, y, l, h] est obligatoire.';
  return null;
}

function decorValidator(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Un objet { … } est attendu.';
  if (!['shape', 'shadow', 'vignette'].includes(value.type)) return 'Le champ « type » doit valoir shape, shadow ou vignette.';
  return null;
}

export function renderExploreNone(scope) {
  const scene = scope.store.scene;
  const objects = Array.isArray(scene.objects) ? scene.objects.length : 0;
  const decor = Array.isArray(scene.decor) ? scene.decor.length : 0;
  return [
    section('Aucune sélection',
      h('p', { class: 'help' }, `${objects} objet(s), ${decor} élément(s) de décor. Cliquez sur le décor ou dans la liste des calques pour modifier un objet.`),
      h('ul', { class: 'help-list' },
        h('li', null, 'Glisser : déplacer · poignées : redimensionner (Maj : proportions)'),
        h('li', null, 'Flèches : 1 px · Maj + flèches : 10 px'),
        h('li', null, 'Suppr : supprimer · Ctrl+D : dupliquer · Échap : désélectionner'),
        h('li', null, 'Cliquer de nouveau au même endroit sélectionne l’objet situé dessous'))),
  ];
}

export function renderObjectInspector(scope, index) {
  const base = ['objects', index];
  const p = (...keys) => [...base, ...keys];
  const ctx = scope.ctx;

  const duplicateWarning = h('p', { class: 'field-error', hidden: true });
  scope.watch(() => {
    const id = scope.value(p('id'));
    const count = (scope.store.scene.objects || []).filter((o) => o?.id === id).length;
    duplicateWarning.hidden = !(id && count > 1);
    duplicateWarning.textContent = `L’identifiant « ${id} » est utilisé par ${count} objets.`;
  });

  return [
    section('Objet',
      scope.text({ label: 'Identifiant (id)', path: p('id'), optional: false, mono: true, help: 'Utilisé par les actions (setState, hide…). Lettres, chiffres, tirets.' }),
      duplicateWarning,
      scope.text({ label: 'Nom', path: p('name'), optional: false, help: 'Affiché au survol et lu par les lecteurs d’écran.' }),
      scope.tuple({ label: 'Rectangle (pixels de référence)', path: p('rect'), labels: ['X', 'Y', 'Largeur', 'Hauteur'] }),
      scope.asset({ label: 'Calque (sprite)', path: p('sprite'), kind: 'image', help: 'Image détourée. Sans calque : zone cliquable invisible.' }),
      scope.select({ label: 'Zone de clic (hit)', path: p('hit'), options: [['alpha', 'alpha — au pixel près'], ['rect', 'rect — tout le rectangle']], emptyLabel: '(défaut : alpha si calque)' }),
      scope.select({ label: 'Personnage animé', path: p('character'), options: () => ctx.characters(), emptyLabel: '(aucun)', help: 'Affiché à la place du calque (shared/characters/…).' }),
      scope.tuple({ label: 'Position de la bulle « parle »', path: p('bubble'), labels: ['X', 'Y'], optional: true }),
      scope.check({ label: 'Masqué au départ (hidden)', path: p('hidden') }),
      scope.text({ label: 'Description', path: p('description'), multiline: true, rows: 3, help: 'Texte dit à l’examen quand l’objet n’a pas d’action au clic.' })),
    section('États',
      scope.text({ label: 'État initial (state)', path: p('state'), mono: true }),
      scope.json({
        label: 'États (states)',
        path: p('states'),
        rows: 5,
        validate: validators.object,
        help: '{ "nom": { "sprite": "assets/….png", "sound": { "src": "…", "loop": false, "onEnded": [ … ] } } }',
      })),
    section('Action au clic (onUse)',
      actionsField(scope, { label: 'Actions', path: p('onUse'), rows: 8 })),
    collapsible('JSON complet de l’objet', false,
      scope.json({ label: 'Objet', path: base, rows: 12, optional: false, validate: objectValidator })),
  ];
}

export function renderDecorInspector(scope, index) {
  const base = ['decor', index];
  const p = (...keys) => [...base, ...keys];
  const item = scope.value(base) || {};
  const usesCenter = !Array.isArray(item.rect) && (item.type === 'shadow' || Array.isArray(item.center));

  return [
    section('Élément de décor',
      scope.text({ label: 'Identifiant (id)', path: p('id'), mono: true }),
      scope.select({ label: 'Type', path: p('type'), optional: false, options: [['shape', 'shape — forme / lumière'], ['shadow', 'shadow — ombre'], ['vignette', 'vignette — assombrissement']] }),
      scope.select({ label: 'Couche', path: p('layer'), options: [['below', 'below — sous les objets'], ['above', 'above — par-dessus']] }),
      usesCenter
        ? [
          scope.tuple({ label: 'Centre', path: p('center'), labels: ['X', 'Y'], integer: false, step: 1 }),
          scope.tuple({ label: 'Rayons', path: p('radius'), labels: ['Demi-largeur', 'Demi-hauteur'], integer: false, step: 1 }),
        ]
        : scope.tuple({ label: 'Rectangle', path: p('rect'), labels: ['X', 'Y', 'Largeur', 'Hauteur'], optional: true, help: 'Vide : toute la scène.' }),
      scope.number({ label: 'Opacité', path: p('opacity'), step: 0.05, min: 0, max: 1 }),
      scope.number({ label: 'Rotation (degrés)', path: p('rotate'), step: 1 }),
      scope.text({ label: 'Fond CSS (background)', path: p('background'), multiline: true, rows: 3, mono: true }),
      usesCenter ? null : scope.text({ label: 'Arrondi CSS (radius)', path: p('radius'), mono: true, placeholder: '50%' }),
      scope.select({ label: 'Fusion (blend)', path: p('blend'), options: ['normal', 'screen', 'multiply', 'overlay', 'lighten'] }),
      scope.select({ label: 'Animation', path: p('animation'), options: ['flicker', 'pulse', 'tv-flicker'], emptyLabel: '(aucune)' }),
      scope.select({ label: 'Préréglage', path: p('preset'), options: [['crt', 'crt — lignes d’écran'], ['crt-on', 'crt-on — éclair d’allumage']], emptyLabel: '(aucun)' }),
      scope.json({ label: 'Condition d’affichage (when)', path: p('when'), rows: 2, validate: validators.object, help: 'Ex. { "state": "tv", "ne": "off" }' })),
    collapsible('JSON complet', false,
      scope.json({ label: 'Élément', path: base, rows: 8, optional: false, validate: decorValidator })),
  ];
}
