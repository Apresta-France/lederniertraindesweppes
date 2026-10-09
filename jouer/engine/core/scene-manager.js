import { loadScene } from './loader.js';
import { sceneBase } from './paths.js';
import { sceneTypes } from '../scenes/registry.js';

// Charge les scènes par identifiant, les monte dans l'hôte et enchaîne la suivante.
export class SceneManager {
  constructor(game, host) {
    this.game = game;
    this.host = host;
    this.current = null;
    this.seq = 0;
  }

  async goto(id, { preview = false } = {}) {
    const seq = ++this.seq;
    let data;
    try {
      data = await loadScene(id, { preview: preview || id === this.game.previewId });
    } catch (err) {
      console.error(err);
      this.game.announcer.alert(`La scène « ${id} » est introuvable.`);
      return;
    }
    return this.show(id, data, seq);
  }

  // Monte une scène à partir de données déjà chargées (aperçu intégré de l'éditeur).
  async show(id, data, seq = ++this.seq) {
    const Type = sceneTypes.get(data.type);
    if (!Type) {
      console.error(`[scènes] type inconnu « ${data.type} » pour « ${id} »`);
      return;
    }
    const scene = new Type(this.game, { ...data, id }, sceneBase(id));
    await scene.preload();
    if (seq !== this.seq) { scene.dispose(); return; }

    const prev = this.current;
    this.current = scene;
    this.game.state.data.scene = id;
    scene.mount(this.host);
    if (prev) setTimeout(() => prev.dispose(), Math.max(scene.fadeIn, 50) + 100);
    scene.start();
    this.game.emit('scene', scene);
    this.game.autosave();
    return scene;
  }

  // Appelé par une scène quand elle se termine d'elle-même.
  next(scene, nextId) {
    if (scene !== this.current) return;
    if (nextId) this.goto(nextId);
    else this.game.shell.toMenu();
  }

  clear() {
    this.seq++;
    [...this.host.children].forEach(el => el._scene?.dispose());
    this.current = null;
    this.host.innerHTML = '';
  }
}
