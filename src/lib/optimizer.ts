/**
 * Plate optimisation engine.
 *
 * Master plates are fixed at 42 x 60 inches (configurable per batch).
 * Given the effective finished size (artwork + margins) the engine computes how
 * many pieces fit on one master sheet, comparing both orientations (0deg and
 * 90deg rotation) and keeping the layout with the highest material utilisation.
 *
 * The result is intentionally pure and side-effect free so future AI modules can
 * reuse it for nesting, waste prediction and layout recommendation.
 */

export const MASTER_PLATE_WIDTH = 42;
export const MASTER_PLATE_HEIGHT = 60;

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

export interface OffcutRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface LayoutResult {
  /** Effective piece width used for the layout (already rotated if applicable). */
  pieceWidth: number;
  pieceHeight: number;
  rotated: boolean;
  across: number;
  down: number;
  piecesPerPlate: number;
  usedArea: number;
  plateArea: number;
  wasteArea: number;
  utilization: number;
  wastePercent: number;
  placements: Placement[];
  offcuts: OffcutRegion[];
}

export interface JobOptimization extends LayoutResult {
  quantity: number;
  platesRequired: number;
  piecesOnLastPlate: number;
  totalWasteArea: number;
  fits: boolean;
}

function buildLayout(
  pieceW: number,
  pieceH: number,
  plateW: number,
  plateH: number,
  rotated: boolean,
): LayoutResult {
  const across = pieceW > 0 ? Math.floor(plateW / pieceW) : 0;
  const down = pieceH > 0 ? Math.floor(plateH / pieceH) : 0;
  const piecesPerPlate = across * down;
  const plateArea = plateW * plateH;
  const usedArea = piecesPerPlate * pieceW * pieceH;
  const wasteArea = Math.max(plateArea - usedArea, 0);

  const placements: Placement[] = [];
  let index = 0;
  for (let row = 0; row < down; row++) {
    for (let col = 0; col < across; col++) {
      placements.push({
        x: col * pieceW,
        y: row * pieceH,
        width: pieceW,
        height: pieceH,
        index: index++,
      });
    }
  }

  // Remaining material is split into a right strip and a bottom strip (guillotine cuts).
  const offcuts: OffcutRegion[] = [];
  const usedW = across * pieceW;
  const usedH = down * pieceH;
  const rightW = plateW - usedW;
  const bottomH = plateH - usedH;
  if (rightW > 0.01 && usedH > 0.01) {
    offcuts.push({ x: usedW, y: 0, width: rightW, height: usedH, label: "Side offcut" });
  }
  if (bottomH > 0.01 && plateW > 0.01) {
    offcuts.push({ x: 0, y: usedH, width: plateW, height: bottomH, label: "Bottom offcut" });
  }

  return {
    pieceWidth: pieceW,
    pieceHeight: pieceH,
    rotated,
    across,
    down,
    piecesPerPlate,
    usedArea,
    plateArea,
    wasteArea,
    utilization: plateArea > 0 ? (usedArea / plateArea) * 100 : 0,
    wastePercent: plateArea > 0 ? (wasteArea / plateArea) * 100 : 0,
    placements,
    offcuts,
  };
}

/** Compares both orientations and returns the layout with the best utilisation. */
export function bestLayout(
  effectiveWidth: number,
  effectiveHeight: number,
  plateWidth = MASTER_PLATE_WIDTH,
  plateHeight = MASTER_PLATE_HEIGHT,
): LayoutResult {
  const normal = buildLayout(effectiveWidth, effectiveHeight, plateWidth, plateHeight, false);
  const turned = buildLayout(effectiveHeight, effectiveWidth, plateWidth, plateHeight, true);
  return turned.piecesPerPlate > normal.piecesPerPlate ? turned : normal;
}

/** Full job-level optimisation including plate count for a given quantity. */
export function optimizeJob(
  effectiveWidth: number,
  effectiveHeight: number,
  quantity: number,
  plateWidth = MASTER_PLATE_WIDTH,
  plateHeight = MASTER_PLATE_HEIGHT,
): JobOptimization {
  const layout = bestLayout(effectiveWidth, effectiveHeight, plateWidth, plateHeight);
  const qty = Math.max(1, Math.floor(quantity || 1));
  const fits = layout.piecesPerPlate > 0;
  const platesRequired = fits ? Math.ceil(qty / layout.piecesPerPlate) : 0;
  const piecesOnLastPlate = fits ? qty - (platesRequired - 1) * layout.piecesPerPlate : 0;
  const totalWasteArea = fits
    ? platesRequired * layout.plateArea - qty * layout.pieceWidth * layout.pieceHeight
    : 0;

  return {
    ...layout,
    quantity: qty,
    platesRequired,
    piecesOnLastPlate,
    totalWasteArea,
    fits,
  };
}

export interface OffcutCandidate {
  id: string;
  offcut_code: string;
  width: number;
  height: number;
  area: number;
}

/**
 * Intelligent offcut search: any offcut that can hold the required piece in
 * either orientation, choosing the SMALLEST usable one to preserve big sheets.
 */
export function findBestOffcut<T extends OffcutCandidate>(
  offcuts: T[],
  requiredWidth: number,
  requiredHeight: number,
): T | null {
  const usable = offcuts.filter(
    (o) =>
      (o.width >= requiredWidth && o.height >= requiredHeight) ||
      (o.width >= requiredHeight && o.height >= requiredWidth),
  );
  if (usable.length === 0) return null;
  return usable.reduce((best, cur) => (cur.area < best.area ? cur : best));
}

export const fmtIn = (n: number) => `${Number(n).toFixed(2)}"`;
export const fmtArea = (n: number) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} in²`;
export const fmtPct = (n: number) => `${Number(n).toFixed(1)}%`;
