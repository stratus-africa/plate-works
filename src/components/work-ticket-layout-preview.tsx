export interface WorkTicketJob {
  id: string;
  jobNumber: string;
  itemName: string;
  description: string;
  length: number;
  width: number;
  quantity: number;
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
  jobNumber: string;
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
  plateArea: number;
  wastage: number;
  utilisation: number;
  unallocatedQuantity: number;
}

function countFit(plateLength: number, plateWidth: number, pieceLength: number, pieceWidth: number) {
  if (pieceLength <= 0 || pieceWidth <= 0) return { count: 0, orientation: "normal" as const };
  const normal = Math.floor(plateLength / pieceLength) * Math.floor(plateWidth / pieceWidth);
  const rotated = Math.floor(plateLength / pieceWidth) * Math.floor(plateWidth / pieceLength);
  return rotated > normal
    ? { count: rotated, orientation: "rotated" as const }
    : { count: normal, orientation: "normal" as const };
}

export function recommendJobs(jobs: WorkTicketJob[], plateLength: number, plateWidth: number): JobRecommendation[] {
  return jobs.map((job) => {
    const normalCount = countFit(plateLength, plateWidth, job.length, job.width);
    const rotatedCount = countFit(plateLength, plateWidth, job.width, job.length);
    const chosen = normalCount.count >= rotatedCount.count ? normalCount : rotatedCount;
    const pieceLength = chosen.orientation === "rotated" ? job.width : job.length;
    const pieceWidth = chosen.orientation === "rotated" ? job.length : job.width;
    const maxByArea = Math.floor((plateLength * plateWidth) / (job.length * job.width));
    const recommendedQuantity = Math.min(job.quantity, chosen.count, maxByArea);
    return {
      job,
      orientation: chosen.orientation,
      pieceLength,
      pieceWidth,
      areaEach: job.length * job.width,
      requestedQuantity: job.quantity,
      recommendedQuantity,
      totalArea: recommendedQuantity * job.length * job.width,
      fits: chosen.count > 0,
      reason: chosen.count === 0 ? `Job ${job.length} × ${job.width} does not fit on this plate.` : undefined,
    };
  });
}

function bestCombination(recommendations: JobRecommendation[], plateArea: number) {
  // Greedy first-fit by area, then try a small swap pass. This is deterministic,
  // fast for large work tickets, and respects the physical plate dimensions below.
  const sorted = [...recommendations]
    .filter((r) => r.fits && r.recommendedQuantity > 0)
    .sort((a, b) => b.areaEach - a.areaEach);

  const chosen = new Map<string, number>();
  let remaining = plateArea;
  for (const rec of sorted) {
    const qty = Math.min(rec.recommendedQuantity, Math.floor(remaining / rec.areaEach));
    if (qty > 0) {
      chosen.set(rec.job.id, qty);
      remaining -= qty * rec.areaEach;
    }
  }

  // Fill remaining space with smaller jobs that were skipped by the greedy pass.
  for (const rec of [...sorted].sort((a, b) => a.areaEach - b.areaEach)) {
    const already = chosen.get(rec.job.id) ?? 0;
    const room = Math.floor(remaining / rec.areaEach);
    const extra = Math.min(room, rec.recommendedQuantity - already);
    if (extra > 0) {
      chosen.set(rec.job.id, already + extra);
      remaining -= extra * rec.areaEach;
    }
  }
  return chosen;
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
      plateArea: 0,
      wastage: 0,
      utilisation: 0,
      unallocatedQuantity: jobs.reduce((n, j) => n + j.quantity, 0),
    };
  }

  const remaining = new Map(jobs.map((j) => [j.id, j.quantity]));
  const plates: PlatePlan[] = [];
  let plateNumber = 1;

  while ([...remaining.values()].some((q) => q > 0)) {
    const availableJobs = recommendations.map((r) => ({
      ...r,
      recommendedQuantity: Math.min(r.recommendedQuantity, remaining.get(r.job.id) ?? 0),
    }));
    const combination = bestCombination(availableJobs, plateArea);
    if (combination.size === 0) break;

    const placements: PlatePlacement[] = [];
    const occupied: Array<{ x: number; y: number; length: number; width: number }> = [];

    const canPlace = (x: number, y: number, length: number, width: number) => {
      if (x + length > plateLength + 1e-9 || y + width > plateWidth + 1e-9) return false;
      return occupied.every((p) => x + length <= p.x || p.x + p.length <= x || y + width <= p.y || p.y + p.width <= y);
    };

    for (const rec of availableJobs) {
      const qty = combination.get(rec.job.id) ?? 0;
      for (let i = 0; i < qty; i++) {
        let placed = false;
        const candidates = [
          { length: rec.pieceLength, width: rec.pieceWidth },
          { length: rec.pieceWidth, width: rec.pieceLength },
        ];
        for (const candidate of candidates) {
          for (
            let y = 0;
            y <= plateWidth - candidate.width + 1e-9 && !placed;
            y += Math.max(0.25, Math.min(candidate.width, 1))
          ) {
            for (
              let x = 0;
              x <= plateLength - candidate.length + 1e-9 && !placed;
              x += Math.max(0.25, Math.min(candidate.length, 1))
            ) {
              if (canPlace(x, y, candidate.length, candidate.width)) {
                occupied.push({ x, y, ...candidate });
                placements.push({
                  jobId: rec.job.id,
                  jobNumber: rec.job.jobNumber,
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

    if (placements.length === 0) break;
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
    plateNumber++;
  }

  const selectedArea = plates.reduce((sum, p) => sum + p.usedArea, 0);
  const totalPlateArea = plates.reduce((sum, p) => sum + p.area, 0);
  return {
    recommendations,
    plates,
    selectedArea,
    plateArea: totalPlateArea,
    wastage: Math.max(0, totalPlateArea - selectedArea),
    utilisation: totalPlateArea ? (selectedArea / totalPlateArea) * 100 : 0,
    unallocatedQuantity: [...remaining.values()].reduce((a, b) => a + b, 0),
  };
}
