import type { Metadata } from "next";
import { Dashboard } from "@/features/dashboard/Dashboard";

export const metadata: Metadata = { title: "Logs" };

export default function HomePage() {
  return <Dashboard />;
}
