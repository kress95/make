import { normalize, sep } from "./deps.ts";

export function format(target: string, parent: string) {
  return formatWith(target, normalize(parent).split(sep));
}

export function formatWith(target: string, parent: string[]) {
  return parent.reduce(formatReduce, target);
}

function formatReduce(target: string, part: string, index: number) {
  return target.replaceAll(`{${index}}`, part);
}
