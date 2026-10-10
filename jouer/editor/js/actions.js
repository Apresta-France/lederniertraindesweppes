import { h } from './dom.js';
import { createJsonField, validators } from './json-field.js';
import { toast } from './ui.js';

export const ACTIONS = [
  { do: 'say', label: 'Dire un texte', help: 'text : texte affiché et lu ; ou byState (id d’objet) + texts { "état": "texte" } ; who : personnage qui parle (facultatif).', template: { do: 'say', text: '' } },
  { do: 'sfx', label: 'Bruitage', help: 'name : soft, click ou ding — ou src : fichier audio.', template: { do: 'sfx', name: 'click' } },
  { do: 'voice', label: 'Voix', help: 'character (facultatif) ; src : fichier — ou pool + pick ("random") pris dans character.json. La légende se rédige dans l’onglet Sons (subtitle sur l’action reste prioritaire).', template: { do: 'voice', character: 'gisele', src: '', subtitle: '' } },
  { do: 'animate', label: 'Animer / déplacer un personnage', help: 'object : id de l’objet ; animation : nom dans character.json (absent : arrête l’animation) ; to : [x, y] position d’arrivée du coin haut-gauche ; duration (ms) ou speed (px/s, 200 par défaut) ; flip : true pour regarder vers la gauche ; hold : garder la dernière image à la fin ; keep : continuer l’animation une fois arrivé ; wait : attendre la fin.', template: { do: 'animate', object: '', animation: '', to: [0, 0], wait: true } },
  { do: 'setState', label: 'Changer l’état d’un objet', help: 'object : id de l’objet ; state : nom de l’état.', template: { do: 'setState', object: '', state: '' } },
  { do: 'cycleState', label: 'Faire défiler les états', help: 'object : id de l’objet ; states : liste ordonnée des états parcourus à chaque clic.', template: { do: 'cycleState', object: '', states: [] } },
  { do: 'set', label: 'Définir une variable', help: 'var : nom (conseil : « scene.nom ») ; value : valeur.', template: { do: 'set', var: '', value: true } },
  { do: 'inc', label: 'Incrémenter une variable', help: 'var : nom ; by : pas (1 par défaut).', template: { do: 'inc', var: '' } },
  { do: 'take', label: 'Ramasser un objet', help: 'object : objet retiré du décor ; item : id dans items.json ajouté à l’inventaire.', template: { do: 'take', object: '', item: '' } },
  { do: 'give', label: 'Donner un objet d’inventaire', help: 'item : id dans items.json.', template: { do: 'give', item: '' } },
  { do: 'remove', label: 'Retirer de l’inventaire', help: 'item : id dans items.json.', template: { do: 'remove', item: '' } },
  { do: 'hide', label: 'Masquer un objet', help: 'object : id de l’objet.', template: { do: 'hide', object: '' } },
  { do: 'show', label: 'Afficher un objet', help: 'object : id de l’objet.', template: { do: 'show', object: '' } },
  { do: 'note', label: 'Note dans le carnet', help: 'text : note ajoutée au carnet.', template: { do: 'note', text: '' } },
  { do: 'objective', label: 'Objectif', help: 'set : objectif à afficher ; complete : objectif à cocher ; once : une seule fois.', template: { do: 'objective', set: '' } },
  { do: 'examine', label: 'Ouvrir une fiche d’examen', help: 'panel : id dans panels (onglet Scène).', template: { do: 'examine', panel: '' } },
  { do: 'panelNote', label: 'Note dans la fiche ouverte', help: 'text : message affiché dans la fiche.', template: { do: 'panelNote', text: '' } },
  { do: 'close', label: 'Fermer la fiche', help: 'aucun paramètre.', template: { do: 'close' } },
  { do: 'goto', label: 'Aller à une scène', help: 'scene : id de la scène.', template: { do: 'goto', scene: '' } },
  { do: 'wait', label: 'Attendre', help: 'ms : durée en millisecondes.', template: { do: 'wait', ms: 1000 } },
  { do: 'if', label: 'Condition', help: 'cond : condition ; then : actions si vraie ; else : actions sinon (facultatif).', template: { do: 'if', cond: { var: '', eq: true }, then: [], else: [] } },
  { do: 'menu', label: 'Retour au menu', help: 'aucun paramètre : revient au menu principal du jeu.', template: { do: 'menu' } },
];

export const ACTION_NAMES = new Set(ACTIONS.map((a) => a.do));

export const CONDITION_HELP = [
  '{ "var": "nom", "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in": valeur }',
  '{ "state": "id-objet", "eq" | "ne" | "in": "état" }',
  '{ "has": "id-inventaire" } · { "objective": "id" } · { "done": "id" }',
  '{ "all": [ … ] } · { "any": [ … ] } · { "not": { … } }',
];

export function actionsHelp() {
  return h('details', { class: 'help-details' },
    h('summary', null, 'Aide : actions et conditions'),
    h('dl', { class: 'help-list' }, ACTIONS.flatMap((a) => [h('dt', null, a.do), h('dd', null, `${a.label}. ${a.help}`)])),
    h('p', { class: 'help' }, 'Conditions (cond, when) :'),
    h('ul', { class: 'help-list mono' }, CONDITION_HELP.map((line) => h('li', null, line))));
}

/** JSON field for an action list with an "Insérer une action" menu. */
export function actionsField(scope, { label, path, rows = 8, help = '' }) {
  const field = createJsonField({
    label,
    rows,
    help,
    optional: true,
    validate: validators.actions,
    onCommit: (value) => scope.commit(path, value),
  });
  scope.watch(() => {
    field.setValue(scope.value(path));
    field.setDisabled(scope.readOnly);
  });

  const hint = h('p', { class: 'help action-hint', 'aria-live': 'polite' });
  const insert = h('select', { class: 'action-insert', 'aria-label': `Insérer une action dans « ${label} »` },
    h('option', { value: '' }, 'Insérer une action…'),
    ACTIONS.map((a) => h('option', { value: a.do }, `${a.do} — ${a.label}`)));
  insert.addEventListener('change', () => {
    const def = ACTIONS.find((a) => a.do === insert.value);
    insert.value = '';
    if (!def) return;
    if (!field.parse().ok) {
      toast('Corrigez d’abord le JSON de la liste avant d’insérer une action.', 'error');
      return;
    }
    const current = scope.value(path);
    const list = Array.isArray(current) ? structuredClone(current) : [];
    list.push(structuredClone(def.template));
    scope.commit(path, list, `insert:${Date.now()}`);
    hint.textContent = `${def.do} : ${def.help}`;
    field.textarea.focus();
  });
  scope.watch(() => {
    insert.disabled = scope.readOnly;
  });

  return h('div', { class: 'actions-field' }, field.el, h('div', { class: 'action-tools' }, insert), hint, actionsHelp());
}
