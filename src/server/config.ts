import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected an integer but received "${value}"`);
  }

  return parsed;
}

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a number but received "${value}"`);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function hasRequiredValues(values: Array<string | number | undefined>) {
  return values.every((value) => value !== undefined && value !== "");
}

const smtpPort = parseInteger(process.env.SMTP_PORT, 465);
const smtpHost = process.env.SMTP_HOST?.trim();
const smtpUser = process.env.SMTP_USER?.trim();
const smtpPass = process.env.SMTP_PASS?.trim();
const smtpFrom = process.env.SMTP_FROM?.trim();
const smtpSecure = parseBoolean(process.env.SMTP_SECURE, smtpPort === 465);
const FEET_PER_METER = 3.28084;
const standardRollLengthFeet = process.env.ROLL_STANDARD_LENGTH_FEET
  ? parseNumber(process.env.ROLL_STANDARD_LENGTH_FEET, 164.042)
  : process.env.ROLL_STANDARD_LENGTH_METERS
    ? Number((parseNumber(process.env.ROLL_STANDARD_LENGTH_METERS, 50) * FEET_PER_METER).toFixed(4))
    : 164.042;

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: parseInteger(process.env.PORT, 3000),
  jwtSecret: requireEnv("JWT_SECRET", "adzone-local-dev-secret"),
  tokenTtlHours: parseInteger(process.env.TOKEN_TTL_HOURS, 24),
  admin: {
    name: requireEnv("ADMIN_USER_NAME", "Adzone Admin"),
    email: requireEnv("ADMIN_USER_EMAIL"),
    password: requireEnv("ADMIN_USER_PASSWORD"),
    resetPasswordOnBoot: parseBoolean(process.env.ADMIN_RESET_PASSWORD_ON_BOOT, true),
  },
  notifications: {
    smtp: {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      from: smtpFrom,
      secure: smtpSecure,
      enabled: hasRequiredValues([smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom]),
    },
  },
  inventory: {
    standardRollLengthFeet,
  },
};

export type AppConfig = typeof config;
