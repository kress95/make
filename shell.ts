import { ShellCommandError } from "./report_error.ts";
import * as style from "./style.ts";
import { Logger } from "./logger.ts";

type Sh = (cmd: string[]) => Promise<void>;

type Spawn = (cmd: string[], fmt: string) => Promise<{
  logs: string | undefined;
  code: number;
}>;

const successString = style.ok("success");
const errorString = style.error("error");
const outputFromString = style.caption("output from");

function serial(sh: Sh) {
  return async function (...commands: string[][]) {
    for (const command of commands) await sh(command);
  };
}

function concurrent(sh: Sh) {
  return async function (...commands: string[][]) {
    await Promise.all(commands.map(sh));
  };
}

function sh(spawn: Spawn, logger: Logger) {
  return async function (cmd: string[]) {
    const fmt = style.em("$ " + cmd.join(" "));
    const { logs, code } = await spawn(cmd, fmt);

    const msg = logs !== undefined
      ? `${outputFromString} ${fmt}\n${logs}`
      : undefined;

    if (code !== 0) {
      if (msg !== undefined) logger.error("sh:", msg);
      logger.error("sh:", errorString, fmt);
      throw new ShellCommandError(fmt, code);
    }

    if (msg !== undefined) logger.info("sh:", msg);
    logger.info("sh:", successString, fmt);
  };
}

export function create(spawn: Spawn, logger: Logger, isSerial?: boolean) {
  return (isSerial === true ? serial : concurrent)(sh(spawn, logger));
}
