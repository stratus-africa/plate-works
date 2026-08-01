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

/**
 * Reserved edge band (inches) on every side of a plate or offcut that the press
 * clamps onto. No artwork may be nested inside this band, and it is never
 * recovered as a reusable offcut.
 */
export const CLAMP_MARGIN = 1.5;

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
  /** Reserved clamp band on each edge (inches). */
  clampMargin: number;
  /** Nestable area inside the clamp band. */
  usableWidth: number;
  usableHeight: number;
  clampArea: number;
}

export interface JobOptimization extends LayoutResult {
  quantity: number;
  platesRequired: number;
  piecesOnLastPlate: number;
  totalWasteArea: number;
  fits: boolean;
}

export function buildLayout(
  pieceW: number,
  pieceH: number,
  plateW: number,
  plateH: number,
  rotated: boolean,
  clampMargin = CLAMP_MARGIN,
): LayoutResult {
  const clamp = Math.max(0, clampMargin);
  const usableW = Math.max(plateW - clamp * 2, 0);
  const usableH = Math.max(plateH - clamp * 2, 0);
  const across = pieceW > 0 ? Math.floor(usableW / pieceW) : 0;
  const down = pieceH > 0 ? Math.floor(usableH / pieceH) : 0;
  const piecesPerPlate = across * down;
  const plateArea = plateW * plateH;
  const clampArea = Math.max(plateArea - usableW * usableH, 0);
  const usedArea = piecesPerPlate * pieceW * pieceH;
  const wasteArea = Math.max(plateArea - usedArea, 0);

  const placements: Placement[] = [];
  let index = 0;
  for (let row = 0; row < down; row++) {
    for (let col = 0; col < across; col++) {
      placements.push({
        x: clamp + col * pieceW,
        y: clamp + row * pieceH,
        width: pieceW,
        height: pieceH,
        index: index++,
      });
    }
  }

  // Remaining usable material is split into a right strip and a bottom strip
  // (guillotine cuts). The clamp band is never offered as a reusable offcut.
  const offcuts: OffcutRegion[] = [];
  const usedW = across * pieceW;
  const usedH = down * pieceH;
  const rightW = usableW - usedW;
  const bottomH = usableH - usedH;
  if (rightW > 0.01 && usedH > 0.01) {
    offcuts.push({
      x: clamp + usedW,
      y: clamp,
      width: rightW,
      height: usedH,
      label: "Side offcut",
    });
  }
  if (bottomH > 0.01 && usableW > 0.01) {
    offcuts.push({
      x: clamp,
      y: clamp + usedH,
      width: usableW,
      height: bottomH,
      label: "Bottom offcut",
    });
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
    clampMargin: clamp,
    usableWidth: usableW,
    usableHeight: usableH,
    clampArea,
  };
}

/** Compares both orientations and returns the layout with the best utilisation. */
export function bestLayout(
  effectiveWidth: number,
  effectiveHeight: number,
  plateWidth = MASTER_PLATE_WIDTH,
  plateHeight = MASTER_PLATE_HEIGHT,
  clampMargin = CLAMP_MARGIN,
): LayoutResult {
  const normal = buildLayout(effectiveWidth, effectiveHeight, plateWidth, plateHeight, false, clampMargin);
  const turned = buildLayout(effectiveHeight, effectiveWidth, plateWidth, plateHeight, true, clampMargin);
  return turned.piecesPerPlate > normal.piecesPerPlate ? turned : normal;
}

/** Full job-level optimisation including plate count for a given quantity. */
export function optimizeJob(
  effectiveWidth: number,
  effectiveHeight: number,
  quantity: number,
  plateWidth = MASTER_PLATE_WIDTH,
  plateHeight = MASTER_PLATE_HEIGHT,
  clampMargin = CLAMP_MARGIN,
): JobOptimization {
  const layout = bestLayout(effectiveWidth, effectiveHeight, plateWidth, plateHeight, clampMargin);
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
 * either orientation once the machine clamp band is reserved on every edge,
 * choosing the SMALLEST usable one to preserve big sheets.
 */
export function findBestOffcut<T extends OffcutCandidate>(
  offcuts: T[],
  requiredWidth: number,
  requiredHeight: number,
  clampMargin = CLAMP_MARGIN,
): T | null {
  const reqW = requiredWidth + clampMargin * 2;
  const reqH = requiredHeight + clampMargin * 2;
  const usable = offcuts.filter(
    (o) =>
      (o.width >= reqW && o.height >= reqH) || (o.width >= reqH && o.height >= reqW),
  );
  if (usable.length === 0) return null;
  return usable.reduce((best, cur) => (cur.area < best.area ? cur : best));
}

export const fmtIn = (n: number) => `${Number(n).toFixed(2)}"`;
export const fmtArea = (n: number) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} in²`;
export const fmtPct = (n: number) => `${Number(n).toFixed(1)}%`;
