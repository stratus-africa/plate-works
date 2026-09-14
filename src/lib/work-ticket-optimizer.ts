export interface WorkTicketJob {
  id: string;
  workTicketId: string;
  workTicketNumber: string;
  sourceRowNumber?: number;
  itemName: string;
  description: string;
  length: number;
  width: number;
  quantity: number;
  completedQuantity?: number;
  remainingQuantity?: number;
}

export interface JobRecommendation {
  job: WorkTicketJob;
  orientation: "normal" | "rotated";
  pieceLength: number;
  pieceWidth: number;
  areaEach: number;
  requestedQuantity: number;
  recommendedQuantity: number;
  totalArea: number;
  fits: boolean;
  reason?: string;
}

export interface PlatePlacement {
  jobId: string;
  workTicketId: string;
  workTicketNumber: string;
  itemName: string;
  x: number;
  y: number;
  length: number;
  width: number;
  index: number;
}

export interface PlatePlan {
  plateNumber: number;
  length: number;
  width: number;
  area: number;
  usedArea: number;
  wastage: number;
  utilisation: number;
  placements: PlatePlacement[];
}

export interface PlateOptimisationResult {
  recommendations: JobRecommendation[];
  plates: PlatePlan[];
  selectedArea: number;
  totalPlateArea: number;
  wastage: number;
  utilisation: number;
  unallocatedQuantity: number;
}

function fitCount(plateLength: number, plateWidth: number, length: number, width: number) {
  if (length <= 0 || width <= 0) return { count: 0, orientation: "normal" as const };
  const normal = Math.floor(plateLength / length) * Math.floor(plateWidth / width);
  const rotated = Math.floor(plateLength / width) * Math.floor(plateWidth / length);
  return rotated > normal
    ? { count: rotated, orientation: "rotated" as const }
    : { count: normal, orientation: "normal" as const };
}

export function recommendJobs(jobs: WorkTicketJob[], plateLength: number, plateWidth: number) {
  return jobs.map((job): JobRecommendation => {
    const normal = fitCount(plateLength, plateWidth, job.length, job.width);
    const rotated = fitCount(plateLength, plateWidth, job.width, job.length);
    const chosen = normal.count >= rotated.count ? normal : rotated;
    const pieceLength = chosen.orientation === "rotated" ? job.width : job.length;
    const pieceWidth = chosen.orientation === "rotated" ? job.length : job.width;
    const areaEach = job.length * job.width;
    const available = Math.max(0, job.remainingQuantity ?? job.quantity);
    const maxByArea = areaEach > 0 ? Math.floor((plateLength * plateWidth) / areaEach) : 0;
    const recommendedQuantity = Math.min(available, chosen.count, maxByArea);

    return {
      job,
      orientation: chosen.orientation,
      pieceLength,
      pieceWidth,
      areaEach,
      requestedQuantity: available,
      recommendedQuantity,
      totalArea: recommendedQuantity * areaEach,
      fits: chosen.count > 0,
      reason:
        chosen.count === 0 ? `Job ${job.length} × ${job.width} does not physically fit on this plate.` : undefined,
    };
  });
}

function chooseCombination(recommendations: JobRecommendation[], plateArea: number) {
  const candidates = [...recommendations]
    .filter((r) => r.fits && r.recommendedQuantity > 0)
    .sort((a, b) => b.areaEach - a.areaEach);

  const selected = new Map<string, number>();
  let remainingArea = plateArea;

  // First pass: largest jobs first.
  for (const rec of candidates) {
    const qty = Math.min(rec.recommendedQuantity, Math.floor(remainingArea / rec.areaEach));
    if (qty > 0) {
      selected.set(rec.job.id, qty);
      remainingArea -= qty * rec.areaEach;
    }
  }

  // Second pass: smallest jobs fill gaps left by the first pass.
  for (const rec of [...candidates].sort((a, b) => a.areaEach - b.areaEach)) {
    const current = selected.get(rec.job.id) ?? 0;
    const extra = Math.min(rec.recommendedQuantity - current, Math.floor(remainingArea / rec.areaEach));
    if (extra > 0) {
      selected.set(rec.job.id, current + extra);
      remainingArea -= extra * rec.areaEach;
    }
  }

  return selected;
}

export function optimiseWorkTicket(
  jobs: WorkTicketJob[],
  plateLength: number,
  plateWidth: number,
): PlateOptimisationResult {
  const plateArea = Math.max(0, plateLength * plateWidth);
  const recommendations = recommendJobs(jobs, plateLength, plateWidth);
  if (!plateArea) {
    return {
      recommendations,
      plates: [],
      selectedArea: 0,
      totalPlateArea: 0,
      wastage: 0,
      utilisation: 0,
      unallocatedQuantity: jobs.reduce((n, j) => n + (j.remainingQuantity ?? j.quantity), 0),
    };
  }

  const remaining = new Map(jobs.map((j) => [j.id, Math.max(0, j.remainingQuantity ?? j.quantity)]));
  const plates: PlatePlan[] = [];
  let plateNumber = 1;

  while ([...remaining.values()].some((q) => q > 0)) {
    const available = recommendations.map((r) => ({
      ...r,
      recommendedQuantity: Math.min(r.recommendedQuantity, remaining.get(r.job.id) ?? 0),
    }));
    const combination = chooseCombination(available, plateArea);
    if (combination.size === 0) break;

    const placements: PlatePlacement[] = [];
    const occupied: Array<{ x: number; y: number; length: number; width: number }> = [];
    const canPlace = (x: number, y: number, length: number, width: number) =>
      x + length <= plateLength + 1e-9 &&
      y + width <= plateWidth + 1e-9 &&
      occupied.every((p) => x + length <= p.x || p.x + p.length <= x || y + width <= p.y || p.y + p.width <= y);

    for (const rec of available) {
      const qty = combination.get(rec.job.id) ?? 0;
      for (let i = 0; i < qty; i++) {
        let placed = false;
        const orientations =
          rec.orientation === "rotated"
            ? [
                { length: rec.pieceLength, width: rec.pieceWidth },
                { length: rec.pieceWidth, width: rec.pieceLength },
              ]
            : [
                { length: rec.pieceLength, width: rec.pieceWidth },
                { length: rec.pieceWidth, width: rec.pieceLength },
              ];

        for (const candidate of orientations) {
          const stepX = Math.max(0.25, Math.min(candidate.length, 1));
          const stepY = Math.max(0.25, Math.min(candidate.width, 1));
          for (let y = 0; y <= plateWidth - candidate.width + 1e-9 && !placed; y += stepY) {
            for (let x = 0; x <= plateLength - candidate.length + 1e-9 && !placed; x += stepX) {
              if (canPlace(x, y, candidate.length, candidate.width)) {
                occupied.push({ x, y, ...candidate });
                placements.push({
                  jobId: rec.job.id,
                  workTicketId: rec.job.workTicketId,
                  workTicketNumber: rec.job.workTicketNumber,
                  itemName: rec.job.itemName,
                  x,
                  y,
                  length: candidate.length,
                  width: candidate.width,
                  index: placements.length + 1,
                });
                placed = true;
              }
            }
          }
          if (placed) break;
        }
        if (!placed) break;
      }
    }

    if (!placements.length) break;
    const usedArea = placements.reduce((sum, p) => sum + p.length * p.width, 0);
    for (const p of placements) remaining.set(p.jobId, Math.max(0, (remaining.get(p.jobId) ?? 0) - 1));
    plates.push({
      plateNumber,
      length: plateLength,
      width: plateWidth,
      area: plateArea,
      usedArea,
      wastage: Math.max(0, plateArea - usedArea),
      utilisation: (usedArea / plateArea) * 100,
      placements,
    });
    plateNumber += 1;
  }

  const selectedArea = plates.reduce((sum, p) => sum + p.usedArea, 0);
  const totalPlateArea = plates.reduce((sum, p) => sum + p.area, 0);
  return {
    recommendations,
    plates,
    selectedArea,
    totalPlateArea,
    wastage: Math.max(0, totalPlateArea - selectedArea),
    utilisation: totalPlateArea ? (selectedArea / totalPlateArea) * 100 : 0,
    unallocatedQuantity: [...remaining.values()].reduce((a, b) => a + b, 0),
  };
}
