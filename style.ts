import { black, blue, bold, cyan, green, red } from "./deps.ts";

export function subtitle(text: string) {
  return bold(black(text));
}

export function caption(text: string) {
  return cyan(text);
}

export function quote(text: string) {
  return caption(`'${text}'`);
}

export function em(text: string) {
  return blue(text);
}

export function ok(text: string) {
  return green(text);
}

export function error(text: string) {
  return red(text);
}
