import { isGlob, normalize } from "./deps.ts";
import { glob } from "./util.ts";

const expanded = new Map<string, string[]>();

export async function expand(name: string) {
  const pattern = format(name);
  const cached = expanded.get(pattern);
  if (cached !== undefined) return cached;

  const listed = await glob(pattern);
  expanded.set(pattern, listed);

  return listed;
}

export function format(name: string) {
  return isGlob(name) ? name : normalize(name);
}
