export class BackendError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export function fail(code: string, status = 400): never { throw new BackendError(code, status); }
