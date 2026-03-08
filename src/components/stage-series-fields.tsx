"use client";

import { useMemo, useState } from "react";
import { SERIES_OPTIONS_BY_STAGE, STAGE_OPTIONS, getEducationStageLabel } from "@/lib/constants";

type StageSeriesFieldsProps = {
  stageName?: string;
  seriesName?: string;
  initialStage?: string;
  initialSeries?: string;
  disabled?: boolean;
};

export function StageSeriesFields({
  stageName = "stage",
  seriesName = "series",
  initialStage = "FUNDAMENTAL_1",
  initialSeries = "",
  disabled = false,
}: StageSeriesFieldsProps) {
  const [stage, setStage] = useState(initialStage);
  const seriesOptions = useMemo(
    () => SERIES_OPTIONS_BY_STAGE[stage as keyof typeof SERIES_OPTIONS_BY_STAGE] ?? [],
    [stage],
  );

  return (
    <>
      <select
        name={stageName}
        defaultValue={initialStage}
        className="fasy-input"
        disabled={disabled}
        onChange={(event) => {
          setStage(event.currentTarget.value);
        }}
      >
        {STAGE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {getEducationStageLabel(option)}
          </option>
        ))}
      </select>

      {stage !== "CURSO_LIVRE" ? (
        <select name={seriesName} defaultValue={initialSeries} className="fasy-input" disabled={disabled} required>
          <option value="">Selecione a série</option>
          {seriesOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : null}
    </>
  );
}
