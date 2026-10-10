import { h, uid, slugify, clamp } from './dom.js';
import { openDialog, toast } from './ui.js';

const ALPHA_MIN = 8;
const PAD = 2;
const MAX_CELLS = 12;

// Read as a data: URL: the site's Content-Security-Policy refuses blob: images.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('fichier illisible'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image illisible'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function pixelsOf(img) {
  const canvas = h('canvas', { width: img.naturalWidth, height: img.naturalHeight });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Guesses the grid from the transparent gaps between figures; tiny specks are ignored.
function countRuns(pixels, axis) {
  const { width, height, data } = pixels;
  const size = axis === 'x' ? width : height;
  const filled = new Uint8Array(size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_MIN) filled[axis === 'x' ? x : y] = 1;
    }
  }
  const minRun = size / 50;
  let runs = 0;
  let length = 0;
  for (let i = 0; i <= size; i++) {
    if (i < size && filled[i]) {
      length += 1;
    } else {
      if (length >= minRun) runs += 1;
      length = 0;
    }
  }
  return clamp(runs, 1, MAX_CELLS);
}

function cellBox(pixels, cx, cy, cw, ch) {
  const { width, data } = pixels;
  let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[((cy + y) * width + cx + x) * 4 + 3] <= ALPHA_MIN) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/**
 * Cuts the sheet into equal cells, skips empty ones and, when `trim` is set, crops every
 * frame to the same box (union of the visible pixels) so the animation does not jump.
 */
function sliceFrames(img, pixels, cols, rows, trim) {
  const cw = Math.floor(img.naturalWidth / cols);
  const ch = Math.floor(img.naturalHeight / rows);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const box = cellBox(pixels, c * cw, r * ch, cw, ch);
      if (box) cells.push({ x: c * cw, y: r * ch, box });
    }
  }
  let crop = [0, 0, cw, ch];
  if (trim && cells.length) {
    const x0 = Math.max(0, Math.min(...cells.map((cell) => cell.box[0])) - PAD);
    const y0 = Math.max(0, Math.min(...cells.map((cell) => cell.box[1])) - PAD);
    const x1 = Math.min(cw, Math.max(...cells.map((cell) => cell.box[2])) + 1 + PAD);
    const y1 = Math.min(ch, Math.max(...cells.map((cell) => cell.box[3])) + 1 + PAD);
    crop = [x0, y0, x1 - x0, y1 - y0];
  }
  return {
    cw,
    ch,
    crop,
    cells,
    frames: cells.map((cell) => {
      const canvas = h('canvas', { width: crop[2], height: crop[3] });
      canvas.getContext('2d').drawImage(img, cell.x + crop[0], cell.y + crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]);
      return canvas;
    }),
  };
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('conversion PNG impossible'))), 'image/png');
  });
}

/**
 * Dialog that slices a sprite sheet (grid of poses on a transparent background).
 * Resolves with a list of PNG File objects named `<base>_<n>.png`, or null.
 * `labels` names the frames in order (e.g. the talking slots).
 */
export async function sliceSheetDialog({ file, baseName = '', labels = [], fps = 8 }) {
  let img;
  try {
    img = await loadImage(file);
  } catch {
    toast('Cette image ne peut pas être lue.', 'error');
    return null;
  }
  const pixels = pixelsOf(img);
  const colsId = uid('cols');
  const rowsId = uid('rows');
  const trimId = uid('trim');
  const nameId = uid('base');
  const cols = h('input', { id: colsId, type: 'number', min: 1, max: MAX_CELLS, step: 1, value: String(countRuns(pixels, 'x')) });
  const rows = h('input', { id: rowsId, type: 'number', min: 1, max: MAX_CELLS, step: 1, value: String(countRuns(pixels, 'y')) });
  const trim = h('input', { id: trimId, type: 'checkbox', checked: true });
  const base = h('input', { id: nameId, type: 'text', class: 'mono', autocomplete: 'off', value: slugify(baseName || file.name.replace(/\.[^.]+$/, '')) || 'image' });
  const sheet = h('canvas', { class: 'sheet-canvas' });
  const strip = h('div', { class: 'sheet-frames' });
  const player = h('div', { class: 'sheet-player' });
  const info = h('p', { class: 'help' });
  let result = null;
  let timer = null;

  const drawSheet = () => {
    const scale = Math.min(1, 640 / img.naturalWidth, 360 / img.naturalHeight);
    sheet.width = Math.round(img.naturalWidth * scale);
    sheet.height = Math.round(img.naturalHeight * scale);
    const ctx = sheet.getContext('2d');
    ctx.clearRect(0, 0, sheet.width, sheet.height);
    ctx.drawImage(img, 0, 0, sheet.width, sheet.height);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = 'rgba(124, 199, 232, .9)';
    for (let r = 0; r < Number(rows.value); r++) {
      for (let c = 0; c < Number(cols.value); c++) ctx.strokeRect(c * result.cw, r * result.ch, result.cw, result.ch);
    }
    ctx.strokeStyle = 'rgba(240, 210, 155, .95)';
    ctx.setLineDash([6 / scale, 4 / scale]);
    result.cells.forEach((cell, index) => {
      ctx.strokeRect(cell.x + result.crop[0], cell.y + result.crop[1], result.crop[2], result.crop[3]);
      ctx.fillStyle = 'rgba(240, 210, 155, .95)';
      ctx.font = `${14 / scale}px system-ui`;
      ctx.fillText(String(index + 1), cell.x + 6 / scale, cell.y + 16 / scale);
    });
    ctx.restore();
  };

  const update = () => {
    const c = clamp(Math.round(Number(cols.value)) || 1, 1, MAX_CELLS);
    const r = clamp(Math.round(Number(rows.value)) || 1, 1, MAX_CELLS);
    result = sliceFrames(img, pixels, c, r, trim.checked);
    drawSheet();
    const name = slugify(base.value) || 'image';
    strip.replaceChildren(...result.frames.map((canvas, index) => h('figure', { class: 'sheet-frame' },
      canvas,
      h('figcaption', null,
        h('span', { class: 'mono' }, `${name}_${index + 1}.png`),
        labels[index] ? h('span', null, labels[index]) : null))));
    info.textContent = result.frames.length
      ? `${result.frames.length} image(s) de ${result.crop[2]} × ${result.crop[3]} px (cases vides ignorées).`
      : 'Aucune image : la planche semble entièrement transparente.';
    if (labels.length && result.frames.length !== labels.length) {
      info.textContent += ` Attendu : ${labels.length} images (${labels.join(', ')}).`;
    }
    clearInterval(timer);
    let index = 0;
    const show = () => {
      const frame = result.frames[index % result.frames.length];
      if (!frame) return player.replaceChildren();
      const copy = h('canvas', { width: frame.width, height: frame.height });
      copy.getContext('2d').drawImage(frame, 0, 0);
      player.replaceChildren(copy);
      index += 1;
    };
    show();
    timer = setInterval(show, 1000 / fps);
  };

  [cols, rows, trim].forEach((input) => input.addEventListener('input', update));
  base.addEventListener('input', update);
  update();

  const ok = await openDialog({
    title: 'Découper une planche de sprites',
    className: 'modal-wide',
    body: [
      h('p', { class: 'help' }, 'La planche est coupée en cases égales. Chaque case non vide devient une image PNG du dossier sprites/.'),
      h('div', { class: 'sheet-layout' },
        h('div', null, sheet),
        h('div', { class: 'sheet-side' },
          h('div', { class: 'sheet-grid-fields' },
            h('div', { class: 'field field-number' }, h('label', { for: colsId }, 'Colonnes'), cols),
            h('div', { class: 'field field-number' }, h('label', { for: rowsId }, 'Lignes'), rows)),
          h('div', { class: 'field field-check' }, trim, h('label', { for: trimId }, 'Rogner les marges transparentes'),
            h('p', { class: 'help' }, 'Même cadrage pour toutes les images : le personnage ne saute pas d’une image à l’autre.')),
          h('div', { class: 'field' }, h('label', { for: nameId }, 'Nom des fichiers'), base),
          h('p', { class: 'sound-kicker' }, 'Aperçu animé'),
          player)),
      info,
      strip,
    ],
    buttons: [
      { label: 'Annuler', value: null },
      { label: 'Découper et téléverser', kind: 'gold', submit: true },
    ],
    onSubmit: () => (result.frames.length ? true : null),
  });
  clearInterval(timer);
  if (ok !== true) return null;
  const name = slugify(base.value) || 'image';
  return Promise.all(result.frames.map(async (canvas, index) => new File([await toBlob(canvas)], `${name}_${index + 1}.png`, { type: 'image/png' })));
}
