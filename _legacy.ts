import { bold, cyan as mark, red as bad } from "std/fmt/colors.ts";
import { deferred } from "std/async/deferred.ts";
import { walk } from "std/fs/walk.ts";
import { writeAll } from "std/streams/write_all.ts";
import * as path from "std/path/mod.ts";

type LogType = "debug" | "error" | "info" | "log" | "warn";

const decoder = new TextDecoder();

let serialMode = false;

class Task {
  #logs: { type: LogType; data: unknown[] }[] = [];

  static flush(task: Task) {
    task.#flush();
  }

  public dependencies: string[] = [];
  public trace: string[] = [];

  constructor(
    public target: string = "",
    trace: string[] = [],
  ) {
    for (const entry of trace) this.trace.push(entry);
    if (target !== "") this.trace.push(target);
  }

  async sh(...commands: string[][]) {
    if (serialMode) {
      for (const command of commands) await this.#sh(command);
      return;
    }

    await Promise.all(commands.map(this.#sh));
  }

  #sh = async (command: string[]) => {
    this.log(bold("sh:"), command.join(" "));

    const proc = Deno.run({
      cmd: command,
      stdout: "piped",
      stderr: "piped",
    });

    const logs: string[] = [];

    await Promise.all([
      this.#pipe(proc.stdout.readable, logs),
      this.#pipe(proc.stderr.readable, logs),
    ]);

    const { code } = await proc.status();

    if (code !== 0) {
      this.error(logs.join(""));

      const msg = code === undefined
        ? "undefined error code"
        : `error code: ${code}`;

      throw [
        bold("sh:"),
        quote(command.join(" ")),
        bad(msg),
      ].join(" ");
    } else {
      this.log(logs.join(""));
    }
  };

  #pipe = async (
    readable: ReadableStream<Uint8Array>,
    logs: string[],
  ) => {
    for await (const chunk of readable) {
      if (serialMode) {
        await writeAll(Deno.stdout, chunk);
        continue;
      }

      logs.push(decoder.decode(chunk));
    }
  };

  async run(...targets: string[]): Promise<void> {
    if (serialMode) {
      for (const target of targets) await this.#run(target);
      return;
    }

    await Promise.all(targets.map(this.#run));
  }

  #run = (unresolvedTarget: string) => {
    const { target, action } = resolve(path.normalize(unresolvedTarget));
    return action(target, this);
  };

  debug(...data: unknown[]): void {
    this.#log("debug", data);
  }

  error(...data: unknown[]): void {
    this.#log("error", data);
  }

  info(...data: unknown[]): void {
    this.#log("info", data);
  }

  log(...data: unknown[]): void {
    this.#log("log", data);
  }

  warn(...data: unknown[]): void {
    this.#log("warn", data);
  }

  #log(type: LogType, data: unknown[]) {
    if (serialMode) return console[type](...data);
    this.#logs.push({ type, data });
  }

  #flush() {
    for (const { type, data } of this.#logs) console[type](...data);
    this.#logs = [];
  }
}

export type { Task };

export type Action = (task: Task) => void | Promise<void>;

let lastDescription: string[] | undefined;

export function desc(...description: string[]) {
  lastDescription = description;
}

type InternalAction = (target: string, parent: Task) => Promise<void>;

const tasks = new Map<string, InternalAction>();
const descriptions = new Map<string, string[]>();
const order: string[] = [];

export function task(name: string, action: Action): void;
export function task(name: string, prereqs: string[], action?: Action): void;
export function task(
  name: string,
  actionOrPrereqs: Action | string[],
  maybeAction?: Action,
) {
  const prereqs = Array.isArray(actionOrPrereqs) ? actionOrPrereqs : [];
  const action =
    (Array.isArray(actionOrPrereqs) ? maybeAction ?? noop : actionOrPrereqs);

  tasks.set(name, internalAction(name, prereqs, action));

  if (lastDescription !== undefined) {
    descriptions.set(name, lastDescription);
    lastDescription = undefined;
  }

  order.push(name);
}

const cacheFileName = ".make";
const cache = new Map<string, number>(
  await exists(cacheFileName)
    ? JSON.parse(await Deno.readTextFile(cacheFileName))
    : undefined,
);

const rules = new Map<RegExp, InternalAction>(); // maybe a bad idea

export function rule(pattern: string, action: Action): void;
export function rule(pattern: string, prereqs: string[], action: Action): void;
export function rule(
  pattern: string,
  actionOrPrereqs: Action | string[],
  maybeAction?: Action,
) {
  const prereqs = Array.isArray(actionOrPrereqs) ? actionOrPrereqs : [];
  const action = Array.isArray(actionOrPrereqs)
    ? maybeAction ?? noop
    : actionOrPrereqs;

  rules.set(
    path.globToRegExp(pattern),
    internalAction(path.normalize(pattern), prereqs, async function (t) {
      const mtime = (await lstat(t.target))?.mtime?.valueOf() ?? 0;
      if (cache.get(t.target) ?? Infinity > mtime) {
        await action(t);
        cache.set(t.target, mtime);
      }
    }),
  );
}

function noop() {}

class TaskError extends Error {}

let defaultTaskToRun: string | undefined;

export function defaultTask(target: string) {
  if (defaultTaskToRun !== undefined) {
    throw new Error("cannot override default task");
  }

  defaultTaskToRun = target;
}

let isAlreadyRunning = false;

export async function run(args = Deno.args) {
  if (isAlreadyRunning) {
    throw new Error("cannot run more than once");
  }

  isAlreadyRunning = true;

  try {
    const tasks = args.filter((arg) => !arg.startsWith("-"));

    for (const name of tasks) {
      if (!descriptions.has(name)) {
        throw `task ${quote(name)} not found`;
      }
    }

    if (tasks.length === 0 && defaultTaskToRun !== undefined) {
      tasks.push(defaultTaskToRun);
    }

    if (
      tasks.length === 0 || (args.includes("--help") ?? args.includes("-h"))
    ) {
      return help();
    }

    serialMode = args.includes("--serial") ?? args.includes("-s");

    const parallel = !serialMode &&
      (args.includes("--parallel") ?? args.includes("-p"));
    const rootTask = new Task();

    if (parallel) {
      await rootTask.run(...tasks);
    } else {
      for (const task of tasks) await rootTask.run(task);
    }
  } catch (error) {
    if (!(error instanceof TaskError)) throw error;
  } finally {
    await Deno.writeTextFile(
      cacheFileName,
      JSON.stringify(Array.from(cache.entries())),
    );
  }
}

export async function exists(filePath: string) {
  return (await lstat(filePath)) !== undefined;
}

export async function lstat(
  filePath: string,
): Promise<Deno.FileInfo | undefined> {
  try {
    return await Deno.lstat(filePath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

const alreadyRan = new Map<string, Promise<void>>();
const definedTargets = new Set<string>();

function internalAction(
  name: string,
  dependencies: string[],
  action: Action,
) {
  if (isAlreadyRunning) {
    throw new Error("cannot register new tasks after running");
  }

  if (definedTargets.has(name)) {
    throw new Error(`task or rule ${quote(name)} already exists`);
  }

  definedTargets.add(name);

  return async function (target: string, parent: Task) {
    const existingPromise = alreadyRan.get(name);

    if (existingPromise) {
      await existingPromise;
      return;
    }

    const promise = deferred<void>();
    alreadyRan.set(target, promise);

    const task = new Task(target, parent.trace);

    let startTime: number | undefined;

    try {
      task.dependencies = await expandAll(dependencies, target);

      await task.run(...task.dependencies);

      startTime = new Date().valueOf();

      console.log(bold("started:"), mark(target));

      try {
        await action(task);

        Task.flush(task);

        console.log(bold("finished:"), mark(target), finished(startTime));

        promise.resolve();
      } catch (error) {
        Task.flush(task);
        throw error;
      }
    } catch (error) {
      if (error instanceof TaskError) {
        promise.reject(error);
        return;
      }

      console.error(
        bold(bad("failed:")),
        task.trace.map(mark).join(" > "),
        finished(startTime),
      );

      console.error(typeof error === "string" ? error : error.stack);

      promise.reject(new TaskError(error));
    } finally {
      await promise;
    }
  };
}

async function expandAll(dependencies: string[], target: string) {
  if (serialMode) {
    const results: string[] = [];

    for (const dependency of dependencies) {
      for (const expanded of await expand(dependency, target)) {
        results.push(expanded);
      }
    }

    return results;
  }

  return (
    await Promise.all(
      dependencies.map((dependency) => expand(dependency, target)),
    )
  ).flat();
}

async function expand(dependency: string, target?: string): Promise<string[]> {
  const formatted = target !== undefined
    ? format(dependency, target.split(path.sep))
    : dependency;

  if (path.isGlob(formatted)) {
    const match = [path.globToRegExp(formatted)];
    const entries: string[] = [];

    for await (const entry of walk(".", { match })) {
      entries.push(resolve(entry.path).target);
    }

    return entries;
  }

  return [resolve(formatted).target];
}

function resolve(name: string): { target: string; action: InternalAction } {
  const target = path.normalize(name);

  const action = tasks.get(target);
  if (action !== undefined) return { target, action };

  for (const [regexp, action] of rules) {
    if (regexp.test(target)) return { target, action };
  }

  throw `task or rule ${quote(name)} not found`;
}

function format(str: string, args: string[]) {
  return args.reduce(formatReduce, str);
}

function formatReduce(target: string, value: string, index: number) {
  return target.replaceAll(`{${index}}`, value);
}

function help() {
  const exposed = order.filter((name) => descriptions.has(name));

  console.log([
    ["Usage: make [options] [targets] ..."],
    ["Options:"],
    ...group([
      ["  -h, --help", "Print this message and exit."],
      ["  -p, --parallel", "Run command-line targets in parallel mode."],
      ["  -s, --serial", "Run all targets in parallel mode."],
    ]),
    ...(exposed.length > 0 ? ["", "Targets:"] : []),
    ...group(
      exposed.map((name) =>
        [name, ...descriptions.get(name) ?? []]
          .filter((str): str is string => str !== undefined)
      ),
    ),
  ].join("\n"));
}

function group(lines: string[][]) {
  const rulers = [20];

  for (const line of lines) {
    line.forEach((part, i) => {
      if (part.length > (rulers[i] ?? 0)) {
        rulers[i] = part.length + 1;
      }
    });
  }

  return lines.map((line) =>
    line.map((str, i) => {
      return i < (line.length - 1)
        ? str + " ".repeat(rulers[i] - str.length)
        : str;
    }).join("")
  );
}

function quote(str: string) {
  return mark(`'${str}'`);
}

function finished(startedTime?: number) {
  if (startedTime === undefined) return "";
  const finished = (new Date().valueOf() - startedTime) / 1000;
  return (finished > 0.1) ? `(${finished}s)` : "";
}
