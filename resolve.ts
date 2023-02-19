import { Action, ActionReturn, Target } from "./target.ts";
import { compose } from "./middleware.ts";
import { exists, mtime } from "./util.ts";
import { expand } from "./expand.ts";
import { format } from "./format.ts";
import { globToRegExp } from "./deps.ts";
import { TargetError } from "./target_error.ts";
import * as diff from "./diff.ts";
import * as rules from "./rules.ts";
import * as tasks from "./tasks.ts";

export type Resolved = {
  task: boolean;
  prereqs: string[];
  action: Action;
};

export const resolve = compose(
  resolveTarget,
  expandDeps,
  skipCheck,
  stopwatch,
  errors,
  execute,
  checkRule,
);

const resolved = new Map<string, Action>();
const running = new Map<string, ActionReturn>();

export async function resolveTarget(target: Target, next: Action) {
  if (running.has(target.name)) return running.get(target.name);

  const found = tasks.get(target.name) ?? rules.find(target.name);

  if (found !== undefined) {
    Target.debug(target, "resolved:");

    resolved.set(target.name, found.action);

    for (const item of found.prereqs) {
      target.deps.push(format(item, target.name));
    }
  } else {
    Target.debug(target, "unresolved:");
  }

  const result = next(target);
  running.set(target.name, result);
  return await result;
}

export async function expandDeps(target: Target, next: Action) {
  const deps: string[] = [];
  const rulesToKeep = new Set<string>();
  const tasksToKeep = new Set<string>();

  const include = async (pattern: string) => {
    if (tasks.is(pattern)) {
      if (tasksToKeep.has(pattern)) return;
      deps.push(pattern);
      tasksToKeep.add(pattern);
      return;
    }

    for (const rule of await expand(pattern)) {
      if (rulesToKeep.has(rule)) continue;
      deps.push(rule);
      rulesToKeep.add(rule);
    }
  };

  const exclude = (pattern: string) => {
    if (tasks.is(pattern)) {
      tasksToKeep.delete(pattern);
      return;
    }

    const regexp = globToRegExp(pattern);

    for (const rule of rulesToKeep) {
      if (regexp.test(rule)) rulesToKeep.delete(rule);
    }
  };

  for (const pattern of target.deps) {
    if (pattern.startsWith("!")) {
      exclude(pattern.substring(1, pattern.length));
    } else {
      await include(pattern);
    }
  }

  target.deps = deps.filter((str) =>
    tasks.is(str) ? tasksToKeep.has(str) : rulesToKeep.has(str)
  );

  return await next(target);
}

export async function skipCheck(target: Target, next: Action) {
  const isTask = tasks.is(target.name);
  const forceUpdate = isTask || !(await exists(target.name));
  const ranAnyDeps = (await target.run(...target.deps)) !== false;

  await Promise.all(target.deps.map(diff.update));

  if (!(ranAnyDeps || forceUpdate) && !isTask) {
    if (
      diff.unchanged(
        target.name,
        (await mtime(target.name)) ?? 0,
      )
    ) {
      Target.debug(target, "skip:");
      return false;
    }

    const result = await next(target);
    await diff.update(target.name);
    return result;
  } else {
    return await next(target);
  }
}

export async function stopwatch(target: Target, next: Action) {
  if (!resolved.has(target.name)) return await next(target);

  const startedAt = timestamp();
  try {
    target.info("started:");
    const result = await next(target);
    target.info("finished:", time(startedAt));
    return result;
  } catch (error) {
    target.error("failed:", time(startedAt));
    throw error;
  }
}

function timestamp() {
  return new Date().valueOf();
}

function time(startedAt: number) {
  const diff = (timestamp() - startedAt) / 1000;
  return (diff > 0.1) ? `(${diff}s)` : "";
}

export async function errors(target: Target, next: Action) {
  try {
    return await next(target);
  } catch (error) {
    if (error instanceof TargetError) throw error;
    throw new TargetError(error, target);
  }
}

export async function execute(target: Target, next: Action) {
  const action = resolved.get(target.name);

  if (action === undefined) return await next(target);
  Target.debug(target, "running:");
  return await action(target);
}

export async function checkRule(target: Target, next: Action) {
  const time = await mtime(target.name);

  if (time === undefined) {
    Target.debug(target, "unknown:");
    return await next(target);
  }

  return !diff.unchanged(target.name, time);
}
