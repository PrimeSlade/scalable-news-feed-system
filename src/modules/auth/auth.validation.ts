import { ValidationError } from "../../utils/errors";
import type { LoginInput, RegisterInput } from "./auth.types";

const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_BYTES = 72;

export interface ValidatedRegisterInput extends RegisterInput {
  usernameNormalized: string;
}

export function validateRegistration(input: unknown): ValidatedRegisterInput {
  if (!isRecord(input)) {
    throw new ValidationError("Request body is required");
  }

  const username = requireTrimmedString(input.username, "username");
  const displayName = requireTrimmedString(input.displayName, "displayName");

  if (typeof input.password !== "string") {
    throw new ValidationError("password is required");
  }
  if (Array.from(input.password).length < MIN_PASSWORD_CHARACTERS) {
    throw new ValidationError(
      `password must be at least ${MIN_PASSWORD_CHARACTERS} characters`,
    );
  }
  if (Buffer.byteLength(input.password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new ValidationError(
      `password must be at most ${MAX_PASSWORD_BYTES} UTF-8 bytes`,
    );
  }

  return {
    username,
    usernameNormalized: normalizeUsername(username),
    displayName,
    password: input.password,
  };
}

export function validateLogin(input: unknown): LoginInput {
  if (!isRecord(input)) {
    throw new ValidationError("Request body is required");
  }
  const username = requireTrimmedString(input.username, "username");
  if (typeof input.password !== "string" || input.password.length === 0) {
    throw new ValidationError("password is required");
  }

  return { username, password: input.password };
}

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase("en-US");
}

function requireTrimmedString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
