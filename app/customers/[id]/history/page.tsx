"use client";

import { ProtectedRoute } from "../../../../src/components/ProtectedRoute";
import CustomerHistory from "../../../../src/views/CustomerHistory";

export default function CustomerHistoryPage() {
  return (
    <ProtectedRoute routePath="/customers/[id]/history" accessPath="/customers">
      <CustomerHistory />
    </ProtectedRoute>
  );
}
