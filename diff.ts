import { exists, mtime } from "./util.ts";

const filePath = ".make";

const diff = new Map<string, number>();

export async function load() {
  const entries: [string, number][] = (await exists(filePath))
    ? (JSON.parse(await Deno.readTextFile(filePath)) ?? [])
    : [];

  for (const [key, value] of entries) diff.set(key, value);
}

export function save() {
  return Deno.writeTextFile(
    filePath,
    JSON.stringify(Array.from(diff.entries()), null, 2),
  );
}

export function unchanged(filePath: string, mtime: number) {
  return (diff.get(filePath) ?? 0) >= mtime;
}

export async function update(filePath: string) {
  const time = await mtime(filePath);
  if (time !== undefined) {
    diff.set(filePath, time);
  } else {
    diff.delete(filePath);
  }
}
