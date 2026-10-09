import { h, uid } from './dom.js';

export function toast(message, kind = 'info', timeout = 4500) {
  const host = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  host.append(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

/**
 * Opens a modal <dialog>. `buttons` items: {label, value, kind, submit}.
 * Resolves with the clicked button value, or null when dismissed.
 */
export function openDialog({ title, body = [], buttons = [], className = '', onSubmit = null, setup = null }) {
  return new Promise((resolve) => {
    const titleId = uid('dlg');
    const form = h('form', { method: 'dialog', class: 'modal-form', novalidate: true });
    const footer = h('div', { class: 'modal-actions' });
    const dialog = h('dialog', { class: `modal ${className}`, 'aria-labelledby': titleId },
      form);
    form.append(h('h2', { id: titleId, class: 'modal-title' }, title), h('div', { class: 'modal-body' }, body), footer);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    for (const button of buttons) {
      const el = h('button', {
        type: button.submit ? 'submit' : 'button',
        class: `btn ${button.kind ? `btn-${button.kind}` : ''}`,
        autofocus: button.autofocus || false,
      }, button.label);
      if (!button.submit) el.addEventListener('click', () => finish(button.value));
      footer.append(el);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!onSubmit) {
        finish(true);
        return;
      }
      const result = onSubmit(form);
      if (result !== undefined && result !== null) finish(result);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });

    document.body.append(dialog);
    dialog.showModal();
    if (setup) setup(finish, dialog);
  });
}

export async function confirmDialog(message, { title = 'Confirmation', confirmLabel = 'Confirmer', danger = false } = {}) {
  const value = await openDialog({
    title,
    body: [h('p', null, message)],
    buttons: [
      { label: 'Annuler', value: false, autofocus: true },
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'gold' },
    ],
  });
  return value === true;
}

export function choiceDialog({ title, message, choices }) {
  return openDialog({
    title,
    body: [h('p', null, message)],
    buttons: choices.map((choice) => ({ label: choice.label, value: choice.value, kind: choice.kind, autofocus: choice.autofocus })),
  });
}
