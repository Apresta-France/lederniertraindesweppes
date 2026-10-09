// Interpolation à pas fixe (setInterval plutôt que requestAnimationFrame : les fondus audio
// doivent continuer quand l'onglet est en arrière-plan).
export function tween(from, to, ms, onUpdate, onDone) {
  if (ms <= 0) {
    onUpdate(to);
    onDone?.();
    return () => {};
  }
  const t0 = performance.now();
  const iv = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    onUpdate(from + (to - from) * k);
    if (k >= 1) {
      clearInterval(iv);
      onDone?.();
    }
  }, 40);
  return () => clearInterval(iv);
}

export const clamp01 = v => Math.max(0, Math.min(1, v));
