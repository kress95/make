/** Checks if file exist. */
export async function exists(filePath: string) {
  return (await lstat(filePath)) !== undefined;
}

/** Fetches file modification time, returns undefined if file is not found. */
export async function mtime(filePath: string): Promise<number | undefined> {
  return (await lstat(filePath))?.mtime?.valueOf();
}

/** Fetches file info, returns undefined if file is not found. */
export async function lstat(
  filePath: string,
): Promise<Deno.FileInfo | undefined> {
  try {
    return await Deno.lstat(filePath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

/** Makes directory recursively, doesn't throw if directory already exists. */
export async function mkdirp(dirPath: string) {
  try {
    await Deno.mkdir(dirPath, { recursive: true });
  } catch (error) {
    const stat = await lstat(dirPath);
    if (stat && stat.isDirectory) return;
    throw error;
  }
}
