import type { AuthIdentity } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthIdentity;
    }
  }
}

export {};
