type Run = (target: string) => Promise<boolean | void>;

export function serial(run: Run) {
  return async function (...targets: string[]) {
    if (targets.length === 0) return false;

    let changed = false;

    for (const target of targets) {
      if (await run(target) !== false) changed = true;
    }

    return changed;
  };
}

export function concurrent(run: Run) {
  return async function (...targets: string[]) {
    if (targets.length === 0) return false;

    for (const result of await Promise.all(targets.map(run))) {
      if (result !== false) return true;
    }

    return false;
  };
}

export function create(run: Run, isSerial?: boolean) {
  return (isSerial === true ? serial : concurrent)(run);
}
