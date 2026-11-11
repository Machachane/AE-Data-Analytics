import { useGetDeliveries, getGetDeliveriesQueryKey } from "@workspace/api-client-react";
import { Dashboard, type DashboardConfig } from "@/components/dashboard";

const cfg: DashboardConfig = {
  module: "Deliveries", noun: "Deliveries", event: "Delivery", sheet: "OD_DELIVERIES", defaultTo: "2026-10-31",
  rankColor: "#1d5fd6", regionKind: "bar",
  columns: ["customer", "model", "quantity", "date", "manufacturer", "engine", "region"],
  title: "Deliveries | AE+ Data Analytics",
  description: "Aircraft deliveries by customer, model and region from the OD_DELIVERIES workbook snapshot.",
  queryKey: getGetDeliveriesQueryKey(),
  useData: (interval) => useGetDeliveries({ query: { queryKey: getGetDeliveriesQueryKey(), refetchInterval: interval ?? false } }),
};

export default function DeliveriesPage() {
  return <Dashboard key="deliveries" cfg={cfg} />;
}
