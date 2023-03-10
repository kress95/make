import { resolve } from "./resolve.ts";
import { Action, Config, Target } from "./target.ts";
import { CliTargetNotFoundError, ReportError } from "./report_error.ts";
import { TargetError } from "./target_error.ts";
import * as diff from "./diff.ts";
import * as help from "./help.ts";
import * as logger from "./logger.ts";
import * as rules from "./rules.ts";
import * as tasks from "./tasks.ts";

let runByDefault: string | undefined;

/** Set the default task. */
export function defaultTask(target: string) {
  if (runByDefault !== undefined) {
    throw new Error("cannot define default target twice");
  }
  runByDefault = target;
}

let description: string[] | undefined;

/** Set the description for the next task. */
export function desc(...describe: string[]) {
  if (description !== undefined) {
    throw new Error("cannot describe a description");
  }
  description = describe;
}

let alreadyRun = false;

/** Define task. */
export function task(name: string, action: Action): void;
export function task(name: string, prereqs: string[], action?: Action): void;
export function task(
  name: string,
  actionOrPrereqs: Action | string[],
  maybeAction?: Action,
) {
  if (alreadyRun) throw new Error(`cannot define task after running`);

  const prereqs = Array.isArray(actionOrPrereqs) ? actionOrPrereqs : [];
  const action = Array.isArray(actionOrPrereqs)
    ? (maybeAction ?? noopAsync)
    : actionOrPrereqs;

  tasks.set(name, prereqs, action);

  if (description !== undefined) {
    help.register(name, description);
    description = undefined;
  }
}

/** Define file rule. */
export function rule(pattern: string, action: Action): void;
export function rule(pattern: string, prereqs: string[], action?: Action): void;
export function rule(
  pattern: string,
  actionOrPrereqs: Action | string[],
  maybeAction?: Action,
) {
  if (alreadyRun) throw new Error(`cannot define rule after running`);

  const prereqs = Array.isArray(actionOrPrereqs) ? actionOrPrereqs : [];
  const action = Array.isArray(actionOrPrereqs)
    ? maybeAction ?? noopAsync
    : actionOrPrereqs;

  rules.add(pattern, prereqs, action);
}

function noopAsync() {
  return Promise.resolve();
}

/** Run parallel groups of serial tasks. */
export async function run(groups: string[][], config: Config) {
  if (alreadyRun) throw new Error("cannot run a second time");
  alreadyRun = true;

  const root = Target.create(config);

  try {
    await Promise.all(
      groups.map(
        async (targets) => {
          for (const target of targets) await root.run(target);
        },
      ),
    );
  } catch (error) {
    Target.abort(root, error);
  }
}

/** Run default cli. */
export async function cli(
  args: string[] = Deno.args,
  config?: Partial<Config>,
) {
  if (args.includes("--help") || args.includes("-h")) {
    return console.log(help.format());
  }

  const silent = args.includes("--silent") || args.includes("-s");
  const verbose = args.includes("--verbose") || args.includes("-v");

  if (!silent) logger.setup(verbose);

  const groups = fallback(
    args
      .filter((arg) => !arg.startsWith("-"))
      .map((arg) => arg.split(","))
      .filter((group) => group.length > 0),
  );

  try {
    validate(groups);
    await diff.load();
    return await run(groups, {
      verbose,
      silent,
      instant: args.includes("--instant") || args.includes("-i"),
      serial: args.includes("--cereal") || args.includes("-c"),
      resolve,
      ...(config ?? {}),
    });
  } catch (error) {
    const targetError = error instanceof TargetError ? error : undefined;
    const actualError = targetError?.error ?? error;
    const log = targetError?.target ?? logger.get();
    if (!(actualError instanceof ReportError)) throw actualError;
    log.critical("error:", actualError.report);
    return false;
  } finally {
    await diff.save();
  }
}

function fallback(groups: string[][]) {
  if (groups.length === 0) {
    if (runByDefault !== undefined) return [[runByDefault]];
    return [];
  }

  return groups;
}

function validate(groups: string[][]) {
  for (const group of groups) {
    for (const target of group) {
      if (!help.has(target)) throw new CliTargetNotFoundError(target);
    }
  }
}
