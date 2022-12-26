import type { Action, ActionReturn, Target } from "./target.ts";

export type Middleware = (target: Target, next: Action) => ActionReturn;

export function compose(head: Middleware, ...rest: Middleware[]): Action {
  return isNotEmpty(rest)
    ? async (target) => await head(target, compose(...rest))
    : async (target) => await head(target, noop);
}

function isNotEmpty<T extends unknown>(
  tuple: T[],
): tuple is [head: T, ...tail: T[]] {
  return tuple.length > 0;
}

function noop() {
  return Promise.resolve(undefined);
}
