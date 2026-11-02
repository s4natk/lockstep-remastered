import type { Metadata } from "next";
import { Suspense } from "react";
import { Workspace } from "../../components/investigation/Workspace";
export const metadata: Metadata = { title: "Investigate a failure" };
export default function InvestigatePage() {
  return (
    <Suspense
      fallback={
        <div className="workspace-loading" role="status">
          Opening investigation workspace…
        </div>
      }
    >
      <Workspace />
    </Suspense>
  );
}
