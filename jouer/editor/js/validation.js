import { ACTION_NAMES } from './actions.js';
import { OPS } from './timeline-ops.js';
import { formatClock } from './paths.js';

const OBJECT_ACTIONS = new Set(['setState', 'cycleState', 'take', 'hide', 'show']);
const ITEM_ACTIONS = new Set(['take', 'give', 'remove']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Light consistency checks. `ctx`: {sceneIds:Set, assets:Set|null, items:object|null, characters:string[]}.
 * Returns [{level: 'warn'|'info', message, selection?}].
 */
export function validateScene(scene, ctx) {
  const out = [];
  const warn = (message, selection = null) => out.push({ level: 'warn', message, selection });
  const info = (message, selection = null) => out.push({ level: 'info', message, selection });
  if (!isObj(scene)) return out;

  const checkFile = (path, where, selection) => {
    if (typeof path !== 'string' || !ctx.assets) return;
    if (path === '') {
      warn(`${where} : fichier non renseigné.`, selection);
      return;
    }
    if (!/^(https?:|data:)/.test(path) && !ctx.assets.has(path)) warn(`${where} : fichier introuvable « ${path} ».`, selection);
  };
  const checkScene = (id, where, selection) => {
    if (id && !ctx.sceneIds.has(id)) warn(`${where} : scène inconnue « ${id} ».`, selection);
  };

  if (scene.type === 'explore') validateExplore(scene, ctx, { warn, info, checkFile, checkScene });
  else if (scene.type === 'cinematic') validateCinematic(scene, { warn, info, checkFile, checkScene });
  return out;
}

function validateExplore(scene, ctx, { warn, info, checkFile, checkScene }) {
  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  const panels = isObj(scene.panels) ? scene.panels : {};
  const objectives = isObj(scene.objectives) ? scene.objectives : {};
  const byId = new Map();
  const [width, height] = Array.isArray(scene.size) ? scene.size : [0, 0];

  if (!scene.background?.src) warn('Aucune image de fond.');
  else checkFile(scene.background.src, 'Fond', null);
  if (!scene.background?.alt?.trim()) warn('Le fond n’a pas de description (alt) pour les lecteurs d’écran.');
  if (scene.music?.src !== undefined) checkFile(scene.music.src, 'Musique', null);

  const seen = new Map();
  objects.forEach((object, index) => {
    if (!isObj(object)) return;
    const selection = { kind: 'object', index };
    const label = `Objet « ${object.id || `n° ${index + 1}`} »`;
    if (!object.id) warn(`Objet n° ${index + 1} sans identifiant.`, selection);
    else if (seen.has(object.id)) warn(`Identifiant en double : « ${object.id} » (objets n° ${seen.get(object.id) + 1} et ${index + 1}).`, selection);
    else seen.set(object.id, index);
    if (object.id && !byId.has(object.id)) byId.set(object.id, object);
    if (!object.name?.trim()) warn(`${label} : nom vide (il est lu par les lecteurs d’écran).`, selection);

    const rect = object.rect;
    if (!Array.isArray(rect) || rect.length !== 4 || rect.some((n) => typeof n !== 'number')) {
      warn(`${label} : rectangle invalide.`, selection);
    } else {
      if (rect[2] <= 0 || rect[3] <= 0) warn(`${label} : largeur ou hauteur nulle.`, selection);
      if (width && height && (rect[0] < 0 || rect[1] < 0 || rect[0] + rect[2] > width || rect[1] + rect[3] > height)) {
        warn(`${label} : dépasse du décor (${width} × ${height}).`, selection);
      }
    }
    if (object.sprite !== undefined) checkFile(object.sprite, `${label}, calque`, selection);
    if (object.character && !ctx.characters.includes(object.character)) warn(`${label} : personnage inconnu « ${object.character} ».`, selection);
    if (isObj(object.states)) {
      for (const [name, state] of Object.entries(object.states)) {
        if (state?.sprite !== undefined) checkFile(state.sprite, `${label}, état « ${name} »`, selection);
        if (state?.sound?.src !== undefined) checkFile(state.sound.src, `${label}, son de l’état « ${name} »`, selection);
      }
      if (object.state && !(object.state in object.states)) warn(`${label} : l’état initial « ${object.state} » n’est pas défini dans states.`, selection);
    }
  });

  const checkCondition = (cond, where, selection) => {
    if (!isObj(cond)) return;
    if (typeof cond.state === 'string' && !byId.has(cond.state)) warn(`${where} : condition sur un objet inconnu « ${cond.state} ».`, selection);
    if (typeof cond.has === 'string' && ctx.items && !(cond.has in ctx.items)) warn(`${where} : condition sur un objet d’inventaire inconnu « ${cond.has} ».`, selection);
    for (const key of ['all', 'any']) if (Array.isArray(cond[key])) cond[key].forEach((c) => checkCondition(c, where, selection));
    if (isObj(cond.not)) checkCondition(cond.not, where, selection);
  };

  const checkActions = (list, where, selection) => {
    if (!Array.isArray(list)) return;
    list.forEach((action) => {
      if (!isObj(action)) return;
      if (!ACTION_NAMES.has(action.do)) {
        warn(`${where} : action inconnue « ${action.do} ».`, selection);
        return;
      }
      if (OBJECT_ACTIONS.has(action.do) && action.object !== undefined) {
        const target = byId.get(action.object);
        if (!target) warn(`${where} : ${action.do} vise un objet inconnu « ${action.object} ».`, selection);
        else if (isObj(target.states)) {
          if (action.do === 'setState' && action.state && !(action.state in target.states)) warn(`${where} : l’état « ${action.state} » n’existe pas pour « ${action.object} ».`, selection);
          if (action.do === 'cycleState' && Array.isArray(action.states)) {
            action.states.filter((s) => !(s in target.states)).forEach((s) => warn(`${where} : l’état « ${s} » n’existe pas pour « ${action.object} ».`, selection));
          }
        }
      }
      if (action.do === 'say' && action.byState && !byId.has(action.byState)) warn(`${where} : say.byState vise un objet inconnu « ${action.byState} ».`, selection);
      if (ITEM_ACTIONS.has(action.do) && ctx.items && action.item !== undefined && !(action.item in ctx.items)) warn(`${where} : objet d’inventaire inconnu « ${action.item} » (items.json).`, selection);
      if (action.do === 'examine' && !(action.panel in panels)) warn(`${where} : fiche d’examen inconnue « ${action.panel} ».`, selection);
      if (action.do === 'goto') checkScene(action.scene, where, selection);
      if (action.do === 'objective') {
        for (const key of ['set', 'complete']) {
          if (action[key] && !(action[key] in objectives)) warn(`${where} : objectif inconnu « ${action[key]} ».`, selection);
        }
      }
      if (action.do === 'voice' && action.character && !ctx.characters.includes(action.character)) warn(`${where} : personnage inconnu « ${action.character} ».`, selection);
      if ((action.do === 'voice' || action.do === 'sfx') && typeof action.src === 'string' && !action.pool) checkFile(action.src, `${where}, son`, selection);
      if (action.do === 'if') {
        checkCondition(action.cond, where, selection);
        checkActions(action.then, where, selection);
        checkActions(action.else, where, selection);
      }
    });
  };

  checkActions(scene.onEnter, 'À l’entrée (onEnter)', null);
  objects.forEach((object, index) => {
    if (!isObj(object)) return;
    const selection = { kind: 'object', index };
    const where = `Objet « ${object.id || index + 1} »`;
    checkActions(object.onUse, where, selection);
    if (isObj(object.states)) {
      for (const [name, state] of Object.entries(object.states)) checkActions(state?.sound?.onEnded, `${where}, état « ${name} »`, selection);
    }
  });
  (Array.isArray(scene.decor) ? scene.decor : []).forEach((item, index) => {
    if (isObj(item)) checkCondition(item.when, `Décor « ${item.id || index + 1} »`, { kind: 'decor', index });
  });
  for (const [id, panel] of Object.entries(panels)) {
    if (!isObj(panel)) continue;
    const where = `Fiche « ${id} »`;
    (Array.isArray(panel.image) ? panel.image : []).forEach((image) => {
      checkFile(image?.src, `${where}, image`, null);
      checkCondition(image?.when, where, null);
    });
    (Array.isArray(panel.facts) ? panel.facts : []).forEach((fact) => checkCondition(fact?.when, where, null));
    (Array.isArray(panel.actions) ? panel.actions : []).forEach((action) => {
      checkCondition(action?.when, where, null);
      checkActions(action?.do, where, null);
    });
  }
  if (!objects.length) info('La scène ne contient encore aucun objet.');
}

function validateCinematic(scene, { warn, info, checkFile, checkScene }) {
  const timeline = Array.isArray(scene.timeline) ? scene.timeline : [];
  checkScene(scene.next, 'Scène suivante (next)', null);
  if (!scene.next) info('Aucune scène suivante (next) : le jeu s’arrêtera après cette cinématique.');
  let ends = 0;
  let markers = 0;
  timeline.forEach((item, index) => {
    if (!isObj(item)) return;
    const selection = { kind: 'item', index };
    const where = `${formatClock(item.at)} ${item.do}`;
    if (typeof item.at !== 'number' || item.at < 0) warn(`Élément n° ${index + 1} : instant « at » invalide.`, selection);
    if (!OPS[item.do]) {
      warn(`${where} : opération inconnue.`, selection);
      return;
    }
    if (item.do === 'end') ends += 1;
    if (item.do === 'marker') markers += 1;
    if (item.do === 'shot') {
      if (!item.src) warn(`${where} : plan sans image.`, selection);
      else checkFile(item.src, where, selection);
      (Array.isArray(item.frames) ? item.frames : []).forEach((frame) => checkFile(frame, `${where}, frames`, selection));
      if (!(Number(item.duration) > 0)) warn(`${where} : durée manquante.`, selection);
      if (!item.description?.trim()) info(`${where} : plan sans audiodescription (accessibilité).`, selection);
    }
    if ((item.do === 'music' || item.do === 'logo') && item.src !== undefined) checkFile(item.src, where, selection);
    if (item.do === 'logo' && !item.alt?.trim()) warn(`${where} : logo sans texte alternatif.`, selection);
    if (item.do === 'card' && typeof item.until === 'number' && item.until <= item.at) warn(`${where} : « until » doit être postérieur à « at ».`, selection);
  });
  if (!ends) warn('La cinématique n’a pas d’élément « Fin » (end).');
  if (ends > 1) warn('La cinématique contient plusieurs éléments « Fin » (end).');
  if (scene.skip?.mode === 'marker' && !markers) warn('Le mode « passer » est marker mais la frise ne contient aucun repère.');
  for (let i = 1; i < timeline.length; i += 1) {
    if (Number(timeline[i]?.at) < Number(timeline[i - 1]?.at)) {
      info('La frise n’est pas triée par instant : elle le sera au prochain déplacement d’un élément.');
      break;
    }
  }
}
