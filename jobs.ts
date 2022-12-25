// this is not used for anything right now, but could be used to help logging
// when there's a single active branch or to help with displaying a spinner
// animation

const running = new Set<string>();
const waiting = new Set<string>();

export function create(name: string) {
  running.add(name);
}

export function setWaiting(name: string) {
  running.delete(name);
  waiting.add(name);
}

export function setRunning(name: string) {
  waiting.delete(name);
  running.add(name);
}

export function setStopped(name: string) {
  waiting.delete(name);
  running.delete(name);
}

export function getRunning() {
  return running.values();
}
