/** Only fixed codes/statuses may be logged. Never log provider payloads or selected data. */
export class ReportGenerationError extends Error {
  constructor(
    public readonly code: "not_configured" | "provider_auth" | "provider_limit" | "provider_unavailable" |
      "provider_response" | "ai_incomplete" | "ai_validation" | "ai_timeout" | "ai_connection",
    message: string,
    public readonly providerStatus?: number,
  ) { super(message); }
}
