"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import Orders from "../../src/views/Orders";

export default function OrdersPage() {
  return (
    <ProtectedRoute routePath="/orders">
      <Orders />
    </ProtectedRoute>
  );
}
