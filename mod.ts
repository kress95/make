export { cli, defaultTask, desc, rule, run, task } from "./dsl.ts";
export { exists, lstat, mkdirp } from "./util.ts";
export type { Action, Config, Target } from "./target.ts";

// TODO: support exclusion patterns (the pipeline then would be a pipeline
//       of `concat` and `filter`)
