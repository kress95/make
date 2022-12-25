const entries: string[][] = [];
const tasks = new Set<string>();

export function register(name: string, description: string[]) {
  entries.push([name, ...description]);
  tasks.add(name);
}

export function has(name: string) {
  return tasks.has(name);
}

export function format() {
  return [
    ["Usage: make [options] [targets] ..."],
    ["Options:"],
    ...group([
      ["-h, --help", "Print this message and exit."],
      ["-c, --cereal", "Run all targets in serial mode."],
      ["-i, --instant", "Print logs from shell commands immediately."],
      ["-v, --verbose", "Print additional debug information."],
      ["-s, --silent", "Run in silent mode."],
    ]),
    ...(entries.length > 0 ? ["", "Targets:"] : []),
    ...group(entries),
  ].join("\n");
}

function group(lines: string[][]) {
  const rulers = [18];

  for (const line of lines) {
    line.forEach((part, i) => {
      if (part.length > (rulers[i] ?? 0)) {
        rulers[i] = part.length + 1;
      }
    });
  }

  return lines.map((line) =>
    "  " + line.map((str, i) => {
      return i < (line.length - 1)
        ? str + " ".repeat(rulers[i] - str.length)
        : str;
    }).join("")
  );
}
