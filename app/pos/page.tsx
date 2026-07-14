"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import POS from "../../src/views/POS";

export default function PosPage() {
  return (
    <ProtectedRoute routePath="/pos">
      <POS />
    </ProtectedRoute>
  );
}
