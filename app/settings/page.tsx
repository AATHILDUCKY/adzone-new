"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import Settings from "../../src/views/Settings";

export default function SettingsPage() {
  return (
    <ProtectedRoute routePath="/settings">
      <Settings />
    </ProtectedRoute>
  );
}
