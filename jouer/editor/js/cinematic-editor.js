import { h, uid, listen, clamp } from './dom.js';
import { assetUrl, fileName, formatClock, formatSeconds } from './paths.js';
import { LANES, OPS, OP_NAMES, itemEnd, laneOf, sortTimeline, totalDuration } from './timeline-ops.js';
import { confirmDialog } from './ui.js';
import { CinePreview } from './cine-preview.js';

const PPS_PREF = 'ldtw_editor_pps';
const RULER_H = 24;
const ROW_H = 28;
const SNAP_MS = 100;
let dragSeq = 0;

const num = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function shortLabel(item) {
  switch (item?.do) {
    case 'shot': return fileName(item.src) || 'plan';
    case 'card': return item.title || item.eyebrow || 'carton';
    case 'caption': return item.title || 'légende';
    case 'logo': return 'logo';
    case 'music': return item.src ? `♪ ${fileName(item.src)}` : `♪ vol. ${num(item.volume, 1)}`;
    case 'rain': return `pluie ${'level' in item ? item.level : '·'}/${'sound' in item ? item.sound : '·'}`;
    case 'ambience': return `${item.kind || 'ambiance'} ${num(item.level)}`;
    case 'fx': return `${item.name || 'fx'} ${item.on === false ? 'off' : 'on'}`;
    case 'clear': return 'clear';
    case 'fadeLayers': return 'fondu';
    case 'clockTicks': return 'tic-tac';
    case 'marker': return 'repère';
    case 'end': return 'FIN';
    default: return String(item?.do ?? '?');
  }
}

/** Timeline + chronological list for cinematic scenes. */
export class CinematicEditor {
  constructor({ store, container, ctx }) {
    this.store = store;
    this.ctx = ctx;
    this.container = container;
    this.pps = clamp(Number(localStorage.getItem(PPS_PREF)) || 40, 4, 400);
    this.itemEls = [];
    this.drag = null;
    this.rulerSignature = '';
    this.listSignature = '';
    this.playhead = 0;
    this.scrub = false;
    this.build();
    this.preview = ctx.previewDock ? new CinePreview({ store, dock: ctx.previewDock }) : null;
    this.disposers = [
      listen(store, 'change', () => this.render()),
      listen(store, 'select', () => this.onSelect()),
      listen(store, 'readonly', () => this.render()),
    ];
    if (this.preview) {
      this.disposers.push(listen(this.preview, 'time', (e) => this.showPlayhead(e.detail.t, e.detail.playing && !e.detail.local)));
    }
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.scroller);
    this.render();
  }

  get timeline() {
    return Array.isArray(this.store.scene?.timeline) ? this.store.scene.timeline : [];
  }

  build() {
    const addId = uid('add');
    this.addSelect = h('select', { id: addId, 'data-edit': '' },
      h('option', { value: '' }, 'Ajouter…'),
      OP_NAMES.map((op) => h('option', { value: op }, `${OPS[op].label} (${op})`)));
    this.addSelect.addEventListener('change', () => {
      const op = this.addSelect.value;
      this.addSelect.value = '';
      if (op) this.addItem(op);
    });
    const button = (label, onClick, title = label, edit = true) => h('button', { type: 'button', class: 'btn btn-small', title, 'data-edit': edit ? '' : null, onclick: onClick }, label);
    this.btnDup = button('Dupliquer', () => this.duplicateSelected(), 'Dupliquer (Ctrl+D)');
    this.btnDel = button('Supprimer', () => this.removeSelected(), 'Supprimer (Suppr)');
    this.btnDel.classList.add('btn-danger');
    this.zoomLabel = h('span', { class: 'coords' });
    this.totalLabel = h('strong', { class: 'tl-total' });
    this.hoverLabel = h('span', { class: 'coords' }, 't —');

    const toolbar = h('div', { class: 'toolbar' },
      h('span', { class: 'toolbar-group' }, h('label', { for: addId, class: 'visually-hidden' }, 'Ajouter un élément'), this.addSelect),
      this.btnDup,
      this.btnDel,
      h('span', { class: 'toolbar-group' },
        button('−', () => this.setPps(this.pps / 1.5), 'Dézoomer', false),
        this.zoomLabel,
        button('+', () => this.setPps(this.pps * 1.5), 'Zoomer', false)),
      h('span', null, 'Durée totale : ', this.totalLabel),
      this.hoverLabel,
      h('span', { class: 'toolbar-hint' }, 'Règle : placer la tête de lecture · Double-clic : aller à l’élément · Espace : lecture · Glisser : pas de 100 ms (Alt : libre) · Flèches : ±100 ms (Maj : ±1 s) · Ctrl + molette : zoom'));

    this.laneLabels = Object.fromEntries(LANES.map((lane) => [lane.id, h('div', { class: 'tl-lane-label' }, lane.label)]));
    this.laneEls = Object.fromEntries(LANES.map((lane) => [lane.id, h('div', { class: `tl-lane tl-lane-${lane.id}` })]));
    this.ruler = h('div', { class: 'tl-ruler', style: { height: `${RULER_H}px` } });
    this.endLine = h('div', { class: 'tl-endline', hidden: true });
    this.hoverLine = h('div', { class: 'tl-hoverline', hidden: true });
    this.itemsLayer = h('div', { class: 'tl-items' });
    this.playheadEl = h('div', { class: 'tl-playhead', 'aria-hidden': 'true' }, h('span', { class: 'tl-playhead-handle' }));
    this.content = h('div', { class: 'tl-content' }, this.ruler, LANES.map((l) => this.laneEls[l.id]), this.endLine, this.itemsLayer, this.hoverLine, this.playheadEl);
    this.scroller = h('div', { class: 'tl-scroll' }, this.content);
    const labels = h('div', { class: 'tl-labels' }, h('div', { class: 'tl-ruler-spacer', style: { height: `${RULER_H}px` } }), LANES.map((l) => this.laneLabels[l.id]));
    this.timelineEl = h('div', { class: 'timeline', role: 'group', 'aria-label': 'Frise chronologique (au clavier, utilisez la liste ci-dessous)' }, labels, this.scroller);

    this.content.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.content.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.content.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.content.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.content.addEventListener('dblclick', (e) => {
      const el = e.target.closest('.tl-item');
      if (el) this.seek(num(this.timeline[Number(el.dataset.index)]?.at));
    });
    this.content.addEventListener('pointerleave', () => {
      this.hoverLine.hidden = true;
      this.hoverLabel.textContent = 't —';
    });
    this.scroller.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = this.scroller.getBoundingClientRect();
      this.setPps(this.pps * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - rect.left);
    }, { passive: false });

    this.listBody = h('tbody');
    this.listBody.addEventListener('keydown', (e) => this.onListKey(e));
    const table = h('table', { class: 'tl-table' },
      h('caption', { class: 'visually-hidden' }, 'Éléments de la cinématique par ordre chronologique'),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Temps'), h('th', { scope: 'col' }, 'Type'), h('th', { scope: 'col' }, 'Détail'))),
      this.listBody);
    this.listWrap = h('div', { class: 'tl-list', 'data-own-keys': '' }, table);

    this.root = h('div', { class: 'cine' }, toolbar, this.timelineEl, this.listWrap);
    this.container.replaceChildren(this.root);
  }

  destroy() {
    this.disposers.forEach((dispose) => dispose());
    this.resizeObserver.disconnect();
    this.preview?.destroy();
    this.root.remove();
  }

  /** Moves the playhead and the preview to `ms`; scrubbing always pauses playback. */
  seek(ms, { play = false } = {}) {
    this.showPlayhead(ms);
    this.preview?.seek(this.playhead, { play });
  }

  showPlayhead(ms, follow = false) {
    this.playhead = Math.max(0, num(ms));
    const x = this.xOf(this.playhead);
    this.playheadEl.style.left = `${x}px`;
    if (follow) {
      const { scrollLeft, clientWidth } = this.scroller;
      if (x < scrollLeft || x > scrollLeft + clientWidth - 40) this.scroller.scrollLeft = Math.max(0, x - 80);
    }
  }

  setPps(value, anchorX = null) {
    const next = clamp(value, 4, 400);
    const anchor = anchorX ?? this.scroller.clientWidth / 2;
    const time = (this.scroller.scrollLeft + anchor) / this.pps;
    this.pps = next;
    localStorage.setItem(PPS_PREF, String(Math.round(next)));
    this.render();
    this.scroller.scrollLeft = Math.max(0, time * next - anchor);
  }

  xOf(ms) {
    return (num(ms) / 1000) * this.pps;
  }

  render() {
    if (!this.store.scene) return;
    const timeline = this.timeline;
    const total = totalDuration(timeline);
    const selection = this.store.selection;
    const width = Math.max(this.scroller.clientWidth || 600, this.xOf(total) + 240);
    this.content.style.width = `${width}px`;
    this.zoomLabel.textContent = `${Math.round(this.pps)} px/s`;
    this.totalLabel.textContent = formatSeconds(total);

    this.renderRuler(width);

    const placed = timeline.map((item, index) => {
      const at = num(item?.at);
      const end = itemEnd(item);
      const x = this.xOf(at);
      const w = end !== null ? Math.max(6, this.xOf(end - at)) : null;
      const label = shortLabel(item);
      return { item, index, lane: laneOf(item), x, w, label, visualEnd: x + (w ?? 18 + Math.min(label.length, 26) * 6.4) };
    });
    const rowsByLane = {};
    for (const lane of LANES) {
      const rows = [];
      placed.filter((p) => p.lane === lane.id).sort((a, b) => a.x - b.x || a.index - b.index).forEach((p) => {
        let row = rows.findIndex((end) => end + 4 <= p.x);
        if (row < 0) {
          row = rows.length;
          rows.push(0);
        }
        rows[row] = p.visualEnd;
        p.row = row;
      });
      rowsByLane[lane.id] = Math.max(1, rows.length);
    }
    let top = RULER_H;
    const laneTop = {};
    for (const lane of LANES) {
      const height = rowsByLane[lane.id] * ROW_H + 8;
      laneTop[lane.id] = top;
      this.laneEls[lane.id].style.height = `${height}px`;
      this.laneLabels[lane.id].style.height = `${height}px`;
      top += height;
    }
    this.content.style.height = `${top}px`;

    while (this.itemEls.length < placed.length) {
      const el = h('div', { class: 'tl-item' }, h('div', { class: 'tl-fade' }), h('img', { class: 'tl-thumb', alt: '', draggable: 'false' }), h('span', { class: 'tl-label' }));
      this.itemEls.push(el);
      this.itemsLayer.append(el);
    }
    while (this.itemEls.length > placed.length) this.itemEls.pop().remove();

    placed.forEach((p) => {
      const el = this.itemEls[p.index];
      const isBar = p.w !== null;
      const op = p.item?.do;
      el.className = `tl-item op-${OPS[op] ? op : 'unknown'} ${isBar ? 'is-bar' : 'is-point'}${selection?.kind === 'item' && selection.index === p.index ? ' is-selected' : ''}`;
      el.dataset.index = String(p.index);
      el.style.left = `${p.x}px`;
      el.style.top = `${laneTop[p.lane] + 4 + p.row * ROW_H}px`;
      el.style.width = isBar ? `${p.w}px` : '';
      el.title = `${formatClock(p.item?.at)} · ${OPS[op]?.label || op} · ${OPS[op]?.summary(p.item) ?? ''}`;
      const [fade, img, label] = el.children;
      label.textContent = p.label;
      const fadeMs = op === 'shot' ? num(p.item.fade, 1000) : 0;
      fade.hidden = !(isBar && fadeMs > 0);
      fade.style.width = `${Math.min(p.w ?? 0, this.xOf(fadeMs))}px`;
      const thumb = op === 'shot' ? assetUrl(this.store.id, p.item.src) : '';
      if (img.dataset.src !== thumb) {
        img.dataset.src = thumb;
        if (thumb) img.src = thumb;
        else img.removeAttribute('src');
      }
      img.hidden = !thumb;
    });

    const endItem = timeline.find((item) => item?.do === 'end');
    this.endLine.hidden = !endItem;
    if (endItem) this.endLine.style.left = `${this.xOf(endItem.at)}px`;
    this.playheadEl.style.left = `${this.xOf(this.playhead)}px`;

    const hasSel = selection?.kind === 'item' && timeline[selection.index];
    this.btnDup.disabled = this.store.readOnly || !hasSel;
    this.btnDel.disabled = this.store.readOnly || !hasSel;
    this.addSelect.disabled = this.store.readOnly;

    this.renderList();
  }

  renderRuler(width) {
    const signature = `${width}@${this.pps}`;
    if (signature === this.rulerSignature) return;
    this.rulerSignature = signature;
    const step = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * this.pps >= 56) ?? 60;
    const ticks = [];
    for (let t = 0; this.xOf(t * 1000) <= width; t += step) {
      const seconds = Math.round(t * 100) / 100;
      const text = seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}` : `${String(seconds).replace('.', ',')} s`;
      ticks.push(h('span', { class: 'tl-tick', style: { left: `${this.xOf(t * 1000)}px` } }, text));
    }
    this.ruler.replaceChildren(...ticks);
    this.content.style.setProperty('--tick', `${step * this.pps}px`);
  }

  renderList() {
    const timeline = this.timeline;
    const selection = this.store.selection;
    const signature = JSON.stringify([timeline, selection, this.store.readOnly]);
    if (signature === this.listSignature) return;
    this.listSignature = signature;
    const focusIn = this.listBody.contains(document.activeElement);
    const rows = timeline
      .map((item, index) => ({ item, index }))
      .sort((a, b) => num(a.item?.at) - num(b.item?.at) || a.index - b.index);
    this.listBody.replaceChildren(...rows.map(({ item, index }) => {
      const selected = selection?.kind === 'item' && selection.index === index;
      const op = OPS[item?.do];
      return h('tr', { class: selected ? 'is-selected' : null },
        h('td', { class: 'mono' }, formatClock(item?.at)),
        h('td', null, h('span', { class: `chip chip-op op-${op ? item.do : 'unknown'}` }, op ? op.label : `inconnu : ${item?.do}`)),
        h('td', null, h('button', {
          type: 'button',
          class: 'tl-row-btn',
          'aria-pressed': String(selected),
          dataset: { index: String(index) },
          onclick: () => this.store.setSelection({ kind: 'item', index }),
        }, op ? op.summary(item) : JSON.stringify(item))));
    }));
    if (!rows.length) this.listBody.append(h('tr', null, h('td', { colspan: '3', class: 'empty' }, 'La frise est vide : utilisez « Ajouter… ».')));
    if (focusIn) this.listBody.querySelector('tr.is-selected .tl-row-btn')?.focus();
  }

  onSelect() {
    this.render();
    const selection = this.store.selection;
    if (selection?.kind !== 'item') return;
    this.listBody.querySelector('tr.is-selected')?.scrollIntoView({ block: 'nearest' });
    const el = this.itemEls[selection.index];
    if (el) {
      const left = el.offsetLeft;
      const right = left + el.offsetWidth;
      if (left < this.scroller.scrollLeft || right > this.scroller.scrollLeft + this.scroller.clientWidth) {
        this.scroller.scrollLeft = Math.max(0, left - 80);
      }
    }
  }

  onListKey(event) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...this.listBody.querySelectorAll('.tl-row-btn')];
    if (!buttons.length) return;
    event.preventDefault();
    let index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowUp') index = Math.max(0, index - 1);
    else if (event.key === 'ArrowDown') index = Math.min(buttons.length - 1, index + 1);
    else if (event.key === 'Home') index = 0;
    else index = buttons.length - 1;
    buttons[index].focus();
    this.store.setSelection({ kind: 'item', index: Number(buttons[index].dataset.index) });
  }

  timeAt(event) {
    const rect = this.content.getBoundingClientRect();
    return Math.max(0, ((event.clientX - rect.left) / this.pps) * 1000);
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    const el = event.target.closest('.tl-item');
    if (!el) {
      if (!event.target.closest('.tl-ruler')) this.store.setSelection(null);
      this.scrub = true;
      this.content.setPointerCapture(event.pointerId);
      this.seek(this.timeAt(event));
      event.preventDefault();
      return;
    }
    const index = Number(el.dataset.index);
    this.store.setSelection({ kind: 'item', index });
    this.drag = { index, startAt: num(this.timeline[index]?.at), startX: event.clientX, moved: false, key: `tl-drag:${(dragSeq += 1)}` };
    this.content.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onPointerMove(event) {
    const time = this.timeAt(event);
    const rect = this.content.getBoundingClientRect();
    this.hoverLine.hidden = false;
    this.hoverLine.style.left = `${event.clientX - rect.left}px`;
    this.hoverLabel.textContent = `t ${formatClock(time)}`;

    if (this.scrub) {
      this.seek(event.altKey ? time : Math.round(time / SNAP_MS) * SNAP_MS);
      return;
    }
    const drag = this.drag;
    if (!drag || this.store.readOnly) return;
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 3) return;
    drag.moved = true;
    let at = drag.startAt + (dx / this.pps) * 1000;
    at = event.altKey ? Math.round(at) : Math.round(at / SNAP_MS) * SNAP_MS;
    at = Math.max(0, at);
    this.store.update((scene) => {
      const item = scene.timeline?.[drag.index];
      if (item) item.at = at;
    }, { key: drag.key, source: 'timeline' });
  }

  onPointerUp(event) {
    if (this.scrub) {
      this.scrub = false;
      if (this.content.hasPointerCapture(event.pointerId)) this.content.releasePointerCapture(event.pointerId);
      return;
    }
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (this.content.hasPointerCapture(event.pointerId)) this.content.releasePointerCapture(event.pointerId);
    if (drag.moved) this.resort(drag.index, drag.key);
    this.store.breakCoalescing();
  }

  /** Re-sorts the timeline by time, keeping the item at `index` selected. */
  resort(index, key = null) {
    let next = index;
    this.store.update((scene) => {
      if (Array.isArray(scene.timeline)) next = sortTimeline(scene.timeline, scene.timeline[index]);
    }, { key, source: 'timeline' });
    if (next >= 0) this.store.setSelection({ kind: 'item', index: next });
  }

  defaultAt(op) {
    const timeline = this.timeline;
    if (op === 'shot') {
      const ends = timeline.filter((i) => i?.do === 'shot').map((i) => num(i.at) + num(i.duration));
      return ends.length ? Math.max(...ends) : 0;
    }
    if (op === 'end') return totalDuration(timeline.filter((i) => i?.do !== 'end'));
    const selection = this.store.selection;
    if (selection?.kind === 'item' && timeline[selection.index]) return num(timeline[selection.index].at);
    return 0;
  }

  addItem(op) {
    const item = OPS[op].template(Math.round(this.defaultAt(op)));
    let index = -1;
    const ok = this.store.update((scene) => {
      if (!Array.isArray(scene.timeline)) scene.timeline = [];
      scene.timeline.push(item);
      index = sortTimeline(scene.timeline, item);
    }, { source: 'timeline' });
    if (ok) this.store.setSelection({ kind: 'item', index });
  }

  duplicateSelected() {
    const selection = this.store.selection;
    const original = selection?.kind === 'item' ? this.timeline[selection.index] : null;
    if (!original || this.store.readOnly) return;
    const copy = structuredClone(original);
    const index = selection.index + 1;
    if (this.store.update((scene) => scene.timeline.splice(index, 0, copy), { source: 'timeline' })) {
      this.store.setSelection({ kind: 'item', index });
    }
  }

  async removeSelected() {
    const selection = this.store.selection;
    const item = selection?.kind === 'item' ? this.timeline[selection.index] : null;
    if (!item || this.store.readOnly) return;
    const label = `${OPS[item.do]?.label || item.do} à ${formatClock(item.at)}`;
    const ok = await confirmDialog(`Supprimer « ${label} » ?`, { title: 'Supprimer', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    if (this.store.update((scene) => scene.timeline.splice(selection.index, 1), { source: 'timeline' })) {
      this.store.setSelection(null);
    }
  }

  handleKey(event) {
    const selection = this.store.selection;
    if (event.key === ' ' && this.preview) {
      this.preview.toggle();
      return true;
    }
    if (event.key === 'Home') {
      this.seek(0);
      return true;
    }
    if (event.key === 'Escape') {
      this.store.setSelection(null);
      return true;
    }
    if (selection?.kind !== 'item' || !this.timeline[selection.index]) return false;
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.ctrlKey && !event.metaKey) {
      const step = (event.shiftKey ? 1000 : SNAP_MS) * (event.key === 'ArrowLeft' ? -1 : 1);
      const key = `tl-nudge:${selection.index}`;
      const ok = this.store.update((scene) => {
        const item = scene.timeline[selection.index];
        item.at = Math.max(0, num(item.at) + step);
      }, { key, source: 'timeline' });
      if (ok) this.resort(selection.index, key);
      return true;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.removeSelected();
      return true;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      this.duplicateSelected();
      return true;
    }
    return false;
  }
}
