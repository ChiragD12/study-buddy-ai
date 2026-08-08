export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(payload: unknown): void;
}

export function header(request: ApiRequest, name: string): string | undefined {
  const key = Object.keys(request.headers).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase(),
  );
  const value = key ? request.headers[key] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function jsonError(response: ApiResponse, status: number, message: string): void {
  response.status(status).json({ ok: false, error: message });
}

export function requirePost(request: ApiRequest, response: ApiResponse): boolean {
  if (request.method === "POST") return true;
  jsonError(response, 405, "POST required.");
  return false;
}

export function requireCronSecret(request: ApiRequest, response: ApiResponse): boolean {
  const expected = process.env["CRON_SECRET"];
  const authorization = header(request, "authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!expected || !supplied || supplied !== expected) {
    jsonError(response, 401, "Unauthorized.");
    return false;
  }
  return true;
}
