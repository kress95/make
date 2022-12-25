import { globToRegExp, isGlob, normalize, walk } from "./deps.ts";

const expanded = new Map<string, string[]>();

export async function expand(name: string) {
  const pattern = format(name);
  const cached = expanded.get(pattern);
  if (cached !== undefined) return cached;

  const listed = await list(pattern);
  expanded.set(pattern, listed);

  return listed;
}

export function format(name: string) {
  return isGlob(name) ? name : normalize(name);
}

async function list(pattern: string) {
  if (!isGlob(pattern)) return [pattern];

  const match = [globToRegExp(pattern)];
  const entries: string[] = [];

  for await (const entry of walk(".", { match })) {
    entries.push(entry.path);
  }

  return entries;
}
