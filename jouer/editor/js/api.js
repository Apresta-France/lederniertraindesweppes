export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export class Api {
  constructor(base, csrf) {
    this.base = new URL(base, window.location.href);
    this.csrf = csrf;
    this.onUnauthorized = null;
  }

  url(action, query = {}) {
    const url = new URL(this.base);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url;
  }

  async request(action, { method = 'GET', query, json, form, keepalive = false } = {}) {
    const headers = { Accept: 'application/json' };
    let body;
    if (method === 'POST') {
      headers['X-CSRF-Token'] = this.csrf;
      if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
      } else if (form) {
        body = form;
      }
    }
    let response;
    try {
      response = await fetch(this.url(action, query), { method, headers, body, credentials: 'same-origin', cache: 'no-store', keepalive });
    } catch {
      throw new ApiError('Le serveur est injoignable. Vérifiez votre connexion.', 0, null);
    }
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      if (response.status === 401 && this.onUnauthorized) this.onUnauthorized();
      throw new ApiError(data?.error || `Erreur du serveur (${response.status}).`, response.status, data);
    }
    if (data === null) throw new ApiError('Réponse du serveur illisible.', response.status, null);
    return data;
  }

  list() {
    return this.request('list');
  }

  scene(id) {
    return this.request('scene', { query: { id } });
  }

  save(id, scene, rev, force = false) {
    return this.request('save', { method: 'POST', json: { id, scene, rev, force } });
  }

  create(id, type, title) {
    return this.request('create', { method: 'POST', json: { id, type, title } });
  }

  saveGame(game, rev, force = false) {
    return this.request('game', { method: 'POST', json: { game, rev, force } });
  }

  lock(id, force = false) {
    return this.request('lock', { method: 'POST', json: { id, force } });
  }

  unlock(id) {
    return this.request('unlock', { method: 'POST', json: { id }, keepalive: true });
  }

  unlockBeacon(id) {
    const form = new FormData();
    form.append('id', id);
    form.append('_csrf', this.csrf);
    return navigator.sendBeacon(this.url('unlock'), form);
  }

  assets(id) {
    return this.request('assets', { query: { id } });
  }

  upload(id, file, replace = false) {
    const form = new FormData();
    form.append('id', id);
    form.append('file', file);
    if (replace) form.append('replace', '1');
    return this.request('upload', { method: 'POST', form });
  }

  characters() {
    return this.request('characters');
  }

  character(id) {
    return this.request('character', { query: { id } });
  }

  saveCharacter(id, character, rev, force = false) {
    return this.request('character-save', { method: 'POST', json: { id, character, rev, force } });
  }

  createCharacter(id, name) {
    return this.request('character-create', { method: 'POST', json: { id, name } });
  }

  registerCharacter(id) {
    return this.request('character-register', { method: 'POST', json: { id } });
  }

  uploadCharacterFile(id, folder, file, replace = false) {
    const form = new FormData();
    form.append('id', id);
    form.append('folder', folder);
    form.append('file', file);
    if (replace) form.append('replace', '1');
    return this.request('character-upload', { method: 'POST', form });
  }
}
