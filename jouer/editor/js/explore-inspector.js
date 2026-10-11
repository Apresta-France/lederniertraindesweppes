import { h, uid } from './dom.js';
import { collapsible, section } from './fields.js';
import { validators } from './json-field.js';
import { CURSORS, cursorUrl, isCursor } from '../../shared/cursors/cursors.js';
import { boundsOf, isPolygon, mapPoints } from './geometry.js';
import { reactionEditor } from './reaction.js';
import { showsHalo } from '../../engine/core/zones.js';

function objectValidator(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Un objet { … } est attendu.';
  if (typeof value.id !== 'string') return 'Le champ « id » (texte) est obligatoire.';
  if (typeof value.name !== 'string') return 'Le champ « name » (texte) est obligatoire.';
  if (!Array.isArray(value.rect) || value.rect.length !== 4) return 'Le champ « rect » [x, y, l, h] est obligatoire.';
  if (value.points !== undefined && !isPolygon(value.points)) return 'Le champ « points » doit être une liste d’au moins 3 points [x, y].';
  return null;
}

function stateNames(states) {
  if (!states || typeof states !== 'object' || Array.isArray(states)) return [];
  return Object.keys(states);
}

function decorValidator(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Un objet { … } est attendu.';
  if (!['shape', 'shadow', 'vignette'].includes(value.type)) return 'Le champ « type » doit valoir shape, shadow ou vignette.';
  return null;
}

function cursorField(scope, path) {
  const buttons = CURSORS.map((cursor) => h('button', {
    type: 'button',
    class: 'cursor-opt',
    role: 'radio',
    title: cursor.label,
    'aria-label': cursor.label,
    onclick: () => {
      const current = scope.value(path);
      scope.commit(path, current === cursor.id ? undefined : cursor.id);
    },
  }, h('img', { src: cursorUrl(cursor.id), alt: '' })));

  scope.watch(() => {
    const raw = scope.value(path);
    const selected = isCursor(raw) ? raw : null;
    buttons.forEach((button, index) => {
      const on = CURSORS[index].id === selected;
      button.classList.toggle('on', on);
      button.setAttribute('aria-checked', on ? 'true' : 'false');
      button.disabled = scope.readOnly;
    });
  });

  return h('fieldset', { class: 'field field-tuple' },
    h('legend', null, 'Curseur au survol'),
    h('div', { class: 'cursor-pick', role: 'radiogroup', 'aria-label': 'Curseur au survol' }, buttons),
    h('p', { class: 'help' }, 'Sans choix, le jeu le déduit de l’action : loupe pour examiner, bulle pour parler, main ouverte pour prendre, main pour agir. La flèche reste celle du décor. Dans un état, « cursor » remplace ce réglage.'));
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
        h('li', null, 'Nouvel objet : la médiathèque propose les images déjà présentes, avec une recherche, ou un téléversement.'),
        h('li', null, 'Au clic : le texte, le son et la légende sont en haut de l’inspecteur. Les actions libres restent disponibles.'),
        h('li', null, 'Zone libre : des points sur le décor, puis Entrée. Le halo au survol se coche dans l’inspecteur ; une zone de déplacement ne s’éclaire pas.'),
        h('li', null, 'Flèches : 1 px · Maj + flèches : 10 px'),
        h('li', null, 'Suppr : supprimer · Ctrl+D : dupliquer · Échap : désélectionner'),
        h('li', null, 'Cliquer de nouveau au même endroit sélectionne l’objet situé dessous'))),
  ];
}

function stateFields(scope, p) {
  const names = () => stateNames(scope.value(p('states')));
  const select = scope.select({
    label: 'État initial (state)',
    path: p('state'),
    options: () => names().map((name) => [name, name]),
    emptyLabel: '(aucun)',
    help: 'État au démarrage. Le décor affiche le calque de cet état. Les pastilles dans la colonne Calques font la même chose.',
  });
  const text = scope.text({
    label: 'État initial (state)',
    path: p('state'),
    mono: true,
    help: 'Nom de l’état de départ. Ajoutez des états ci-dessous pour les choisir dans une liste.',
  });
  scope.watch(() => {
    const has = names().length > 0;
    select.hidden = !has;
    text.hidden = has;
  });
  return [select, text];
}

function writePoints(scope, index, points, key) {
  scope.store.update((scene) => {
    const object = scene.objects?.[index];
    if (!object || !isPolygon(points)) return;
    object.points = points;
    object.rect = boundsOf(points);
  }, { key, source: 'inspector' });
}

function pointsEditor(scope, index) {
  const path = ['objects', index, 'points'];
  const list = h('div', { class: 'point-list' });

  const commitAt = (pointIndex, xInput, yInput) => {
    const current = scope.value(path);
    if (!isPolygon(current)) return;
    const x = Number(xInput.value);
    const y = Number(yInput.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const points = current.map((p) => [p[0], p[1]]);
    points[pointIndex] = [Math.round(x), Math.round(y)];
    writePoints(scope, index, points, `field:objects.${index}.points`);
  };

  const buildRow = (point, pointIndex, count) => {
    const x = h('input', { type: 'number', step: '1', value: String(point[0]), 'aria-label': `Point ${pointIndex + 1}, X` });
    const y = h('input', { type: 'number', step: '1', value: String(point[1]), 'aria-label': `Point ${pointIndex + 1}, Y` });
    const onInput = () => commitAt(pointIndex, x, y);
    x.addEventListener('input', onInput);
    y.addEventListener('input', onInput);
    const remove = h('button', {
      type: 'button',
      class: 'icon-btn',
      title: count <= 3 ? 'Un contour garde au moins 3 points' : 'Retirer ce point',
      'aria-label': `Retirer le point ${pointIndex + 1}`,
      disabled: count <= 3 || scope.readOnly,
      onclick: () => {
        const current = scope.value(path);
        if (!isPolygon(current) || current.length <= 3) return;
        writePoints(scope, index, current.filter((_, i) => i !== pointIndex), `points-del:${index}:${Date.now()}`);
      },
    }, '✕');
    return h('div', { class: 'point-row' }, h('span', { class: 'point-n' }, String(pointIndex + 1)), x, y, remove);
  };

  scope.watch(() => {
    const points = isPolygon(scope.value(path)) ? scope.value(path) : [];
    const focused = list.contains(document.activeElement);
    if (focused && list.childElementCount === points.length) {
      [...list.children].forEach((row, pointIndex) => {
        const inputs = row.querySelectorAll('input');
        inputs.forEach((input, axis) => {
          if (document.activeElement !== input) input.value = String(points[pointIndex][axis]);
        });
        const remove = row.querySelector('button');
        if (remove) remove.disabled = points.length <= 3 || scope.readOnly;
      });
      return;
    }
    list.replaceChildren(...points.map((point, pointIndex) => buildRow(point, pointIndex, points.length)));
  });

  const add = h('button', {
    type: 'button',
    class: 'btn btn-small',
    disabled: scope.readOnly,
    onclick: () => {
      const points = scope.value(path);
      if (!isPolygon(points)) return;
      const a = points[points.length - 1];
      const b = points[0];
      writePoints(scope, index, [...points.map((p) => [p[0], p[1]]), [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)]], `points-add:${index}:${Date.now()}`);
    },
  }, 'Ajouter un point');
  const back = h('button', {
    type: 'button',
    class: 'btn btn-small',
    disabled: scope.readOnly,
    title: 'Retire le contour et garde le rectangle englobant',
    onclick: () => {
      scope.store.update((scene) => {
        if (scene.objects?.[index]) delete scene.objects[index].points;
      }, { source: 'inspector' });
    },
  }, 'Revenir au rectangle');

  return h('fieldset', { class: 'field field-tuple' },
    h('legend', null, 'Contour (points)'),
    list,
    h('div', { class: 'btn-row' }, add, back),
    h('p', { class: 'help' }, 'Sommets en pixels du décor. Sur le décor : glisser un sommet, Alt+clic sur un côté pour en ajouter, Suppr pour retirer le sommet choisi. Sans calque, la case « Halo au survol » éclaire cette partie du fond. Le clic, le nom et l’action sont ceux de cet objet.'));
}

function contourFromRect(scope, index) {
  scope.store.update((scene) => {
    const object = scene.objects?.[index];
    if (!object || !Array.isArray(object.rect) || object.rect.length !== 4) return;
    const [x, y, w, hgt] = object.rect;
    object.points = [[x, y], [x + w, y], [x + w, y + hgt], [x, y + hgt]];
    object.rect = boundsOf(object.points);
  }, { source: 'inspector' });
}

export function objectProfile(object) {
  if (!object || typeof object !== 'object') return 'zone';
  if (object.character) return 'character';
  if (isPolygon(object.points)) return 'poly';
  if (object.sprite || object.states) return 'sprite';
  return 'zone';
}

function hasStates(object) {
  return stateNames(object?.states).length > 0;
}

function haloToggle(scope, index) {
  const id = uid('halo');
  const path = ['objects', index];
  const input = h('input', { id, type: 'checkbox' });
  input.addEventListener('change', () => {
    scope.commit([...path, 'halo'], input.checked, `halo:${Date.now()}`);
  });
  const field = h('div', { class: 'field field-check' },
    input,
    h('label', { for: id }, 'Halo au survol'),
    h('p', { class: 'help' }, 'Éclaire le décor dans le contour. Une zone de déplacement ne s’éclaire pas, tant que cette case n’est pas cochée.'));
  scope.watch(() => {
    const object = scope.value(path) || {};
    input.checked = showsHalo(object);
    input.disabled = scope.readOnly;
    field.hidden = Boolean(object.sprite || object.character);
  });
  return field;
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

  const object = scope.value(base) || {};
  const profile = objectProfile(object);
  const contour = isPolygon(object.points);
  const titles = { poly: 'Zone libre', zone: 'Zone', sprite: 'Calque', character: 'Personnage' };
  const leads = {
    poly: 'Le clic suit le contour. Le halo et ce qui se passe au clic se règlent sous le nom.',
    zone: 'Zone invisible. Elle peut dire un texte, jouer un son, ou y faire venir un personnage.',
    sprite: 'Image détourée. Le texte, le son et la légende se règlent au clic.',
    character: 'Personnage posé sur le décor. Le texte, le son et la légende se règlent au clic.',
  };
  const reaction = reactionEditor(scope, index, { showWalk: profile === 'poly' || profile === 'zone' });
  const halo = profile === 'poly' ? haloToggle(scope, index) : null;
  const geometry = [
    scope.tuple({
      label: contour ? 'Rectangle englobant' : 'Rectangle (pixels de référence)',
      path: p('rect'),
      labels: ['X', 'Y', 'Largeur', 'Hauteur'],
      help: contour ? 'Le modifier déplace ou étire tout le contour.' : '',
      write: contour ? (next) => {
        const current = scope.value(base);
        if (!isPolygon(current?.points) || !Array.isArray(current.rect)) return;
        writePoints(scope, index, mapPoints(current.points, current.rect, next), `field:objects.${index}.rect`);
      } : null,
    }),
    contour
      ? pointsEditor(scope, index)
      : h('div', { class: 'btn-row field' },
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          disabled: scope.readOnly,
          title: 'Les quatre coins deviennent des points à ajuster',
          onclick: () => contourFromRect(scope, index),
        }, 'Créer un contour à partir du rectangle')),
  ];
  const sprite = scope.asset({
    label: 'Calque (sprite)',
    path: p('sprite'),
    kind: 'image',
    help: contour
      ? 'Facultatif. Sans image, la case « Halo au survol » éclaire le décor dans le contour.'
      : 'Image détourée. Sans calque, la zone est invisible.',
  });
  const hit = scope.select({
    label: 'Zone de clic (hit)',
    path: p('hit'),
    options: [['alpha', 'alpha — au pixel près'], ['rect', 'rect — tout le rectangle']],
    emptyLabel: '(défaut : alpha si calque)',
  });
  scope.watch(() => {
    hit.hidden = contour || !scope.value(p('sprite'));
  });
  const people = [
    scope.select({ label: 'Personnage animé', path: p('character'), options: () => ctx.characters(), emptyLabel: '(aucun)', help: 'Affiché à la place du calque (shared/characters/…).' }),
    scope.text({ label: 'Animation en boucle dès l’entrée (animation)', path: p('animation'), mono: true, help: 'Nom d’une animation du personnage. Pendant une réplique, les images de parole reprennent le dessus.' }),
    h('div', { class: 'btn-row field' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => ctx.openCharacters(scope.value(p('character')) || null) }, 'Éditeur de personnages…')),
    scope.tuple({ label: 'Position de la bulle « parle »', path: p('bubble'), labels: ['X', 'Y'], optional: true }),
  ];
  const states = [
    ...stateFields(scope, p),
    scope.json({
      label: 'États (states)',
      path: p('states'),
      rows: 5,
      validate: validators.object,
      help: '{ "off": { "sprite": "assets/….png" }, "on": { "sprite": "…", "cursor": "interdit" } }. Le calque affiché est celui de l’état initial.',
    }),
  ];
  const identity = [
    scope.text({ label: 'Nom', path: p('name'), optional: false, help: 'Affiché au survol et lu par les lecteurs d’écran.' }),
    scope.text({ label: 'Identifiant (id)', path: p('id'), optional: false, mono: true, help: 'Utilisé par les actions (setState, hide…). Lettres, chiffres, tirets.' }),
    duplicateWarning,
  ];
  const hidden = scope.check({ label: 'Masqué au départ (hidden)', path: p('hidden') });
  const cursor = cursorField(scope, p('cursor'));
  const full = collapsible('JSON complet de l’objet', false,
    scope.json({ label: 'Objet', path: base, rows: 12, optional: false, validate: objectValidator }));

  if (profile === 'character') {
    return [
      section(titles.character,
        h('p', { class: 'help' }, leads.character),
        ...identity,
        ...people,
        reaction,
        cursor,
        ...geometry,
        hidden),
      collapsible('Apparence', Boolean(object.sprite), sprite, hit),
      collapsible('États', hasStates(object), ...states),
      full,
    ];
  }

  if (profile === 'sprite') {
    return [
      section(titles.sprite,
        h('p', { class: 'help' }, leads.sprite),
        ...identity,
        sprite,
        reaction,
        cursor,
        ...geometry,
        hit,
        hidden),
      collapsible('Personnage', false, ...people),
      collapsible('États', hasStates(object), ...states),
      full,
    ];
  }

  return [
    section(titles[profile],
      h('p', { class: 'help' }, leads[profile]),
      ...identity,
      reaction,
      halo,
      cursor,
      ...geometry,
      hidden),
    collapsible('Apparence', Boolean(object.sprite), sprite, hit),
    collapsible('Personnage', false, ...people),
    collapsible('États', hasStates(object), ...states),
    full,
  ];
}

export function renderDecorInspector(scope, index) {
  const base = ['decor', index];
  const p = (...keys) => [...base, ...keys];
  const item = scope.value(base) || {};
  const usesCenter = !Array.isArray(item.rect) && (item.type === 'shadow' || Array.isArray(item.center));

  const kind = item.type === 'vignette' ? 'vignette' : (item.type === 'shadow' || usesCenter ? 'shadow' : 'shape');
  const identity = [
    scope.text({ label: 'Identifiant (id)', path: p('id'), mono: true }),
    scope.select({ label: 'Type', path: p('type'), optional: false, options: [['shape', 'shape — forme / lumière'], ['shadow', 'shadow — ombre'], ['vignette', 'vignette — assombrissement']] }),
  ];
  const geometry = usesCenter
    ? [
      scope.tuple({ label: 'Centre', path: p('center'), labels: ['X', 'Y'], integer: false, step: 1 }),
      scope.tuple({ label: 'Rayons', path: p('radius'), labels: ['Demi-largeur', 'Demi-hauteur'], integer: false, step: 1 }),
    ]
    : [scope.tuple({ label: 'Rectangle', path: p('rect'), labels: ['X', 'Y', 'Largeur', 'Hauteur'], optional: true, help: 'Vide : toute la scène.' })];
  const note = h('p', { class: 'help' }, 'Le décor n’est pas cliquable. Pour un endroit qui réagit au clic, ajoutez une zone ou une zone libre.');
  const full = collapsible('JSON complet', false,
    scope.json({ label: 'Élément', path: base, rows: 8, optional: false, validate: decorValidator }));
  const layer = () => scope.select({ label: 'Couche', path: p('layer'), options: [['below', 'below — sous les objets'], ['above', 'above — par-dessus']] });
  const blend = () => scope.select({ label: 'Fusion (blend)', path: p('blend'), options: ['normal', 'screen', 'multiply', 'overlay', 'lighten'] });
  const animation = () => scope.select({ label: 'Animation', path: p('animation'), options: ['flicker', 'pulse', 'tv-flicker'], emptyLabel: '(aucune)' });
  const preset = () => scope.select({ label: 'Préréglage', path: p('preset'), options: [['crt', 'crt — lignes d’écran'], ['crt-on', 'crt-on — éclair d’allumage']], emptyLabel: '(aucun)' });
  const when = () => scope.json({ label: 'Condition d’affichage (when)', path: p('when'), rows: 2, validate: validators.object, help: 'Ex. { "state": "tv", "ne": "off" }' });
  const opacity = () => scope.number({ label: 'Opacité', path: p('opacity'), step: 0.05, min: 0, max: 1 });
  const background = (help = '') => scope.text({ label: 'Fond CSS (background)', path: p('background'), multiline: true, rows: 3, mono: true, help });

  if (kind === 'shadow') {
    return [
      section('Ombre', note, ...identity, ...geometry, opacity(), scope.number({ label: 'Rotation (degrés)', path: p('rotate'), step: 1 })),
      collapsible('Autres réglages', Boolean(item.background || item.blend || item.animation || item.preset || item.when || item.layer),
        background(), layer(), blend(), animation(), preset(), when()),
      full,
    ];
  }

  if (kind === 'vignette') {
    return [
      section('Vignette',
        note,
        ...identity,
        background('Dégradé qui assombrit les bords de la scène.'),
        opacity()),
      collapsible('Autres réglages', Boolean(item.when || item.rect || item.layer || item.blend),
        ...geometry, layer(), blend(), when()),
      full,
    ];
  }

  return [
    section('Forme',
      note,
      ...identity,
      layer(),
      ...geometry,
      background(),
      opacity(),
      blend(),
      usesCenter ? null : scope.text({ label: 'Arrondi CSS (radius)', path: p('radius'), mono: true, placeholder: '50%' }),
      animation(),
      preset()),
    collapsible('Condition et rotation', Boolean(item.when || typeof item.rotate === 'number'),
      scope.number({ label: 'Rotation (degrés)', path: p('rotate'), step: 1 }),
      when()),
    full,
  ];
}
