"use client";

import { useEffect, useRef, useState } from "react";

import { reviewToJson } from "../../../lib/exportReview";
import type { ReviewRecord } from "../../../lib/review";
import { CodeBlock } from "../../ui/CodeBlock";
import { CopyButton } from "../../ui/CopyButton";
import { Segmented } from "../../ui/Segmented";
import { OverviewEmpty, OverviewTab } from "./OverviewTab";
import { RolloutTab } from "./RolloutTab";
import { SourcesTab } from "./SourcesTab";
import { TraceTab } from "./TraceTab";
import styles from "./ReviewInspector.module.css";

export type InspectorTab = "overview" | "rollout" | "sources" | "trace" | "raw";

interface ReviewInspectorProps {
  record: ReviewRecord | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  activeHazard: string | null;
  highlightSource: number | null;
  onSelectHazard: (key: string) => void;
  onJumpStatement: (index: number) => void;
  onOpenSource: (index: number) => void;
  onExamples: () => void;
}

export function ReviewInspector({
  record,
  tab,
  onTab,
  activeHazard,
  highlightSource,
  onSelectHazard,
  onJumpStatement,
  onOpenSource,
  onExamples,
}: ReviewInspectorProps) {
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === "sources" && highlightSource !== null) {
      highlightRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [highlightSource, tab]);

  return (
    <aside className={styles.root} aria-label="Review inspector">
      <header className={styles.header}>
        <Segmented
          label="Inspector"
          value={tab}
          size="sm"
          stretch
          onChange={onTab}
          options={[
            { value: "overview", label: "Overview" },
            { value: "rollout", label: "Rollout", badge: record?.note ? undefined : record?.draft ? "…" : undefined },
            { value: "sources", label: "Sources", badge: badge(record?.citations?.length) },
            { value: "trace", label: "Trace" },
            { value: "raw", label: "Raw" },
          ]}
        />
      </header>
      <div ref={highlightRef} className={styles.body}>
        {record === null ? (
          tab === "overview" ? <OverviewEmpty onExamples={onExamples} /> : <p className={styles.empty}>Run a review first.</p>
        ) : tab === "overview" ? (
          <OverviewTab
            record={record}
            activeHazard={activeHazard}
            onSelectHazard={(_hazard, key) => onSelectHazard(key)}
          />
        ) : tab === "rollout" ? (
          <RolloutTab record={record} onOpenSource={onOpenSource} />
        ) : tab === "sources" ? (
          <SourcesTab record={record} highlight={highlightSource} onJumpStatement={onJumpStatement} />
        ) : tab === "trace" ? (
          <TraceTab record={record} />
        ) : (
          <RawTab record={record} />
        )}
      </div>
    </aside>
  );
}

function RawTab({ record }: { record: ReviewRecord }) {
  const [view, setView] = useState<"json" | "note">("json");
  const json = reviewToJson(record);
  return (
    <div className={styles.raw}>
      <Segmented
        label="Raw view"
        value={view}
        size="sm"
        onChange={setView}
        options={[
          { value: "json", label: "JSON" },
          { value: "note", label: "Note" },
        ]}
      />
      {view === "json" ? (
        <CodeBlock
          code={json}
          language="text"
          maxHeight={560}
          caption="Review payload"
          actions={<CopyButton text={json} label="Copy JSON" />}
        />
      ) : (
        <CodeBlock
          code={record.note ?? record.draft ?? ""}
          language="text"
          maxHeight={560}
          caption={record.note ? "Citation-checked note" : "Draft"}
          actions={<CopyButton text={record.note ?? record.draft ?? ""} label="Copy note" />}
        />
      )}
    </div>
  );
}

function badge(count: number | undefined): string | undefined {
  return count && count > 0 ? String(count) : undefined;
}
