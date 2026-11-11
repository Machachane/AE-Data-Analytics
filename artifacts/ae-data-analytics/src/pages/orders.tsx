import { useGetOrders, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { Dashboard, type DashboardConfig } from "@/components/dashboard";

const cfg: DashboardConfig = {
  module: "Orders", noun: "Orders", event: "Order", sheet: "OD_ORDERS", defaultTo: "2026-10-30",
  rankColor: "#e8743b", regionKind: "line",
  columns: ["customer", "model", "quantity", "date", "manufacturer", "region", "engine"],
  title: "Orders | AE+ Data Analytics",
  description: "Aircraft orders by customer, model and region from the OD_ORDERS workbook snapshot.",
  queryKey: getGetOrdersQueryKey(),
  rankExclude: { region: ["Unidentified"], customer: ["UNIDENTIFIED CUSTOMER(S)"] },
  useData: (interval) => useGetOrders({ query: { queryKey: getGetOrdersQueryKey(), refetchInterval: interval ?? false } }),
};

export default function OrdersPage() {
  return <Dashboard key="orders" cfg={cfg} />;
}
