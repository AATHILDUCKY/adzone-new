import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL || "/api";

function normalizeEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("/api/")) {
    return trimmed.slice(4);
  }

  if (trimmed === "/api") {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// Older versions stored the feet-based length unit under the misleading METER
// code. Normalize all API responses at one boundary so every screen, label and
// calculation consistently receives FEET, including data from an older server.
function normalizeLegacyUnits(value: any): any {
  if (Array.isArray(value)) {
    return value.map(normalizeLegacyUnits);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        key === "unitType" && nestedValue === "METER" ? "FEET" : normalizeLegacyUnits(nestedValue),
      ]),
    );
  }

  return value;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem("adzone_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${normalizeEndpoint(endpoint)}`, { ...options, headers });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const error = contentType.includes("application/json")
      ? await response.json()
      : (() => {
          const textPromise = response.text();
          return textPromise.then((text) => ({
            error: text.startsWith("<!doctype") || text.startsWith("<html")
              ? "The app received an HTML page instead of API data. Restart the server and try again."
              : text || "Something went wrong",
          }));
        })();
    const resolvedError = error instanceof Promise ? await error : error;
    throw new Error(resolvedError.error || "Something went wrong");
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(text.startsWith("<!doctype") || text.startsWith("<html")
      ? "The app received an HTML page instead of API data. Refresh the server and try again."
      : "The server returned an unexpected response.");
  }

  return normalizeLegacyUnits(await response.json());
}
