import type { AppError, ErrorCode } from "@ibp/shared";

/** An expected failure with a code the UI can explain in plain language. */
export class IbpError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "IbpError";
    this.code = code;
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === "string";
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return isErrnoException(error) && error.code === code;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof IbpError) {
    return error.message === error.code
      ? { code: error.code }
      : { code: error.code, detail: error.message };
  }
  const detail = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
  return { code: isErrnoException(error) ? "io_error" : "unknown", detail };
}
