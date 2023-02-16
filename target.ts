import { Buffer } from "./deps.ts";
import { ReportError } from "./report_error.ts";
import { TargetError } from "./target_error.ts";
import * as jobs from "./jobs.ts";
import * as style from "./style.ts";
import { Logger } from "./logger.ts";
import * as shell from "./shell.ts";
import * as run from "./run.ts";

const abortString = style.em("abort");

/** Target configuration. */
export type Config = {
  instant?: boolean;
  serial?: boolean;
  silent?: boolean;
  verbose?: boolean;
  resolve: Action;
};

/** User defined actions. Returning false means that nothing was done. */
export type Action = (target: Target) => ActionReturn;

export type ActionReturn = void | boolean | Promise<void | boolean>;

/** Contains target metadata and methods to move execution forward. */
export class Target {
  static create(config: Config) {
    return new Target("", config);
  }

  static readonly #storage = new Map<string, Target>();

  static from(from: Target, name: string) {
    const existing = Target.#storage.get(name);
    const target = existing ?? new Target(name, from.#config);

    const handleAbort = (reason: unknown) => {
      from.#signal.signal.removeEventListener("abort", handleAbort);
      target.#signal.abort(reason);
    };

    from.#signal.signal.addEventListener("abort", handleAbort);

    if (existing === undefined) Target.#storage.set(name, target);

    return target;
  }

  static abort(target: Target, error: unknown) {
    target.#assertNotAborted();
    target.#signal.abort(error);
    throw error;
  }

  static debug(target: Target, message: string, ...args: unknown[]) {
    target.#logger.debug(message, ...args);
  }

  #config: Config;
  #signal: AbortController = new AbortController();
  #prefix: string;
  #logger: Logger;

  #jobs = 0;

  /** Target name */
  name: string;

  /** Target dependencies */
  deps: string[] = [];

  /** Starts job to run another targets. */
  run: (...targets: string[]) => Promise<void | boolean>;

  /** Starts job to run shell commands. */
  sh: (...commands: string[][]) => Promise<void>;

  constructor(name: string, config: Config) {
    this.#config = config;
    this.#prefix = style.subtitle(name);
    this.#logger = new Logger(this.#prefix);
    this.name = name;
    this.run = run.create(this.#run, config.serial);
    this.sh = shell.create(this.#spawn, this.#logger, config.serial);
  }

  /** Abort this target and all jobs started from it. */
  abort(reason: string) {
    this.#assertNotAborted();
    const error = new TargetError(new ReportError(reason), this);
    this.#signal.abort(error);
    throw error;
  }

  /** Logs debug messages. */
  debug(message: string, ...args: unknown[]) {
    this.#logger.log("debug", message, args);
  }

  /** Logs info messages. */
  info(message: string, ...args: unknown[]) {
    this.#logger.log("info", message, args);
  }

  /** Logs warning messages. */
  warning(message: string, ...args: unknown[]) {
    this.#logger.log("warning", message, args);
  }

  /** Logs error messages. */
  error(message: string, ...args: unknown[]) {
    this.#logger.log("error", message, args);
  }

  /** Logs critical messages. */
  critical(message: string, ...args: unknown[]) {
    this.#logger.log("critical", message, args);
  }

  #run = async (target: string) => {
    this.#assertNotAborted();
    try {
      this.#startJob();
      return await this.#config.resolve(Target.from(this, target));
    } finally {
      this.#finishJob();
    }
  };

  #spawn = async (cmd: string[], fmt: string) => {
    this.#assertNotAborted();

    const mode = (this.#config.instant) ? "inherit" as const : "piped" as const;

    const proc = Deno.run({ cmd, stdout: mode, stderr: mode });

    const handleAbort = () => {
      this.#logger.info("sh:", abortString, fmt);
      proc.kill();
    };

    this.#signal.signal.addEventListener("abort", handleAbort);

    this.#startJob();

    try {
      const [logs, { code }] = await Promise.all([
        mode === "piped" ? pipeBuffer(proc) : undefined,
        proc.status(),
      ]);

      this.#assertNotAborted();

      return { logs, code };
    } finally {
      this.#finishJob();
      this.#signal.signal.removeEventListener("abort", handleAbort);
    }
  };

  #startJob() {
    this.#jobs += 1;
    jobs.setWaiting(this.name);
  }

  #finishJob() {
    this.#jobs -= 1;
    if (this.#jobs === 0) jobs.setRunning(this.name);
  }

  #assertNotAborted() {
    if (this.#signal.signal.aborted) throw this.#signal.signal.reason;
  }
}

const decoder = new TextDecoder();

async function pipeBuffer(
  proc: Deno.Process<
    { cmd: string[]; stdout: "piped"; stderr: "piped" }
  >,
) {
  const buffer = new Buffer();

  await Promise.all([
    buffer.readFrom(proc.stdout),
    buffer.readFrom(proc.stderr),
  ]);

  return decoder.decode(buffer.bytes());
}
