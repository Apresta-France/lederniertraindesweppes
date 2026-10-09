import { h, listen } from './dom.js';
import { FormScope } from './fields.js';
import { renderDecorInspector, renderExploreNone, renderObjectInspector } from './explore-inspector.js';
import { renderCinematicNone, renderItemInspector } from './cinematic-inspector.js';

/** Right-hand panel: rebuilt when the selection changes, refreshed in place otherwise. */
export class Inspector {
  constructor({ store, container, ctx }) {
    this.store = store;
    this.container = container;
    this.ctx = ctx;
    this.scope = null;
    this.shape = '';
    listen(store, 'load', () => this.rebuild());
    listen(store, 'select', () => this.rebuild());
    listen(store, 'readonly', () => this.rebuild());
    listen(store, 'change', (event) => this.onChange(event.detail.source));
  }

  selectedItem() {
    const { scene, selection } = this.store;
    if (!scene || !selection) return null;
    const list = { object: scene.objects, decor: scene.decor, item: scene.timeline }[selection.kind];
    return Array.isArray(list) ? list[selection.index] ?? null : null;
  }

  shapeKey() {
    const scene = this.store.scene;
    if (!scene) return 'none';
    const item = this.selectedItem();
    const selection = this.store.selection;
    return JSON.stringify([
      scene.type,
      item ? selection : null,
      item?.do ?? null,
      item?.type ?? null,
      item ? Array.isArray(item.rect) : null,
    ]);
  }

  onChange(source) {
    if (source === 'history' || source === 'json' || this.shapeKey() !== this.shape) {
      this.rebuild();
      return;
    }
    this.scope?.refresh();
  }

  rebuild() {
    this.scope?.dispose();
    this.scope = null;
    this.shape = this.shapeKey();
    const scene = this.store.scene;
    if (!scene) {
      this.container.replaceChildren(h('p', { class: 'empty' }, 'Aucune scène ouverte.'));
      return;
    }
    const scope = new FormScope(this.store, this.ctx);
    const item = this.selectedItem();
    const selection = this.store.selection;
    let content;
    if (scene.type === 'explore') {
      if (item && selection.kind === 'object') content = renderObjectInspector(scope, selection.index);
      else if (item && selection.kind === 'decor') content = renderDecorInspector(scope, selection.index);
      else content = renderExploreNone(scope);
    } else if (item && selection.kind === 'item') {
      content = renderItemInspector(scope, selection.index, this.ctx);
    } else {
      content = renderCinematicNone(scope);
    }
    this.scope = scope;
    this.container.replaceChildren(...[content].flat(Infinity).filter(Boolean));
    if (this.store.readOnly) {
      this.container.prepend(h('p', { class: 'readonly-note' }, 'Lecture seule.'));
    }
  }
}
