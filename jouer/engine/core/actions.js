import { test } from './conditions.js';

// Vocabulaire d'actions des scènes. Une action = { do: 'nom', ...paramètres }.
// Ajouter une action : registerAction('nom', (action, ctx) => { … }) depuis n'importe quel module.
const handlers = new Map();

export function registerAction(name, fn) {
  handlers.set(name, fn);
}

export async function runActions(list, ctx) {
  if (!Array.isArray(list)) return;
  for (const action of list) {
    if (ctx.scene?.disposed) return;
    const fn = handlers.get(action?.do);
    if (!fn) {
      console.warn(`[actions] action inconnue « ${action?.do} »`, action);
      continue;
    }
    try {
      await fn(action, ctx);
    } catch (err) {
      console.error(`[actions] « ${action.do} » a échoué`, err, action);
    }
  }
}

const textOf = (a, ctx) => a.byState ? a.texts?.[ctx.scene?.objectState(a.byState)] : a.text;

registerAction('say', (a, ctx) => {
  const text = textOf(a, ctx);
  if (text) ctx.scene?.say?.(a.who ?? ctx.object?.name ?? '', text);
});

registerAction('sfx', (a, ctx) => {
  if (a.src) {
    ctx.scene?.showSoundLegend?.(a.src);
    ctx.game.audio.playSample(ctx.scene.url(a.src), { duration: a.duration });
  } else ctx.game.audio.ui(a.name || 'soft');
});

registerAction('voice', (a, ctx) => ctx.scene?.speak?.(a));

registerAction('animate', (a, ctx) => ctx.scene?.animate?.(a, ctx));

registerAction('setState', (a, ctx) => ctx.scene?.setObjectState(a.object ?? ctx.object?.id, a.state));

registerAction('cycleState', (a, ctx) => {
  const id = a.object ?? ctx.object?.id;
  const def = ctx.scene?.objectDef(id);
  const states = a.states ?? Object.keys(def?.states || {});
  if (!states.length) return;
  const i = states.indexOf(ctx.scene.objectState(id));
  ctx.scene.setObjectState(id, states[(i + 1) % states.length]);
});

registerAction('set', (a, ctx) => ctx.game.state.set(a.var, a.value));

registerAction('inc', (a, ctx) => {
  const { state } = ctx.game;
  let v = (Number(state.get(a.var)) || 0) + (a.by ?? 1);
  if (a.mod) v = ((v % a.mod) + a.mod) % a.mod;
  state.set(a.var, v);
});

registerAction('take', (a, ctx) => {
  const id = a.object ?? ctx.object?.id;
  if (a.item && !ctx.game.state.addItem(a.item)) return;
  ctx.scene?.setObjectHidden(id, true, { fade: true });
});

registerAction('give', (a, ctx) => ctx.game.state.addItem(a.item));
registerAction('remove', (a, ctx) => ctx.game.state.removeItem(a.item));
registerAction('hide', (a, ctx) => ctx.scene?.setObjectHidden(a.object ?? ctx.object?.id, true, { fade: true }));
registerAction('show', (a, ctx) => ctx.scene?.setObjectHidden(a.object ?? ctx.object?.id, false, { fade: true }));
registerAction('note', (a, ctx) => ctx.game.state.addNote(a.text));

registerAction('objective', (a, ctx) => {
  const { state } = ctx.game;
  if (a.once && (state.data.objective || state.data.done.includes(a.set))) return;
  if (a.complete) state.completeObjective(a.complete);
  if (a.set) state.setObjective(a.set);
});

registerAction('examine', (a, ctx) => ctx.scene?.openPanel?.(a.panel, ctx));
registerAction('panelNote', (a, ctx) => ctx.scene?.panelNote?.(a.text));
registerAction('close', (a, ctx) => ctx.scene?.closePanel?.());
registerAction('goto', (a, ctx) => ctx.game.scenes.goto(a.scene));
registerAction('menu', (a, ctx) => ctx.game.shell.toMenu());
registerAction('wait', (a, ctx) => ctx.scene.sleep(a.ms ?? 0));

registerAction('if', (a, ctx) => runActions(test(a.cond, ctx) ? a.then : a.else, ctx));
