import type { Metadata } from "next";
import { AppShell } from "../../components/AppShell";
import Link from "next/link";
export const metadata: Metadata = { title: "SQL migration review" };
export default function SqlPage() {
  return (
    <>
      <div className="sql-back-link">
        <Link href="/investigate">← Investigation workspace</Link>
        <span>Specialized PostgreSQL migration review</span>
      </div>
      <div className="sql-legacy-workspace">
        <AppShell />
      </div>
    </>
  );
}
