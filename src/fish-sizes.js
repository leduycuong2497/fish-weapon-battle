// Kích thước cá — cấu hình nằm trong src/appsettings.js (mục 1. KÍCH THƯỚC CÁ).
import { FISH_SIZES } from './appsettings.js';

export { FISH_SIZES };

/** Hệ số kích thước của một loài theo cấu hình FISH_SIZES. */
export function speciesSize(species) {
  const extra = FISH_SIZES.perSpecies[species.id] ?? 1;
  return (FISH_SIZES.equal ? FISH_SIZES.scale : species.size) * extra;
}
