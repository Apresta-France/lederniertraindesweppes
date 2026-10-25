import { h, uid } from './dom.js';
import { actionsField } from './actions.js';
import { createAssetField } from './asset-picker.js';
import { confirmDialog } from './ui.js';

const UI_SFX = ['soft', 'click', 'ding'];

const MODES = [
  ['none', 'Ne rien faire'],
  ['examine', 'Dire un texte'],
  ['say', 'Dire un texte, sans le son doux'],
  ['sound', 'Jouer un son'],
  ['say-sound', 'Dire un texte et jouer un son'],
  ['voice', 'Jouer une voix'],
  ['dialogue', 'Parler : menu de sujets'],
  ['custom', 'Actions personnalisées'],
];

const MODE_HELP = {
  none: 'Le clic ne dit rien et ne joue rien.',
  examine: 'Le clic dit ce texte, précédé d’un petit son doux.',
  say: 'Le clic affiche ce texte, sans son automatique.',
  sound: 'Le clic joue le son choisi. Un fichier peut avoir une légende.',
  'say-sound': 'Le clic joue le son, puis dit le texte.',
  voice: 'Le clic joue le fichier. La légende s’affiche pendant la réplique.',
  dialogue: 'Le clic ouvre le menu des sujets à aborder : questions, réponses, puis déblocages. Les échanges se règlent dans l’onglet Dialogues.',
  custom: 'Chaque action se règle dans la liste. Le menu en ajoute une.',
};

function listOf(object) {
  return Array.isArray(object?.onUse) ? object.onUse : null;
}

function allowed(action, keys) {
  return Boolean(action) && typeof action === 'object' && Object.keys(action).every((key) => keys.includes(key));
}

function isPlainSay(action) {
  return action?.do === 'say' && !action.byState && allowed(action, ['do', 'text', 'who']) && typeof (action.text ?? '') === 'string';
}

function isBuiltinSfx(action) {
  return action?.do === 'sfx' && !action.src && UI_SFX.includes(action.name || 'soft') && allowed(action, ['do', 'name']);
}

function isFileSfx(action) {
  return action?.do === 'sfx' && typeof action.src === 'string' && allowed(action, ['do', 'src']);
}

function isVoice(action) {
  return action?.do === 'voice' && !action.pool && !action.pick && allowed(action, ['do', 'src', 'subtitle', 'character', 'wait']);
}

function isDialogue(action) {
  return action?.do === 'dialogue' && allowed(action, ['do', 'id']);
}

export function reactionKind(object) {
  const list = listOf(object);
  if (list === null) {
    if (object?.onUse) return 'custom';
    return Object.prototype.hasOwnProperty.call(object || {}, 'description') ? 'examine' : 'none';
  }
  if (list.length === 0) {
    return Object.prototype.hasOwnProperty.call(object || {}, 'description') ? 'examine' : 'none';
  }
  if (list.length === 1 && isPlainSay(list[0])) return 'say';
  if (list.length === 1 && (isBuiltinSfx(list[0]) || isFileSfx(list[0]))) return 'sound';
  if (list.length === 2 && (isBuiltinSfx(list[0]) || isFileSfx(list[0])) && isPlainSay(list[1])) return 'say-sound';
  if (list.length === 1 && isVoice(list[0])) return 'voice';
  if (list.length === 1 && isDialogue(list[0])) return 'dialogue';
  return 'custom';
}

function readText(object, kind) {
  const list = listOf(object) || [];
  if (kind === 'say') return list[0]?.text || '';
  if (kind === 'say-sound') return list[1]?.text || '';
  if (kind === 'examine' || kind === 'none') return typeof object?.description === 'string' ? object.description : '';
  return '';
}

function fileAction(object) {
  return (listOf(object) || []).find((action) => (action?.do === 'sfx' || action?.do === 'voice') && typeof action.src === 'string' && action.src);
}

function usesFile(object, kind) {
  if (kind === 'voice') return true;
  if (kind !== 'sound' && kind !== 'say-sound') return false;
  const sfx = (listOf(object) || []).find((action) => action?.do === 'sfx');
  return Boolean(sfx && typeof sfx.src === 'string');
}

function builtinName(object) {
  const sfx = (listOf(object) || []).find((action) => action?.do === 'sfx' && !sfxHasSrc(action));
  return UI_SFX.includes(sfx?.name) ? sfx.name : 'ding';
}

function sfxHasSrc(action) {
  return typeof action?.src === 'string';
}

function sayFrom(object, text) {
  const existing = (listOf(object) || []).find((action) => action?.do === 'say');
  if (existing && isPlainSay(existing)) return { ...structuredClone(existing), text };
  return { do: 'say', text };
}

function sfxFrom(object, choice) {
  if (choice === 'file') {
    const current = (listOf(object) || []).find((action) => action?.do === 'sfx' && typeof action.src === 'string');
    return { do: 'sfx', src: current?.src || '' };
  }
  return { do: 'sfx', name: choice };
}

function rememberedText(object) {
  const kind = reactionKind(object);
  return readText(object, kind) || (typeof object?.description === 'string' ? object.description : '');
}

function writeSoundEntry(scene, src, caption) {
  if (!src) return;
  if (!scene.sounds || typeof scene.sounds !== 'object' || Array.isArray(scene.sounds)) scene.sounds = {};
  if (!scene.sounds[src] || typeof scene.sounds[src] !== 'object' || Array.isArray(scene.sounds[src])) scene.sounds[src] = {};
  if (caption.trim()) scene.sounds[src].caption = caption;
  else delete scene.sounds[src].caption;
  const entry = scene.sounds[src];
  if (entry && !entry.text && !entry.caption) delete scene.sounds[src];
  if (!Object.keys(scene.sounds).length) delete scene.sounds;
}

/**
 * Friendly click behaviour for an explore object: spoken text, a sound, its caption,
 * who walks there, or the full action list when the click is already custom.
 */
export function reactionEditor(scope, index, { showWalk = false } = {}) {
  const base = ['objects', index];
  const objectNow = () => scope.value(base) || {};
  const box = h('fieldset', { class: 'field react' });
  const modeId = uid('react');
  const mode = h('select', { id: modeId },
    MODES.map(([value, label]) => h('option', { value }, label)));
  const help = h('p', { class: 'help' });
  const text = h('textarea', { rows: 3, 'aria-label': 'Texte dit au clic' });
  const textWrap = h('div', { class: 'field' }, h('label', null, 'Texte dit'), text);
  const sound = h('select', { 'aria-label': 'Son au clic' },
    h('option', { value: 'soft' }, 'Doux'),
    h('option', { value: 'click' }, 'Clic'),
    h('option', { value: 'ding' }, 'Ding'),
    h('option', { value: 'file' }, 'Un fichier audio…'));
  const soundWrap = h('div', { class: 'field' }, h('label', null, 'Son'), sound);
  const legend = h('textarea', { rows: 2, 'aria-label': 'Légende du son' });
  const legendHelp = h('p', { class: 'help' }, 'Affichée pendant le son, pour les personnes malentendantes.');
  const legendWrap = h('div', { class: 'field' }, h('label', null, 'Légende'), legend, legendHelp);
  const actions = actionsField(scope, { label: 'Actions', path: [...base, 'onUse'], rows: 8 });
  const customWrap = h('div', { hidden: true }, actions);
  const dlg = h('select', { 'aria-label': 'Dialogue ouvert au clic' });
  const dlgHelp = h('p', { class: 'help' });
  const dlgWrap = h('div', { class: 'field', hidden: true }, h('label', null, 'Dialogue'), dlg, dlgHelp);
  const walk = scope.select({
    label: 'Y emmener',
    path: [...base, 'walkTo'],
    emptyLabel: '(personne)',
    options: () => {
      const self = objectNow().id;
      return (scope.store.scene?.objects || [])
        .filter((item) => item?.id && item.id !== self && item.character)
        .map((item) => [item.id, `${item.name || item.id} (${item.id})`]);
    },
    help: 'Le personnage suit le sol jusqu’au point cliqué, sans couper le décor, puis l’action se joue. Toutes les zones qui emmènent ce personnage comptent comme un seul sol.',
  });

  let asset = null;
  const library = scope.ctx?.library;
  const fileWrap = h('div');
  if (library && scope.store.id) {
    asset = createAssetField({
      library,
      sceneId: scope.store.id,
      kind: 'audio',
      label: 'Fichier audio',
      optional: true,
      help: '',
      onChange: (path) => commitSrc(path || ''),
    });
    scope.disposers.push(() => asset.destroy());
    fileWrap.append(asset.el);
  } else {
    const manual = h('input', { type: 'text', class: 'mono', 'aria-label': 'Fichier audio', placeholder: 'assets/son.mp3' });
    manual.addEventListener('input', () => commitSrc(manual.value.trim()));
    fileWrap.append(h('div', { class: 'field' }, h('label', null, 'Fichier audio'), manual));
    asset = {
      el: fileWrap.firstElementChild,
      setValue(value) { if (document.activeElement !== manual) manual.value = value || ''; },
      setDisabled(disabled) { manual.readOnly = disabled; },
    };
  }

  box.append(
    h('legend', null, 'Au clic'),
    h('div', { class: 'field' }, h('label', { for: modeId }, 'Comportement'), mode),
    help, textWrap, soundWrap, fileWrap, legendWrap, dlgWrap, walk, customWrap,
  );

  let locking = false;
  let forceCustom = false;

  function patch(key, mutator) {
    scope.store.update((scene) => {
      const object = scene.objects?.[index];
      if (object) mutator(object, scene);
    }, { key, source: 'inspector' });
  }

  function applyMode(next, previous) {
    const object = objectNow();
    const textValue = rememberedText(object);
    const choice = usesFile(object, previous) ? 'file' : builtinName(object);
    patch(`react-mode:${index}:${Date.now()}`, (obj, scene) => {
      if (next === 'none') {
        delete obj.onUse;
        delete obj.description;
        return;
      }
      if (next === 'examine') {
        delete obj.onUse;
        obj.description = textValue;
        return;
      }
      delete obj.description;
      if (next === 'say') obj.onUse = [sayFrom(object, textValue)];
      else if (next === 'sound') obj.onUse = [sfxFrom(object, choice)];
      else if (next === 'say-sound') obj.onUse = [sfxFrom(object, choice), sayFrom(object, textValue)];
      else if (next === 'voice') {
        const src = fileAction(object)?.src || (listOf(object) || []).find((action) => action?.do === 'voice')?.src || '';
        obj.onUse = [{ do: 'voice', src }];
      } else if (next === 'dialogue') {
        const known = object.onUse?.find?.((action) => action?.do === 'dialogue')?.id;
        const first = Object.keys(scene?.dialogues || {})[0];
        obj.onUse = [{ do: 'dialogue', id: known || first || '' }];
      } else if (next === 'custom') {
        if (!Array.isArray(obj.onUse) || obj.onUse.length === 0) {
          obj.onUse = textValue ? [{ do: 'say', text: textValue }] : [];
        }
      }
    });
  }

  function commitText(value) {
    const kind = reactionKind(objectNow());
    patch(`react-text:${index}`, (obj) => {
      if (kind === 'examine') obj.description = value;
      else if (kind === 'say' && obj.onUse?.[0]) obj.onUse[0].text = value;
      else if (kind === 'say-sound' && obj.onUse?.[1]) obj.onUse[1].text = value;
    });
  }

  function commitSound(choice) {
    const object = objectNow();
    const kind = reactionKind(object);
    if (kind !== 'sound' && kind !== 'say-sound') return;
    const textValue = readText(object, kind);
    patch(`react-sound:${index}:${Date.now()}`, (obj) => {
      const sfx = sfxFrom(object, choice);
      obj.onUse = kind === 'say-sound' ? [sfx, sayFrom(object, textValue)] : [sfx];
    });
  }

  function commitSrc(path) {
    const kind = reactionKind(objectNow());
    patch(`react-src:${index}:${Date.now()}`, (obj) => {
      const action = obj.onUse?.[0];
      if (!action) return;
      if (kind === 'voice') {
        action.src = path;
        return;
      }
      if (action.do !== 'sfx') return;
      if (path) {
        delete action.name;
        action.src = path;
      } else {
        delete action.src;
        action.name = 'soft';
      }
    });
  }

  function commitLegend(value) {
    const object = objectNow();
    const kind = reactionKind(object);
    const src = fileAction(object)?.src || '';
    patch(`react-legend:${index}:${kind === 'voice' ? 'voice' : src}`, (obj, scene) => {
      if (kind === 'voice' && obj.onUse?.[0]?.do === 'voice') {
        if (value) obj.onUse[0].subtitle = value;
        else delete obj.onUse[0].subtitle;
        return;
      }
      writeSoundEntry(scene, src, value);
    });
  }

  mode.addEventListener('change', async () => {
    const next = mode.value;
    const previous = reactionKind(objectNow());
    const wasCustom = forceCustom || previous === 'custom';
    if (next === 'custom' && wasCustom) return;
    if (next !== 'custom' && previous === next && !forceCustom) return;
    locking = true;
    try {
      if (next !== 'custom' && wasCustom) {
        const ok = await confirmDialog('Remplacer les actions personnalisées par ce comportement ?', {
          title: 'Au clic',
          confirmLabel: 'Remplacer',
          danger: true,
        });
        if (!ok) return;
      }
      forceCustom = next === 'custom';
      applyMode(next, previous);
    } finally {
      locking = false;
      sync();
    }
  });
  text.addEventListener('input', () => commitText(text.value));
  sound.addEventListener('change', () => commitSound(sound.value));
  legend.addEventListener('input', () => commitLegend(legend.value));
  dlg.addEventListener('change', () => {
    patch(`react-dlg:${index}:${Date.now()}`, (obj) => {
      if (obj.onUse?.[0]?.do === 'dialogue') obj.onUse[0].id = dlg.value;
    });
  });

  function readLegend(object, kind) {
    const voice = (listOf(object) || [])[0];
    if (kind === 'voice') {
      if (typeof voice?.subtitle === 'string' && voice.subtitle) return voice.subtitle;
      const src = voice?.src;
      return src ? (scope.store.scene?.sounds?.[src]?.caption || '') : '';
    }
    const src = fileAction(object)?.src;
    return src ? (scope.store.scene?.sounds?.[src]?.caption || '') : '';
  }

  function sync() {
    if (locking) return;
    const object = objectNow();
    const kind = forceCustom ? 'custom' : reactionKind(object);
    const file = usesFile(object, kind);
    const disabled = scope.readOnly;
    mode.value = kind;
    help.textContent = MODE_HELP[kind];
    textWrap.hidden = !['examine', 'say', 'say-sound'].includes(kind);
    soundWrap.hidden = !['sound', 'say-sound'].includes(kind);
    fileWrap.hidden = !file;
    legendWrap.hidden = !file;
    customWrap.hidden = kind !== 'custom';
    walk.hidden = !showWalk && !object.walkTo;
    dlgWrap.hidden = kind !== 'dialogue';
    if (kind === 'dialogue') {
      const ids = Object.keys(scope.store.scene?.dialogues || {});
      const current = (listOf(object) || [])[0]?.id || '';
      const known = current === '' || ids.includes(current);
      dlg.replaceChildren(
        h('option', { value: '' }, ids.length ? '(à choisir)' : '(aucun dialogue dans la scène)'),
        ...ids.map((id) => h('option', { value: id }, id)),
        known ? null : h('option', { value: current }, `${current} (inconnu)`),
      );
      dlg.value = current;
      dlgHelp.textContent = ids.length
        ? 'Sujets et répliques : onglet Dialogues.'
        : 'Créez d’abord un dialogue dans l’onglet Dialogues.';
      dlg.disabled = disabled || !ids.length;
    }
    if (document.activeElement !== text) text.value = readText(object, kind);
    if (document.activeElement !== legend) legend.value = readLegend(object, kind);
    if (document.activeElement !== sound) sound.value = file && kind !== 'voice' ? 'file' : builtinName(object);
    const src = kind === 'voice' ? ((listOf(object) || [])[0]?.src || '') : (fileAction(object)?.src || '');
    asset.setValue(src);
    mode.disabled = disabled;
    text.readOnly = disabled;
    sound.disabled = disabled;
    legend.readOnly = disabled || !src;
    asset.setDisabled(disabled);
    legend.placeholder = src ? '' : 'Choisissez d’abord un fichier audio.';
  }

  scope.watch(sync);
  return box;
}
