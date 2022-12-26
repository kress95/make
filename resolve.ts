import { Action, Target } from "./target.ts";
import { compose } from "./middleware.ts";
import { expand } from "./expand.ts";
import { format } from "./format.ts";
import { TargetError } from "./target_error.ts";
import { lstat } from "./util.ts";
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
  formatDeps,
  executeDeps,
  // executeDeps,
  stopwatch,
  errors,
  execute,
  performDiff,
);

export async function expandTarget(target: Target, next: Action) {
  const expanded = await expand(target.name);

  if (expanded.length < 2) {
    if (expanded.length === 1) target.name = expanded[0];
    return await next(target);
  }

  await target.run(...expanded);
}

export async function resolveTarget(target: Target, next: Action) {
  const resolved = tasks.get(target.name) ?? rules.find(target.name);

  if (resolved !== undefined) {
    for (const item of resolved.prereqs) target.deps.push(item);
    Target.resolve(target, resolved.action);
  }

  return await next(target);
}

export async function formatDeps(target: Target, next: Action) {
  for (let i = 0; i < target.deps.length; i++) {
    target.deps[i] = format(target.deps[i], target.name);
  }

  await next(target);
}

export async function executeDeps(target: Target, next: Action) {
  const ran = await target.run(...target.deps);
  console.log("ran", ran)
  const result = await next(target);
  for (const entry of target.deps) diff.update(entry);
  return result;
}

export async function stopwatch(target: Target, next: Action) {
  if (Target.unresolved(target)) return await next(target);

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
  const result = await Target.execute(target);
  if (result !== undefined) return result;
  return await next(target);
}

export async function performDiff(target: Target) {
  const mtime = (await lstat(target.name))?.mtime?.valueOf();
  if (mtime === undefined) throw new TargetNotFoundError(target.name);
  if (diff.unchanged(target.name, mtime)) return false;
  target.info("changed:");
}

//
//

// export async function targetResolve(target: Target, next: Action) {
//   const resolved = tasks.get(target.name) ?? rules.find(target.name);
//   if (resolved !== undefined) Target.resolve(target, resolved);
//   return await next(target);
// }

// export async function executeDeps(target: Target, next: Action) {
// const result = await target.run(...target.deps)
// await target.run(...target.deps);
//   if (target.task) return await next(target);
//   if (await diff.needsUpdate(target.name)) {
//     await next(target);
//     await diff.update(target.name);
//   }
// }
// static resolve(target: Target, { task, prereqs, action }: Resolved) {
//   if (target.#action !== undefined) {
//     throw new Error("cannot resolve already resolved targets");
//   }
//   target.task = task;
//   for (const item of prereqs) target.deps.push(item);
//   target.#action = action;
// }
// static async execute(target: Target) {
//   if (target.#action === undefined) {
//     throw new TargetNotFoundError(target.name);
//   }
//   return await target.#action(target);
// }

// targetResolve,
