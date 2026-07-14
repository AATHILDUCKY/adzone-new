"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import Customers from "../../src/views/Customers";

export default function CustomersPage() {
  return (
    <ProtectedRoute routePath="/customers">
      <Customers />
    </ProtectedRoute>
  );
}
