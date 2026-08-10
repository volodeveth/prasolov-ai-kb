import type { Metadata } from "next";
import { KnowledgeView } from "@/components/KnowledgeView";

export const metadata: Metadata = {
  title: "База знань — Прасолов та Партнери",
};

export default function KnowledgePage() {
  return <KnowledgeView />;
}
