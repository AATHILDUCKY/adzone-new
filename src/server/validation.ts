export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

type StringOptions = {
  field: string;
  min?: number;
  max?: number;
  optional?: boolean;
};
type RequiredStringOptions = Omit<StringOptions, "optional"> & { optional?: false };
type OptionalStringOptions = Omit<StringOptions, "optional"> & { optional: true };

type NumberOptions = {
  field: string;
  min?: number;
  optional?: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function asString(value: unknown, options: OptionalStringOptions): string | undefined;
export function asString(value: unknown, options: RequiredStringOptions): string;
export function asString(value: unknown, options: StringOptions): string | undefined {
  if (value == null || value === "") {
    if (options.optional) {
      return undefined;
    }
    throw new ApiError(400, `${options.field} is required`);
  }

  if (typeof value !== "string") {
    throw new ApiError(400, `${options.field} must be a string`);
  }

  const normalized = value.trim();

  if (!normalized && !options.optional) {
    throw new ApiError(400, `${options.field} is required`);
  }

  if (options.min && normalized.length < options.min) {
    throw new ApiError(400, `${options.field} must be at least ${options.min} characters`);
  }

  if (options.max && normalized.length > options.max) {
    throw new ApiError(400, `${options.field} must be at most ${options.max} characters`);
  }

  if (!normalized && options.optional) {
    return undefined;
  }

  return normalized;
}

export function asEmail(value: unknown, field = "Email") {
  const email = asString(value, { field, min: 5, max: 120 });
  if (!emailPattern.test(email.toLowerCase())) {
    throw new ApiError(400, `${field} is invalid`);
  }
  return email.toLowerCase();
}

export function asNumber(value: unknown, options: NumberOptions) {
  if (value == null || value === "") {
    if (options.optional) {
      return undefined;
    }
    throw new ApiError(400, `${options.field} is required`);
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, `${options.field} must be a valid number`);
  }

  if (options.min != null && parsed < options.min) {
    throw new ApiError(400, `${options.field} must be at least ${options.min}`);
  }

  return parsed;
}

export function asBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new ApiError(400, `${field} must be true or false`);
  }

  return value;
}

export function asArray<T>(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, `${field} must be an array`);
  }

  return value as T[];
}

export function ensureRole(value: unknown) {
  const role = asString(value, { field: "Role" });
  const allowedRoles = new Set(["ADMIN", "CASHIER", "INVENTORY_MANAGER", "AUDITOR"]);
  if (!allowedRoles.has(role)) {
    throw new ApiError(400, "Role must be ADMIN, CASHIER, INVENTORY_MANAGER, or AUDITOR");
  }
  return role;
}

export function ensureStatus(value: unknown) {
  const status = asString(value, { field: "Status" });
  const allowedStatuses = new Set(["ACTIVE", "INACTIVE"]);
  if (!allowedStatuses.has(status)) {
    throw new ApiError(400, "Status must be ACTIVE or INACTIVE");
  }
  return status;
}

export function ensurePaymentMethod(value: unknown) {
  const paymentMethod = asString(value, { field: "Payment method" });
  const allowedPaymentMethods = new Set(["CASH", "CARD", "BANK"]);
  if (!allowedPaymentMethods.has(paymentMethod)) {
    throw new ApiError(400, "Payment method must be CASH, CARD, or BANK");
  }
  return paymentMethod;
}
