// Annonces pour lecteurs d'écran (régions aria-live déclarées dans index.php).
export class Announcer {
  constructor(polite, assertive) {
    this.polite = polite;
    this.assertive = assertive;
  }

  say(text) {
    this.#write(this.polite, text);
  }

  alert(text) {
    this.#write(this.assertive, text);
  }

  // Vider puis réécrire : une même phrase répétée doit être relue.
  // Les annonces rapprochées sont regroupées pour ne pas s'écraser.
  #write(region, text) {
    if (!region || !text) return;
    region._pending = region._pending ? `${region._pending} ${text}` : text;
    region.textContent = '';
    clearTimeout(region._t);
    region._t = setTimeout(() => {
      region.textContent = region._pending;
      region._pending = '';
    }, 80);
  }
}
