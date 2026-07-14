"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import AuditLogs from "../../src/views/AuditLogs";

export default function AuditLogsPage() {
  return (
    <ProtectedRoute routePath="/audit-logs">
      <AuditLogs />
    </ProtectedRoute>
  );
}
