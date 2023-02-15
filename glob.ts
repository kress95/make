import { globToRegExp, isGlob, walk } from "./deps.ts";

export async function glob(pattern: string) {
  return await list(pattern);
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
