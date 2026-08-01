import { z } from "zod";

export interface ExistingCustomer {
  company: string | null;
  email: string | null;
}

export interface ParsedCustomerRow {
  line: number;
  values: {
    company: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  status: "new" | "duplicate" | "invalid";
  reason?: string;
}

const rowSchema = z.object({
  company: z.string().trim().min(2).max(120),
  contact_person: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional(),
});

/** RFC4180-ish CSV line splitter supporting quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const ALIASES: Record<string, keyof ParsedCustomerRow["values"]> = {
  company: "company",
  "company name": "company",
  customer: "company",
  name: "company",
  contact: "contact_person",
  "contact person": "contact_person",
  contact_person: "contact_person",
  phone: "phone",
  telephone: "phone",
  mobile: "phone",
  email: "email",
  "e-mail": "email",
  address: "address",
};

/**
 * Parses a customer CSV and flags rows that duplicate an existing customer
 * (by company name or email) or another row in the same file.
 */
export function parseCustomerCsv(
  text: string,
  existing: ExistingCustomer[],
): ParsedCustomerRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const mapped = headers.map((h) => ALIASES[h]);
  if (!mapped.includes("company")) {
    throw new Error('CSV must include a "company" column');
  }

  const seenCompany = new Set(
    existing.map((c) => (c.company ?? "").toLowerCase().trim()).filter(Boolean),
  );
  const seenEmail = new Set(
    existing.map((c) => (c.email ?? "").toLowerCase().trim()).filter(Boolean),
  );

  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line);
    const raw: Record<string, string> = {};
    mapped.forEach((key, idx) => {
      if (key) raw[key] = cells[idx] ?? "";
    });

    const base: ParsedCustomerRow = {
      line: i + 2,
      values: {
        company: raw.company ?? "",
        contact_person: raw.contact_person || null,
        phone: raw.phone || null,
        email: raw.email || null,
        address: raw.address || null,
      },
      status: "new",
    };

    const parsed = rowSchema.safeParse({
      company: raw.company ?? "",
      contact_person: raw.contact_person ?? "",
      phone: raw.phone ?? "",
      email: raw.email ?? "",
      address: raw.address ?? "",
    });
    if (!parsed.success) {
      return { ...base, status: "invalid", reason: parsed.error.issues[0].message };
    }

    const company = parsed.data.company.toLowerCase();
    const email = (parsed.data.email ?? "").toLowerCase();
    if (seenCompany.has(company)) {
      return { ...base, status: "duplicate", reason: "Duplicate company" };
    }
    if (email && seenEmail.has(email)) {
      return { ...base, status: "duplicate", reason: "Duplicate email" };
    }
    seenCompany.add(company);
    if (email) seenEmail.add(email);

    return {
      ...base,
      values: {
        company: parsed.data.company,
        contact_person: parsed.data.contact_person || null,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        address: parsed.data.address || null,
      },
    };
  });
}
