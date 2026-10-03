"use client";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { University, countryName } from "@/lib/domain";
import { UniversityLogo } from "./primitives";
import { Metric, Coverage } from "./metrics";
import { useCollege } from "./provider";
export function QuickView({
  university: u,
  onClose,
}: {
  university: University | null;
  onClose: () => void;
}) {
  const s = useCollege();
  return (
    <Sheet open={!!u} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="source-sheet">
        {u && (
          <>
            <UniversityLogo university={u} size="xl" />
            <SheetTitle>{u.name}</SheetTitle>
            <SheetDescription>
              {u.city} · {countryName(u.country_code)}
            </SheetDescription>
            <p>{u.description}</p>
            <div className="intelligence-metrics">
              <Metric university={u} metricKey="admission" />
              <Metric university={u} metricKey="tuition" />
              <Metric university={u} metricKey="aid_recipients" />
              <Metric university={u} metricKey="enrollment" />
            </div>
            <Coverage university={u} />
            <div className="control-row">
              <button
                className="button button-secondary"
                onClick={() => s.toggleCompare(u.id)}
              >
                {s.compare.includes(u.id)
                  ? "Remove from comparison"
                  : "Add to comparison"}
              </button>
              <Link
                className="button button-primary"
                href={"/university/" + u.slug}
                onClick={onClose}
              >
                Full profile →
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
