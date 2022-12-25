import { noopAsync } from "./util.ts";
import type { Action, Target } from "./target.ts";

export type Middleware = (target: Target, next: Action) => Promise<void>;

export function compose(head: Middleware, ...rest: Middleware[]): Action {
  return isNotEmpty(rest)
    ? async (target) => await head(target, compose(...rest))
    : async (target) => await head(target, noopAsync);
}

function isNotEmpty<T extends unknown>(
  tuple: T[],
): tuple is [head: T, ...tail: T[]] {
  return tuple.length > 0;
}
