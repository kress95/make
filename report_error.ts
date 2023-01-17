import { error, quote } from "./style.ts";
import { stripColor } from "./deps.ts";

export class ReportError extends Error {
  constructor(public report: string, options?: ErrorOptions) {
    super(
      report !== undefined ? stripColor(report) : undefined,
      options,
    );
    this.name = "ReportError";
  }
}

export class TargetNotFoundError extends ReportError {
  constructor() {
    super(`cannot resolve target`);
    this.name = "TargetNotFoundError";
  }
}

export class CliTargetNotFoundError extends ReportError {
  constructor(name: string) {
    super(`cannot resolve target ${quote(name)}`);
    this.name = "CliTargetNotFoundError";
  }
}

export class ShellCommandError extends ReportError {
  constructor(command: string, code?: number) {
    super(`command ${quote(command)} returned ${formatErrorCode(code)}`);
    this.name = "ShellCommandError";
  }
}

const undefinedErrorCodeString = error("undefined error code");

function formatErrorCode(code?: number) {
  if (code === undefined) return undefinedErrorCodeString;
  return error(`error code ${code}`);
}
