export interface WorkTicketJob {
  id: string;
  jobNumber: string;
  description: string;
  length: number;
  width: number;
  quantity: number;
  selectedQuantity?: number;
}

export interface WorkTicketPlacement {
  jobId: string;
  jobNumber: string;
  description: string;
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
  pieceArea: number;
  index: number;
}

export interface WorkTicketPlan {
  plateWidth: number;
  plateHeight: number;
  plateArea: number;
  placements: WorkTicketPlacement[];
  totalArea: number;
  wastage: number;
  utilisation: number;
  wastagePercent: number;
  selectedByJob: Record<string, number>;
  unallocatedByJob: Record<string, number>;
}

export interface Recommendation extends WorkTicketJob {
  recommendedQuantity: number;
  area: number;
  totalArea: number;
  fit: "fits" | "partial" | "does-not-fit";
  reason: string;
}

const EPSILON = 0.000001;

export function normaliseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseWorkTicketCsv(text: string): WorkTicketJob[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => normaliseHeader(h));
  const findHeader = (...names: string[]) => {
    const wanted = names.map(normaliseHeader);
    const index = headers.findIndex((h) => wanted.includes(h));
    return index;
  };

  const jobIndex = findHeader("job number", "job", "job no", "job #", "job_number", "jobnumber");
  const descriptionIndex = findHeader("description", "job name", "product", "item", "job description");
  const lengthIndex = findHeader("length", "l", "job length", "length (in)", "length in");
  const widthIndex = findHeader("width", "w", "job width", "width (in)", "width in");
  const quantityIndex = findHeader("quantity", "qty", "units", "pieces", "piece quantity");

  if (lengthIndex < 0 || widthIndex < 0) {
    throw new Error("CSV must contain Length and Width columns. Optional columns: Job Number, Description and Quantity.");
  }

  return rows.slice(1).map((row, index) => {
    const length = normaliseNumber(row[lengthIndex]);
    const width = normaliseNumber(row[widthIndex]);
    const quantity = Math.max(1, Math.floor(normaliseNumber(row[quantityIndex]) || 1));
    const jobNumber = String(row[jobIndex] ?? `JOB-${index + 1}`).trim() || `JOB-${index + 1}`;
    const description = String(row[descriptionIndex] ?? jobNumber).trim() || jobNumber;

    return {
      id: `${jobNumber}-${index}`,
      jobNumber,
      description,
      length,
      width,
      quantity,
    };
  }).filter((job) => job.length > 0 && job.width > 0);
}

function normaliseHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((v) => v.length > 0)) rows.push(row);
  return rows;
}

type OpenRow = { y: number; height: number; usedWidth: number };

function tryPlace(
  item: WorkTicketJob,
  plateWidth: number,
  plateHeight: number,
  rows: OpenRow[],
  placements: WorkTicketPlacement[],
  index: number,
): WorkTicketPlacement | null {
  const orientations = [
    { length: item.length, width: item.width, rotated: false },
    { length: item.width, width: item.length, rotated: true },
  ];

  let best: { row?: OpenRow; orientation: typeof orientations[number]; score: number } | null = null;
  for (const orientation of orientations) {
    if (orientation.length > plateHeight + EPSILON || orientation.width > plateWidth + EPSILON) continue;
    for (const row of rows) {
      if (row.usedWidth + orientation.width <= plateWidth + EPSILON && row.y + orientation.length <= plateHeight + EPSILON) {
        const remaining = plateWidth - (row.usedWidth + orientation.width);
        const score = remaining + Math.abs(row.height - orientation.length) * 0.25;
        if (!best || score < best.score) best = { row, orientation, score };
      }
    }
  }

  if (!best) {
    for (const orientation of orientations) {
      if (orientation.length <= plateHeight + EPSILON && orientation.width <= plateWidth + EPSILON) {
        const y = rows.reduce((max, row) => Math.max(max, row.y + row.height), 0);
        if (y + orientation.length <= plateHeight + EPSILON) {
          const row = { y, height: orientation.length, usedWidth: 0 };
          rows.push(row);
          best = { row, orientation, score: plateWidth - orientation.width };
          break;
        }
      }
    }
  }

  if (!best?.row) return null;
  const { row, orientation } = best;
  const placement: WorkTicketPlacement = {
    jobId: item.id,
    jobNumber: item.jobNumber,
    description: item.description,
    x: row.usedWidth,
    y: row.y,
    length: orientation.length,
    width: orientation.width,
    rotated: orientation.rotated,
    pieceArea: item.length * item.width,
    index,
  };
  row.usedWidth += orientation.width;
  row.height = Math.max(row.height, orientation.length);
  placements.push(placement);
  return placement;
}

export function recommendJobs(jobs: WorkTicketJob[], plateWidth: number, plateHeight: number): Recommendation[] {
  const plan = buildPlan(jobs, plateWidth, plateHeight);
  const selected = plan.selectedByJob;

  return jobs.map((job) => {
    const maxFit = selected[job.id] ?? 0;
    const physicallyFits = (job.length <= plateWidth && job.width <= plateHeight) ||
      (job.width <= plateWidth && job.length <= plateHeight);
    const fit = !physicallyFits ? "does-not-fit" : maxFit >= job.quantity ? "fits" : maxFit > 0 ? "partial" : "does-not-fit";
    return {
      ...job,
      recommendedQuantity: maxFit,
      area: job.length * job.width,
      totalArea: job.length * job.width * maxFit,
      fit,
      reason: !physicallyFits
        ? "Neither orientation fits the selected plate."
        : maxFit >= job.quantity
          ? "All requested pieces can be allocated by the current best-fit plan."
          : maxFit > 0
            ? "Only part of the requested quantity fits on this plate."
            : "The piece fits dimensionally, but the current plate is better used by other jobs."
    };
  });
}

export function buildPlan(jobs: WorkTicketJob[], plateWidth: number, plateHeight: number): WorkTicketPlan {
  const safeW = Math.max(0, normaliseNumber(plateWidth));
  const safeH = Math.max(0, normaliseNumber(plateHeight));
  const plateArea = safeW * safeH;
  const rows: OpenRow[] = [];
  const placements: WorkTicketPlacement[] = [];
  const selectedByJob: Record<string, number> = {};
  const unallocatedByJob: Record<string, number> = {};
  let placementIndex = 0;

  const expanded = jobs
    .filter((job) => job.length > 0 && job.width > 0 && job.quantity > 0)
    .flatMap((job) => Array.from({ length: Math.min(job.quantity, 1000) }, () => job));

  expanded.sort((a, b) => (b.length * b.width) - (a.length * a.width));
  for (const item of expanded) {
    const placement = tryPlace(item, safeW, safeH, rows, placements, placementIndex++);
    if (placement) selectedByJob[item.id] = (selectedByJob[item.id] ?? 0) + 1;
  }

  for (const job of jobs) {
    const allocated = selectedByJob[job.id] ?? 0;
    unallocatedByJob[job.id] = Math.max(0, job.quantity - allocated);
  }

  const totalArea = placements.reduce((sum, p) => sum + p.pieceArea, 0);
  const wastage = Math.max(0, plateArea - totalArea);
  const utilisation = plateArea > 0 ? (totalArea / plateArea) * 100 : 0;

  return {
    plateWidth: safeW,
    plateHeight: safeH,
    plateArea,
    placements,
    totalArea,
    wastage,
    utilisation,
    wastagePercent: plateArea > 0 ? (wastage / plateArea) * 100 : 0,
    selectedByJob,
    unallocatedByJob,
  };
}
