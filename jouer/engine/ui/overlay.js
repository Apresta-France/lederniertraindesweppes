const FOCUSABLE = 'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

// Fenêtre modale accessible : focus déplacé à l'ouverture, piégé dedans, rendu à la fermeture.
export class Overlay {
  constructor(root, card) {
    this.root = root;
    this.card = card;
    this.returnTo = null;
    this.onClose = null;
    card.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const list = [...card.querySelectorAll(FOCUSABLE)];
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    root.addEventListener('click', e => { if (e.target === root) this.close(); });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open(html, { single = false, label = '' } = {}) {
    if (!this.isOpen) this.returnTo = document.activeElement;
    this.card.className = 'room-card' + (single ? ' single' : '');
    this.card.setAttribute('aria-label', label);
    this.card.innerHTML = `<button type="button" class="room-x" data-close aria-label="Fermer">✕</button>${html}`;
    this.root.hidden = false;
    (this.card.querySelector('.room-acts button') || this.card.querySelector(FOCUSABLE))?.focus();
  }

  // Remplace le contenu sans perdre la position du focus (fenêtre déjà ouverte).
  refresh(html) {
    const idx = [...this.card.querySelectorAll(FOCUSABLE)].indexOf(document.activeElement);
    this.card.innerHTML = `<button type="button" class="room-x" data-close aria-label="Fermer">✕</button>${html}`;
    const list = [...this.card.querySelectorAll(FOCUSABLE)];
    (list[idx] || list[0])?.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.card.innerHTML = '';
    const back = this.returnTo;
    this.returnTo = null;
    if (back?.isConnected) back.focus();
    this.onClose?.();
  }
}
