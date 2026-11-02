import { Suspense } from "react";
import { SidekickApp } from "../../components/sidekick/SidekickApp";
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="ls-loading-shell" role="status">
          Opening your workspace…
        </div>
      }
    >
      <SidekickApp view="agent" initialKind="sql_migration" />
    </Suspense>
  );
}
