const TEST_ACCESS_SECRET = "test-access-secret-at-least-32-bytes-long";
const TEST_REFRESH_SECRET = "test-refresh-secret-at-least-32-bytes-long";

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  issuer: string;
  audience: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  bcryptRounds: number;
  allowedOrigins: ReadonlySet<string>;
  cookieName: string;
  cookieSecure: boolean;
}

export function loadAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const isTest = env.NODE_ENV === "test";
  const isProduction = env.NODE_ENV === "production";

  const accessSecret = requireSecret(
    "AUTH_ACCESS_TOKEN_SECRET",
    env.AUTH_ACCESS_TOKEN_SECRET ?? (isTest ? TEST_ACCESS_SECRET : undefined),
  );
  const refreshSecret = requireSecret(
    "AUTH_REFRESH_TOKEN_SECRET",
    env.AUTH_REFRESH_TOKEN_SECRET ?? (isTest ? TEST_REFRESH_SECRET : undefined),
  );

  if (accessSecret === refreshSecret) {
    throw new Error("Auth access and refresh secrets must be different");
  }

  const accessTtlSeconds = parseInteger(
    "AUTH_ACCESS_TTL_SECONDS",
    env.AUTH_ACCESS_TTL_SECONDS,
    900,
    60,
    3600,
  );
  const refreshTtlSeconds = parseInteger(
    "AUTH_REFRESH_TTL_SECONDS",
    env.AUTH_REFRESH_TTL_SECONDS,
    604800,
    accessTtlSeconds + 1,
    2592000,
  );
  const bcryptRounds = parseInteger(
    "AUTH_BCRYPT_ROUNDS",
    env.AUTH_BCRYPT_ROUNDS,
    12,
    10,
    15,
  );

  const issuer = requireNonEmpty(
    "AUTH_TOKEN_ISSUER",
    env.AUTH_TOKEN_ISSUER ?? "scalable-news-feed-system",
  );
  const audience = requireNonEmpty(
    "AUTH_TOKEN_AUDIENCE",
    env.AUTH_TOKEN_AUDIENCE ?? "scalable-news-feed-client",
  );
  const allowedOrigins = parseOrigins(
    env.AUTH_ALLOWED_ORIGINS ??
      (isProduction ? undefined : "http://localhost:3000"),
  );
  const cookieSecure = parseBoolean(
    "AUTH_COOKIE_SECURE",
    env.AUTH_COOKIE_SECURE,
    isProduction,
  );

  if (isProduction && !cookieSecure) {
    throw new Error("AUTH_COOKIE_SECURE must be true in production");
  }

  return {
    accessSecret,
    refreshSecret,
    issuer,
    audience,
    accessTtlSeconds,
    refreshTtlSeconds,
    bcryptRounds,
    allowedOrigins,
    cookieName: "refresh_token",
    cookieSecure,
  };
}

function requireSecret(name: string, value: string | undefined): string {
  const secret = requireNonEmpty(name, value);
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(`${name} must be at least 32 bytes`);
  }
  return secret;
}

function requireNonEmpty(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseInteger(
  name: string,
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? defaultValue : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseBoolean(
  name: string,
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function parseOrigins(value: string | undefined): ReadonlySet<string> {
  if (!value) {
    throw new Error("AUTH_ALLOWED_ORIGINS is required");
  }

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error("AUTH_ALLOWED_ORIGINS contains an invalid origin");
      }

      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.origin !== origin
      ) {
        throw new Error("AUTH_ALLOWED_ORIGINS must contain exact HTTP origins");
      }
      return parsed.origin;
    });

  if (origins.length === 0) {
    throw new Error("AUTH_ALLOWED_ORIGINS must contain at least one origin");
  }

  return new Set(origins);
}

export const authConfig = loadAuthConfig();
