import { Suspense } from "react";
import { SidekickApp } from "../../components/sidekick/SidekickApp";
import { LoadingShell } from "../../components/sidekick/LoadingShell";
export default function Page() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <SidekickApp view="agent" initialKind="sql_migration" />
    </Suspense>
  );
}
