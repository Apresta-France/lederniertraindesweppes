import { h, listen, slugify } from './dom.js';
import { FormScope, section, collapsible } from './fields.js';
import { actionsField, CONDITION_HELP } from './actions.js';
import { validators } from './json-field.js';
import { confirmDialog, openDialog } from './ui.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dlgMap = (scene) => (isObj(scene?.dialogues) ? scene.dialogues : {});
const topicsOf = (def) => (Array.isArray(def?.topics) ? def.topics : []);
const linesOf = (topic) => (Array.isArray(topic?.lines) ? topic.lines : []);

const LINE_TYPES = [
  ['voice', 'Réplique (voix)'],
  ['say', 'Texte affiché'],
  ['sfx', 'Bruitage'],
  ['wait', 'Pause'],
  ['custom', 'Action libre'],
];

const LINE_TEMPLATES = {
  voice: () => ({ do: 'voice', character: '', src: '', subtitle: '' }),
  say: () => ({ do: 'say', text: '' }),
  sfx: () => ({ do: 'sfx', src: '' }),
  wait: () => ({ do: 'wait', ms: 1000 }),
  custom: () => ({ do: 'set', var: '', value: true }),
};

function lineType(line) {
  // Une voix tirée d'une banque (pool) ou un bruitage d'interface (name) : JSON libre.
  if (line?.do === 'voice' && (line.pool || line.pick)) return 'custom';
  return LINE_TEMPLATES[line?.do] && (line.do !== 'sfx' || !line.name) ? line.do : 'custom';
}

function nextTopicId(topics, label) {
  const base = slugify(label) || 'sujet';
  const used = new Set(topics.map((t, i) => t?.id || `t${i}`));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Emplacements « character » de la scène (pour « À qui l'on parle »).
function characterObjects(scene) {
  return (Array.isArray(scene?.objects) ? scene.objects : [])
    .filter((o) => o?.id && o.character)
    .map((o) => [o.id, `${o.name || o.id} (${o.character})`]);
}

/**
 * Onglet « Dialogues » : conversations à choix d'une scène explore.
 * Rail = liste des dialogues ; panneau = interlocuteur, sujets, répliques et déblocages.
 */
export class DialoguesTab {
  constructor({ store, container, ctx }) {
    this.store = store;
    this.container = container;
    this.ctx = ctx;
    this.selected = null;
    this.scope = null;
    this.signature = '';
    this.openTopic = null;
    listen(store, 'load', () => {
      this.selected = null;
      this.openTopic = null;
      this.scope?.dispose();
      this.scope = null;
      this.signature = '';
      this.render();
    });
    listen(store, 'readonly', () => this.render());
    listen(store, 'change', (event) => this.onChange(event));
    this.render();
  }

  onChange() {
    const scene = this.store.scene;
    if (!scene || scene.type !== 'explore') {
      this.signature = '';
      this.render();
      return;
    }
    if (this.selected && !dlgMap(scene)[this.selected]) this.selected = null;
    const signature = this.structSignature();
    if (signature === this.signature && this.scope) {
      this.scope.refresh();
      this.renderRail();
      return;
    }
    this.render();
  }

  // Ce qui demande une reconstruction du panneau : sujets (ordre, nombre, repères)
  // et types de répliques. Le texte tapé est resynchronisé en place par le scope.
  structSignature() {
    const scene = this.store.scene;
    const map = dlgMap(scene);
    const def = map[this.selected];
    return JSON.stringify([
      scene?.type,
      Object.keys(map),
      this.selected,
      topicsOf(def).map((t, i) => [t?.id || `t${i}`, linesOf(t).map((l) => l?.do)]),
    ]);
  }

  render() {
    this.scope?.dispose();
    this.scope = null;
    const scene = this.store.scene;
    if (!scene) {
      this.signature = '';
      this.container.replaceChildren(h('p', { class: 'empty' }, 'Choisissez une scène dans la liste.'));
      return;
    }
    if (scene.type !== 'explore') {
      this.signature = '';
      this.container.replaceChildren(h('p', { class: 'empty' }, 'Les dialogues ne concernent que les scènes de type « explore ».'));
      return;
    }
    const map = dlgMap(scene);
    const ids = Object.keys(map);
    if (this.selected && !map[this.selected]) this.selected = null;
    if (!this.selected) this.selected = ids[0] ?? null;
    this.signature = this.structSignature();

    this.railList = h('div', { class: 'sound-tabs', role: 'tablist', 'aria-label': 'Dialogues de la scène', 'aria-orientation': 'vertical' });
    this.railList.addEventListener('keydown', (e) => this.onRailKey(e));
    this.pane = h('div', { class: 'sound-pane' });
    const add = h('button', {
      type: 'button',
      class: 'btn btn-small dlg-add',
      disabled: this.store.readOnly,
      onclick: () => this.createDialogue(),
    }, 'Nouveau dialogue');
    this.container.replaceChildren(h('div', { class: 'sounds' },
      h('div', { class: 'sound-rail' },
        h('div', { class: 'sound-rail-head' }, add),
        this.railList),
      this.pane));
    this.renderRail();
    this.renderPane();
  }

  renderRail() {
    if (!this.railList) return;
    const scene = this.store.scene;
    const map = dlgMap(scene);
    const ids = Object.keys(map);
    this.railList.replaceChildren(...(ids.length ? ids.map((id) => {
      const d = map[id];
      const n = topicsOf(d).length;
      return h('button', {
        type: 'button',
        role: 'tab',
        class: 'sound-tab',
        'aria-selected': String(id === this.selected),
        tabindex: id === this.selected ? '0' : '-1',
        dataset: { id },
        onclick: () => {
          if (this.selected === id) return;
          this.selected = id;
          this.openTopic = null;
          this.render();
        },
      },
        h('span', { class: 'sound-tab-name' }, d?.title || id),
        h('span', { class: 'sound-tab-meta' }, `${id} · ${n} sujet${n > 1 ? 's' : ''}`));
    }) : [h('p', { class: 'empty' }, 'Aucun dialogue. Créez-en un pour qu’un personnage propose un menu de questions.')]));
  }

  onRailKey(e) {
    const tabs = [...this.railList.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step == null) return;
    e.preventDefault();
    const next = tabs[(i + step + tabs.length) % tabs.length];
    this.selected = next.dataset.id;
    this.openTopic = null;
    this.render();
    this.railList.querySelector(`[data-id="${CSS.escape(this.selected)}"]`)?.focus();
  }

  renderPane() {
    const id = this.selected;
    const map = dlgMap(this.store.scene);
    const def = map[id];
    if (!def) {
      this.pane.replaceChildren(h('p', { class: 'empty' },
        'Un dialogue se déclenche sur un objet : inspecteur de l’objet → « Au clic » → « Parler : menu de sujets ».'));
      return;
    }
    const scope = this.scope = new FormScope(this.store, this.ctx);
    const base = ['dialogues', id];
    const topics = topicsOf(def);

    const head = h('div', { class: 'dlg-head' },
      h('div', null,
        h('h2', { class: 'sound-title' }, def.title || id),
        h('p', { class: 'mono sound-path' }, `dialogues.${id}`)),
      h('button', {
        type: 'button',
        class: 'btn btn-small btn-danger',
        disabled: this.store.readOnly,
        onclick: () => this.removeDialogue(id),
      }, 'Supprimer'));

    const usedBy = this.usesOf(id);

    this.pane.replaceChildren(
      head,
      section('Présentation',
        scope.select({
          label: 'Interlocuteur (character)',
          path: [...base, 'character'],
          options: () => this.ctx.characters(),
          emptyLabel: '(aucun)',
          help: 'Son nom s’affiche en tête du menu. Les répliques sans « to » s’adressent à lui quand elles viennent de l’autre partie.',
        }),
        scope.text({ label: 'Titre du menu', path: [...base, 'title'], placeholder: 'Nom du personnage si vide' }),
        scope.text({ label: 'Consigne (prompt)', path: [...base, 'prompt'], placeholder: 'Que veux-tu lui demander ?', help: 'Affichée au-dessus des sujets.' }),
        scope.text({ label: 'Choix « partir » (bye)', path: [...base, 'bye'], placeholder: 'C’est tout pour le moment.' }),
        scope.select({
          label: 'Personnage joué (player)',
          path: [...base, 'player'],
          options: () => characterObjects(this.store.scene),
          emptyLabel: '(déduit : celui qui marche)',
          help: 'Sert à placer la bulle quand l’interlocuteur répond. Laisser vide en général.',
        }),
        h('p', { class: 'help' }, usedBy
          ? `Ouvert par : ${usedBy.join(', ')}.`
          : 'Pas encore ouvert par un objet : dans l’inspecteur de l’objet, « Au clic » → « Parler : menu de sujets ».')),
      section('Sujets',
        h('p', { class: 'help' },
          'Le menu les propose dans l’ordre. Un sujet peut n’apparaître que si une condition est vraie, disparaître une fois posé, ou clore la conversation. Le jeu retient les sujets abordés : variable dlg.', this.store.id, '.', id, '.<repère>.'),
        ...(topics.length ? topics.map((t, i) => this.topicCard(scope, base, t, i, topics.length)) : [h('p', { class: 'empty' }, 'Aucun sujet : le dialogue se fermera tout de suite (ou jouera « Plus rien à demander »).')]),
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          disabled: this.store.readOnly,
          onclick: () => this.addTopic(base),
        }, 'Ajouter un sujet')),
      collapsible('Fin du dialogue', Boolean(def.empty?.length || def.onLeave?.length),
        actionsField(scope, { label: 'Plus rien à demander (empty)', path: [...base, 'empty'], rows: 3, help: 'Joué quand tous les sujets « une seule fois » sont épuisés ou cachés par leurs conditions.' }),
        actionsField(scope, { label: 'En partant (onLeave)', path: [...base, 'onLeave'], rows: 3, help: 'Joué quand le joueur choisit de partir (réplique d’adieux, variable…).' })),
    );
    if (this.store.readOnly) this.pane.prepend(h('p', { class: 'readonly-note' }, 'Lecture seule.'));
  }

  usesOf(id) {
    const names = [];
    const scan = (list, label) => {
      if (!Array.isArray(list)) return;
      for (const a of list) {
        if (!isObj(a)) continue;
        if (a.do === 'dialogue' && a.id === id && !names.includes(label)) names.push(label);
        scan(a.then, label);
        scan(a.else, label);
      }
    };
    (Array.isArray(this.store.scene?.objects) ? this.store.scene.objects : [])
      .forEach((o) => isObj(o) && scan(o.onUse, o.name || o.id));
    scan(this.store.scene?.onEnter, 'à l’entrée');
    for (const [pid, panel] of Object.entries(isObj(this.store.scene?.panels) ? this.store.scene.panels : {})) {
      (Array.isArray(panel?.actions) ? panel.actions : []).forEach((a) => scan(a?.do, `fiche « ${pid} »`));
    }
    return names;
  }

  topicCard(scope, dlgBase, topic, index, count) {
    const tb = [...dlgBase, 'topics', index];
    const label = topic?.label || `Sujet ${index + 1}`;
    const card = h('details', {
      class: 'dlg-topic',
      open: this.openTopic === index || (this.openTopic == null && count === 1),
    },
      h('summary', null,
        h('span', { class: 'dlg-topic-title' }, `${index + 1}. ${label}`),
        topic?.once ? h('span', { class: 'chip' }, '1×') : null,
        topic?.end ? h('span', { class: 'chip' }, 'fin') : null,
        topic?.when ? h('span', { class: 'chip' }, 'si…') : null),
      h('div', { class: 'btn-row dlg-topic-tools' },
        this.tool('↑', 'Monter', index === 0, () => this.moveTopic(dlgBase, index, -1)),
        this.tool('↓', 'Descendre', index === count - 1, () => this.moveTopic(dlgBase, index, 1)),
        this.tool('⧉', 'Dupliquer', false, () => this.duplicateTopic(dlgBase, index)),
        this.tool('✕', 'Supprimer ce sujet', false, () => this.removeTopic(dlgBase, index))),
      scope.text({ label: 'Question / réponse affichée', path: [...tb, 'label'], optional: false, help: 'Le texte du choix dans le menu.' }),
      scope.text({ label: 'Repère (id)', path: [...tb, 'id'], mono: true, placeholder: `t${index}`, help: 'Garde la mémoire du sujet : le jeu pose dlg.<scène>.<dialogue>.<id> = vrai une fois choisi. Testable dans les conditions.' }),
      h('div', { class: 'field field-inline' },
        scope.check({ label: 'Une seule fois (once)', path: [...tb, 'once'], help: 'Disparaît du menu une fois choisi.' }),
        scope.check({ label: 'Termine le dialogue (end)', path: [...tb, 'end'], help: 'Referme la conversation après l’échange.' })),
      scope.json({ label: 'Visible si (when)', path: [...tb, 'when'], rows: 2, validate: validators.object, help: `Condition d’apparition, ex. { "var": "dlg.${this.store.id}.${dlgBase[1]}.autre" }. ${CONDITION_HELP[0]}` }),
      this.linesEditor(scope, tb),
      actionsField(scope, { label: 'Ensuite (then)', path: [...tb, 'then'], rows: 5, help: 'Après l’échange : note (indice du carnet), person, memory, set (débloque d’autres sujets), objective, goto…' }));
    card.addEventListener('toggle', () => {
      if (card.open) this.openTopic = index;
      else if (this.openTopic === index) this.openTopic = null;
    });
    return card;
  }

  tool(text, title, disabled, onclick) {
    return h('button', {
      type: 'button',
      class: 'icon-btn',
      title,
      'aria-label': title,
      disabled: disabled || this.store.readOnly,
      onclick,
    }, text);
  }

  // Liste des répliques d'un sujet : voix (personnage, son, sous-titre), texte, bruitage, pause, action libre.
  linesEditor(scope, topicBase) {
    const linesPath = [...topicBase, 'lines'];
    const topic = () => scope.value(topicBase) || {};
    const patchLines = (key, mutator) => {
      this.store.update((scene) => {
        const dlg = scene.dialogues?.[topicBase[1]];
        const t = dlg?.topics?.[topicBase[3]];
        if (t) mutator(t);
      }, { key, source: 'inspector' });
    };

    const rows = h('div', { class: 'dlg-lines' });
    const wrap = h('fieldset', { class: 'field field-tuple dlg-lines-field' },
      h('legend', null, 'Répliques (lines)'),
      rows,
      h('div', { class: 'btn-row' },
        h('button', {
          type: 'button',
          class: 'btn btn-small',
          disabled: this.store.readOnly,
          onclick: () => patchLines(`line-add:${Date.now()}`, (t) => {
            t.lines = linesOf(t);
            t.lines.push(LINE_TEMPLATES.voice());
          }),
        }, 'Ajouter une réplique')),
      h('p', { class: 'help' }, 'Jouées l’une après l’autre. « À qui » vide = l’autre partie. Bruitage et pause servent au rythme de l’échange.'));

    const sync = () => {
      const list = linesOf(topic());
      const sig = list.map((l) => l?.do).join('|');
      if (sig === rows.dataset.sig && rows.childElementCount === list.length) return;
      rows.dataset.sig = sig;
      rows.replaceChildren(...list.map((line, j) => this.lineRow(scope, linesPath, line, j, list.length, patchLines)));
    };
    scope.watch(sync);
    return wrap;
  }

  lineRow(scope, linesPath, line, j, count, patchLines) {
    const lb = [...linesPath, j];
    const type = lineType(line);
    const typeSelect = h('select', { 'aria-label': `Type de la réplique ${j + 1}` },
      LINE_TYPES.map(([v, label]) => h('option', { value: v }, label)));
    typeSelect.value = type;
    typeSelect.addEventListener('change', () => patchLines(`line-type:${j}:${Date.now()}`, (t) => {
      if (Array.isArray(t.lines) && t.lines[j]) t.lines[j] = LINE_TEMPLATES[typeSelect.value]();
    }));

    let fields = null;
    if (type === 'voice') {
      fields = [
        h('div', { class: 'dlg-line-grid' },
          scope.select({
            label: 'Qui parle (character)',
            path: [...lb, 'character'],
            options: () => this.ctx.characters(),
            emptyLabel: '(narration)',
          }),
          scope.select({
            label: 'À qui (to)',
            path: [...lb, 'to'],
            options: () => characterObjects(this.store.scene),
            emptyLabel: '(l’autre partie)',
          })),
        scope.asset({ label: 'Fichier audio (src)', path: [...lb, 'src'], kind: 'audio', help: 'Vide : la réplique n’affiche que son sous-titre, pendant sa durée de lecture.' }),
        scope.text({ label: 'Sous-titre', path: [...lb, 'subtitle'], multiline: true, rows: 2, help: 'Affiché pendant la réplique. Sinon la légende du fichier (onglet Sons) est utilisée.' }),
      ];
    } else if (type === 'say') {
      fields = [
        h('div', { class: 'dlg-line-grid' },
          scope.text({ label: 'Qui parle (who)', path: [...lb, 'who'], placeholder: 'Aurélie' }),
          scope.number({ label: 'Affichage (ms)', path: [...lb, 'waitMs'], min: 0, step: 100, integer: true, placeholder: 'automatique' })),
        scope.text({ label: 'Texte', path: [...lb, 'text'], multiline: true, rows: 2 }),
      ];
    } else if (type === 'sfx') {
      fields = [scope.asset({ label: 'Fichier audio (src)', path: [...lb, 'src'], kind: 'audio' })];
    } else if (type === 'wait') {
      fields = [scope.number({ label: 'Durée (ms)', path: [...lb, 'ms'], min: 0, step: 100, integer: true, optional: false })];
    } else {
      fields = [scope.json({ label: 'Action', path: lb, rows: 4, optional: false, validate: validators.object, help: 'Une action { "do": … } du vocabulaire des scènes.' })];
    }

    return h('div', { class: 'dlg-line' },
      h('div', { class: 'dlg-line-head' },
        h('span', { class: 'dlg-line-n' }, String(j + 1)),
        typeSelect,
        h('span', { class: 'dlg-line-tools' },
          this.tool('↑', 'Monter', j === 0, () => patchLines(`line-up:${j}:${Date.now()}`, (t) => {
            if (j > 0) [t.lines[j - 1], t.lines[j]] = [t.lines[j], t.lines[j - 1]];
          })),
          this.tool('↓', 'Descendre', j === count - 1, () => patchLines(`line-down:${j}:${Date.now()}`, (t) => {
            if (j < t.lines.length - 1) [t.lines[j + 1], t.lines[j]] = [t.lines[j], t.lines[j + 1]];
          })),
          this.tool('✕', 'Supprimer la réplique', false, () => patchLines(`line-del:${j}:${Date.now()}`, (t) => {
            t.lines.splice(j, 1);
          })))),
      ...fields);
  }

  addTopic(dlgBase) {
    const index = topicsOf(dlgMap(this.store.scene)[dlgBase[1]]).length;
    this.store.update((scene) => {
      const dlg = scene.dialogues?.[dlgBase[1]];
      if (!dlg) return;
      dlg.topics = topicsOf(dlg);
      const t = { label: '…' };
      t.id = nextTopicId(dlg.topics, '');
      t.lines = [LINE_TEMPLATES.voice()];
      dlg.topics.push(t);
    }, { source: 'inspector' });
    this.openTopic = index;
  }

  moveTopic(dlgBase, index, dir) {
    this.store.update((scene) => {
      const topics = scene.dialogues?.[dlgBase[1]]?.topics;
      const j = index + dir;
      if (Array.isArray(topics) && j >= 0 && j < topics.length) [topics[index], topics[j]] = [topics[j], topics[index]];
    }, { source: 'inspector' });
    this.openTopic = index + dir;
  }

  duplicateTopic(dlgBase, index) {
    this.store.update((scene) => {
      const dlg = scene.dialogues?.[dlgBase[1]];
      const src = dlg?.topics?.[index];
      if (!src) return;
      const copy = structuredClone(src);
      copy.id = nextTopicId(dlg.topics, copy.label);
      dlg.topics.splice(index + 1, 0, copy);
    }, { source: 'inspector' });
    this.openTopic = index + 1;
  }

  async removeTopic(dlgBase, index) {
    const topic = topicsOf(dlgMap(this.store.scene)[dlgBase[1]])[index];
    const ok = await confirmDialog(`Supprimer le sujet « ${topic?.label || index + 1} » ?`, {
      title: 'Sujet',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    this.store.update((scene) => {
      const topics = scene.dialogues?.[dlgBase[1]]?.topics;
      if (Array.isArray(topics)) topics.splice(index, 1);
    }, { source: 'inspector' });
    this.openTopic = null;
  }

  async createDialogue() {
    const input = h('input', { type: 'text', class: 'mono', placeholder: 'ex. gisele', style: { width: '100%' } });
    const id = await openDialog({
      title: 'Nouveau dialogue',
      body: [
        h('div', { class: 'field' }, h('label', null, 'Identifiant'), input),
        h('p', { class: 'help' }, 'Lettres minuscules, chiffres et tirets. Il sert à ouvrir le dialogue depuis « Au clic » d’un objet.'),
      ],
      buttons: [
        { label: 'Créer', value: 'ok', kind: 'gold', submit: true },
        { label: 'Annuler', value: null },
      ],
      onSubmit: () => {
        const slug = slugify(input.value);
        if (!slug || dlgMap(this.store.scene)[slug]) input.setAttribute('aria-invalid', 'true');
        return slug && !dlgMap(this.store.scene)[slug] ? slug : undefined;
      },
      setup: () => input.focus(),
    });
    if (!id) return;
    this.store.update((scene) => {
      if (!isObj(scene.dialogues)) scene.dialogues = {};
      scene.dialogues[id] = {
        character: this.ctx.characters()[0]?.[0] || '',
        prompt: '',
        topics: [{ id: 'sujet-1', label: '…', lines: [LINE_TEMPLATES.voice()] }],
      };
    }, { source: 'inspector' });
    this.selected = id;
    this.openTopic = 0;
    this.render();
  }

  async removeDialogue(id) {
    const used = this.usesOf(id);
    const note = used.length ? ` Il est encore ouvert par : ${used.join(', ')} — ces objets ne feront plus rien.` : '';
    const ok = await confirmDialog(`Supprimer le dialogue « ${id} » et tous ses sujets ?${note}`, {
      title: 'Dialogue',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    this.store.update((scene) => {
      if (isObj(scene.dialogues)) {
        delete scene.dialogues[id];
        if (!Object.keys(scene.dialogues).length) delete scene.dialogues;
      }
    }, { source: 'inspector' });
    this.selected = null;
    this.openTopic = null;
  }
}
