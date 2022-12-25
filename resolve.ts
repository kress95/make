import { Action, execute, Target } from "./target.ts";
import { compose } from "./middleware.ts";
import { expand } from "./expand.ts";
import { format } from "./format.ts";
import { TargetError } from "./target_error.ts";
import * as diff from "./diff.ts";
import * as rules from "./rules.ts";
import * as tasks from "./tasks.ts";

export const resolve = compose(
  expandTarget,
  targetResolve,
  formatDeps,
  needsUpdate,
  stopwatch,
  errors,
  execute,
);

export async function expandTarget(target: Target, next: Action) {
  const expanded = await expand(target.name);

  if (expanded.length < 2) {
    if (expanded.length === 1) target.name = expanded[0];
    return await next(target);
  }

  await target.run(...expanded);
}

export async function targetResolve(target: Target, next: Action) {
  const resolved = tasks.get(target.name) ?? rules.find(target.name);
  if (resolved !== undefined) Target.resolve(target, resolved);
  await next(target);
}

export async function formatDeps(target: Target, next: Action) {
  if (target.task) return await next(target);

  for (let i = 0; i < target.deps.length; i++) {
    target.deps[i] = format(target.deps[i], target.name);
  }

  await next(target);
}

export async function needsUpdate(target: Target, next: Action) {
  if (target.task) return await next(target);

  if (await diff.needsUpdate(target.name)) {
    await next(target);
    await diff.update(target.name);
  }
}

export async function stopwatch(target: Target, next: Action) {
  const startedAt = timestamp();
  try {
    target.info("started:");
    await next(target);
    target.info("finished:", time(startedAt));
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
    await next(target);
  } catch (error) {
    if (error instanceof TargetError) throw error;
    throw new TargetError(error, target);
  }
}
