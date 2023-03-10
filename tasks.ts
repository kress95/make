import { isGlob } from "./deps.ts";
import type { Action } from "./target.ts";
import type { Resolved } from "./resolve.ts";

const tasks = new Map<string, Resolved>();

export function set(name: string, prereqs: string[], action: Action) {
  if (tasks.has(name)) throw new Error(`conflicts with existing task`);
  if (!isValid(name)) throw new Error(`invalid task name`);
  tasks.set(name, { task: true, prereqs, action });
}

function isValid(name: string) {
  for (const char of [".", "/", "\\"]) {
    if (name.indexOf(char) > -1) return false;
  }

  return !isGlob(name);
}

export function get(name: string) {
  return tasks.get(name);
}

export function is(name: string) {
  return tasks.has(name);
}
