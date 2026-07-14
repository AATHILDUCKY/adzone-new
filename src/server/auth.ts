import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { ApiError } from "./validation";

export type AuthToken = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthToken;
};

function extractBearerToken(header: string | undefined) {
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return undefined;
  }

  return token;
}

export function createAuthToken(payload: AuthToken) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.tokenTtlHours}h`,
  });
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new ApiError(401, "Authentication is required");
    }

    const decoded = jwt.verify(token, config.jwtSecret) as AuthToken;
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch (error) {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      return next(new ApiError(401, "Authentication is required"));
    }

    if (!allowedRoles.includes(user.role)) {
      return next(new ApiError(403, "You do not have access to this resource"));
    }

    next();
  };
}
