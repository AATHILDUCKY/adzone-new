"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import Inventory from "../../src/views/Inventory";

export default function InventoryPage() {
  return (
    <ProtectedRoute routePath="/inventory">
      <Inventory />
    </ProtectedRoute>
  );
}
