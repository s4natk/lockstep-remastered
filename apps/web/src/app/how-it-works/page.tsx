import type { Metadata } from "next";
import { HowItWorks } from "../../components/investigation/HowItWorks";
export const metadata: Metadata = { title: "How it works" };
export default function HowItWorksPage() {
  return <HowItWorks />;
}
