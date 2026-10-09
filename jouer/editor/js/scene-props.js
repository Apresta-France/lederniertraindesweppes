import { h, listen } from './dom.js';
import { FormScope, section } from './fields.js';
import { actionsField } from './actions.js';
import { validators } from './json-field.js';

function exploreSections(scope) {
  return [
    section('Décor',
      scope.tuple({ label: 'Taille de référence (size)', path: ['size'], labels: ['Largeur', 'Hauteur'], help: 'Repère de toutes les coordonnées des objets, en pixels. En général la taille de l’image de fond.' }),
      scope.asset({ label: 'Image de fond', path: ['background', 'src'], kind: 'image', optional: false }),
      scope.text({
        label: 'Description du fond (alt)',
        path: ['background', 'alt'],
        multiline: true,
        rows: 4,
        help: 'Lue par les lecteurs d’écran à l’entrée dans la scène : décrivez la pièce et la position des éléments importants (gauche, droite, premier plan…).',
      })),
    section('Musique',
      scope.asset({ label: 'Piste', path: ['music', 'src'], kind: 'audio' }),
      scope.number({ label: 'Fondu d’entrée (ms)', path: ['music', 'fade'], integer: true, min: 0, step: 100 })),
    section('Logique',
      scope.json({ label: 'Objectifs (objectives)', path: ['objectives'], rows: 4, validate: validators.object, help: '{ "id": "Libellé affiché" }' }),
      actionsField(scope, { label: 'À l’entrée (onEnter)', path: ['onEnter'], rows: 6 })),
    section('Données avancées',
      scope.json({ label: 'Décor (decor)', path: ['decor'], rows: 10, validate: validators.array, help: 'Formes, ombres et vignette. Modifiables aussi dans l’onglet Visuel (case « Afficher le décor »).' }),
      scope.json({ label: 'Fiches d’examen (panels)', path: ['panels'], rows: 14, validate: validators.object, help: '{ "id": { "kicker", "title", "image": [{ "src", "when" }], "text", "facts": [ … ], "actions": [{ "label", "style", "when", "do": [ … ] }] } }' })),
  ];
}

function cinematicSections(scope) {
  return [
    section('Enchaînement',
      scope.select({ label: 'Scène suivante (next)', path: ['next'], options: () => scope.ctx.sceneOptions(), emptyLabel: '(aucune)' })),
    section('Habillage (chrome)',
      scope.text({ label: 'Fond CSS', path: ['chrome', 'background'], mono: true, placeholder: '#05070c ou radial-gradient(…)' }),
      scope.check({ label: 'Bandes noires (letterbox)', path: ['chrome', 'letterbox'] }),
      scope.number({ label: 'Vignettage (0 à 1)', path: ['chrome', 'vignette'], step: 0.05, min: 0, max: 1 }),
      scope.check({ label: 'Préparer la couche de pluie (rainCanvas)', path: ['chrome', 'rainCanvas'] })),
    section('Passer la cinématique (skip)',
      scope.select({ label: 'Mode', path: ['skip', 'mode'], options: [['end', 'end — termine la scène'], ['marker', 'marker — saute au prochain repère'], ['none', 'none — impossible de passer']] }),
      scope.text({ label: 'Libellé', path: ['skip', 'label'], placeholder: 'Cliquer pour passer' })),
  ];
}

/** "Scène" tab: scene-level properties for both scene types. */
export class SceneProps {
  constructor({ store, container, ctx }) {
    this.store = store;
    this.container = container;
    this.ctx = ctx;
    this.scope = null;
    this.type = null;
    listen(store, 'load', () => this.rebuild());
    listen(store, 'readonly', () => this.rebuild());
    listen(store, 'change', (event) => {
      if (event.detail.source === 'history' || event.detail.source === 'json' || this.store.scene?.type !== this.type) this.rebuild();
      else this.scope?.refresh();
    });
  }

  rebuild() {
    this.scope?.dispose();
    this.scope = null;
    const scene = this.store.scene;
    this.type = scene?.type ?? null;
    if (!scene) {
      this.container.replaceChildren(h('p', { class: 'empty' }, 'Aucune scène ouverte.'));
      return;
    }
    const scope = new FormScope(this.store, this.ctx);
    const content = [
      section('Identité',
        scope.text({ label: 'Identifiant (id)', path: ['id'], readOnly: true, mono: true, help: 'Nom du dossier de la scène : non modifiable ici.' }),
        h('p', { class: 'help' }, `Type : ${scene.type === 'explore' ? 'exploration (point & click)' : 'cinématique'}`),
        scope.text({ label: 'Titre', path: ['title'], optional: false, help: 'Affiché dans le HUD et dans les sauvegardes.' }),
        scope.text({ label: 'Acte', path: ['meta', 'act'] }),
        scope.text({ label: 'Chapitre', path: ['meta', 'chapter'] }),
        scope.text({ label: 'Notes de travail', path: ['meta', 'notes'], multiline: true, rows: 3, help: 'Jamais affichées en jeu.' })),
      ...(scene.type === 'explore' ? exploreSections(scope) : cinematicSections(scope)),
    ];
    this.scope = scope;
    this.container.replaceChildren(h('div', { class: 'props-grid' }, content));
  }
}
