import type { Target } from "./target.ts";

export class TargetError extends Error {
  constructor(
    public error: unknown,
    public target: Target,
  ) {
    super(
      error instanceof Error
        ? (error.stack ?? error.message ?? `${error}`)
        : `${error}`,
    );
    this.name = "TargetError";
  }
}
