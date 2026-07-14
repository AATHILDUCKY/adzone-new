"use client";

import { ProtectedRoute } from "../src/components/ProtectedRoute";
import Dashboard from "../src/views/Dashboard";

export default function HomePage() {
  return (
    <ProtectedRoute routePath="/">
      <Dashboard />
    </ProtectedRoute>
  );
}
