"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import Reports from "../../src/views/Reports";

export default function ReportsPage() {
  return (
    <ProtectedRoute routePath="/reports">
      <Reports />
    </ProtectedRoute>
  );
}
