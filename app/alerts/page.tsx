import type { Metadata } from "next";
import { AlertsPage } from "@/features/alerts/AlertsPage";

export const metadata: Metadata = { title: "Alerts" };

export default function Alerts() {
  return <AlertsPage />;
}
