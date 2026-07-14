"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import Suppliers from "../../src/views/Suppliers";

export default function SuppliersPage() {
  return (
    <ProtectedRoute routePath="/suppliers">
      <Suppliers />
    </ProtectedRoute>
  );
}
