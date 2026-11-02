import type { Metadata } from "next";
import { HistoryView } from "../../components/investigation/HistoryView";
export const metadata: Metadata = { title: "Investigation history" };
export default function HistoryPage() {
  return <HistoryView />;
}
