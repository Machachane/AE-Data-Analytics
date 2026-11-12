import type { CorsOptions } from "cors";

/** Explicit browser origins only; CORS is not authentication. */
export function allowedCorsOrigins(value = ""): Set<string> {
  return new Set(value.split(",").map((x) => x.trim()).filter(Boolean).map((origin) => {
    const url = new URL(origin);
    if (!["https:", "http:"].includes(url.protocol) || url.origin !== origin ||
        url.username || url.password || (url.protocol === "http:" && url.hostname !== "localhost")) {
      throw new Error("CORS_ALLOWED_ORIGINS must contain comma-separated HTTPS origins without paths or trailing slashes.");
    }
    return origin;
  }));
}

export function corsPolicy(value?: string): CorsOptions {
  const origins = allowedCorsOrigins(value);
  return {
    origin: (origin, callback) => callback(null, !!origin && origins.has(origin)),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
    credentials: false,
  };
}
