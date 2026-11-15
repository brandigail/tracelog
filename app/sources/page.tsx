import type { Metadata } from "next";
import { SourcesPage } from "@/features/sources/SourcesPage";

export const metadata: Metadata = { title: "Sources" };

export default function Sources() {
  return <SourcesPage />;
}
