"use client";

import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import Users from "../../src/views/Users";

export default function UsersPage() {
  return (
    <ProtectedRoute routePath="/users">
      <Users />
    </ProtectedRoute>
  );
}
