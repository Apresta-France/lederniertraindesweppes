import { CinematicScene } from './cinematic.js';
import { ExploreScene } from './explore.js';

// Types de scène disponibles. Un nouveau type = une classe qui étend Scene, enregistrée ici.
export const sceneTypes = new Map([
  ['cinematic', CinematicScene],
  ['explore', ExploreScene],
]);
