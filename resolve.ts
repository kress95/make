import { Action, Target } from "./target.ts";
import { compose } from "./middleware.ts";
import { expand } from "./expand.ts";
import { format } from "./format.ts";
import { TargetError } from "./target_error.ts";
import { exists, lstat } from "./util.ts";
import * as diff from "./diff.ts";
import * as rules from "./rules.ts";
import * as tasks from "./tasks.ts";
import { TargetNotFoundError } from "./report_error.ts";

export type Resolved = {
  task: boolean;
  prereqs: string[];
  action: Action;
};

export const resolve = compose(
  expandTarget,
  resolveTarget,
  skipCheck,
  stopwatch,
  errors,
  execute,
  checkRule,
);

export async function expandTarget(target: Target, next: Action) {
  const expanded = await expand(target.name);

  if (expanded.length < 2) {
    if (expanded.length === 1) target.name = expanded[0];
    return await next(target);
  }

  return await target.run(...expanded);
}

const resolved = new Map<string, Action>();

export async function resolveTarget(target: Target, next: Action) {
  if (resolved.has(target.name)) {
    throw new Error("cannot resolve already resolved targets");
  }

  const found = tasks.get(target.name) ?? rules.find(target.name);

  if (found !== undefined) {
    resolved.set(target.name, found.action);

    for (const item of found.prereqs) {
      target.deps.push(format(item, target.name));
    }
  }

  return await next(target);
}

export async function skipCheck(target: Target, next: Action) {
  const forceUpdate = tasks.is(target.name) || !(await exists(target.name));
  const ranAnyDeps = (await target.run(...target.deps)) !== false;

  await Promise.all(target.deps.map(diff.update));

  if (ranAnyDeps || forceUpdate) return await next(target);
  return false;
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
  return await action(target);
}

export async function checkRule(target: Target) {
  const mtime = (await lstat(target.name))?.mtime?.valueOf();
  if (mtime === undefined) throw new TargetNotFoundError();
  if (diff.unchanged(target.name, mtime)) return false;
  target.info("changed:");
}
