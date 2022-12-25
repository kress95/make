import { format } from "./expand.ts";
import { globToRegExp, isGlob } from "./deps.ts";
import type { Action, Resolved } from "./target.ts";

const rulesByPath = new Map<string, Resolved>();
const rulesByPattern: { pattern: RegExp; rule: Resolved }[] = [];
const rules = new Set<string>();

export function add(pattern: string, prereqs: string[], action: Action) {
  const name = format(pattern);

  if (rules.has(name)) throw new Error("conflicts with existing rule");

  const rule = { task: false, name, prereqs, action };
  rules.add(name);

  if (isGlob(name)) {
    rulesByPattern.push({ pattern: globToRegExp(name), rule });
    return;
  }

  rulesByPath.set(name, rule);
}

export function find(name: string) {
  return rulesByPath.get(name) ?? match(name);
}

function match(name: string) {
  for (const { pattern, rule } of rulesByPattern) {
    if (pattern.test(name)) return rule;
  }
}
