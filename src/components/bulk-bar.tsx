import { useCallback, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/** Row-selection state shared by every bulk-editable table. */
export function useRowSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectedIds = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected],
  );

  const allSelected = visibleIds.length > 0 && selectedIds.length === visibleIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleAll = useCallback(
    (on: boolean) => setSelected(on ? new Set(visibleIds) : new Set()),
    [visibleIds],
  );

  return { selected, selectedIds, count: selectedIds.length, toggle, toggleAll, clear, allSelected, someSelected };
}

export function SelectAllCheckbox({
  allSelected,
  someSelected,
  onChange,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Checkbox
      aria-label="Select all rows"
      checked={allSelected ? true : someSelected ? "indeterminate" : false}
      onCheckedChange={(v) => onChange(v === true)}
    />
  );
}

export function RowCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <Checkbox
      aria-label={`Select ${label}`}
      checked={checked}
      onCheckedChange={(v) => onChange(v === true)}
    />
  );
}

/** Sticky action strip that appears once rows are selected. */
export function BulkBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  noun: string;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/60 px-3 py-2">
      <span className="text-sm font-medium">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
}
