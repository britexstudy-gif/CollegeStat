"use client";
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { percentageRange } from "@/lib/percentage-range";

export function PercentageRange({
  minimum,
  maximum,
  onCommit,
}: {
  minimum: number;
  maximum: number;
  onCommit: (range: [number, number]) => void;
}) {
  const signature = `${minimum}:${maximum}`;
  const [draft, setDraft] = useState({
    signature,
    lower: String(minimum),
    upper: String(maximum),
  });
  // A reset or URL change replaces the visible draft without remounting focused controls.
  const current =
    draft.signature === signature
      ? draft
      : { signature, lower: String(minimum), upper: String(maximum) };
  const range = percentageRange(
    current.lower === "" ? 0 : Number(current.lower),
    current.upper === "" ? 100 : Number(current.upper),
  );
  const commit = (values: [number, number]) => {
    setDraft({ signature, lower: String(values[0]), upper: String(values[1]) });
    onCommit(values);
  };
  return (
    <div className="percentage-filter">
      <div className="percentage-filter-title">
        <span>Admission rate</span>
        <output>
          {range[0]}–{range[1]}%
        </output>
      </div>
      <Slider
        aria-label="Admission rate"
        min={0}
        max={100}
        step={1}
        value={range}
        onValueChange={(values) =>
          setDraft({
            signature,
            lower: String(values[0]),
            upper: String(values[1]),
          })
        }
        onValueCommit={(values) =>
          commit(percentageRange(values[0], values[1]))
        }
      />
      <div className="percentage-filter-values">
        {(["lower", "upper"] as const).map((bound, index) => (
          <label key={bound}>
            <span>{index === 0 ? "Minimum" : "Maximum"}</span>
            <div>
              <input
                aria-label={
                  index === 0
                    ? "Minimum admission rate"
                    : "Maximum admission rate"
                }
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.1}
                value={current[bound]}
                onChange={(event) =>
                  setDraft({ ...current, [bound]: event.target.value })
                }
                onBlur={() => commit(range)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <span aria-hidden="true">%</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
