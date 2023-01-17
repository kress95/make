import {
  BaseHandler,
  bgWhite,
  black,
  bold,
  brightRed,
  log,
  red,
  white,
  yellow,
} from "./deps.ts";

class NoColorConsoleHandler extends BaseHandler {
  override format(logRecord: log.LogRecord): string {
    return super.format(logRecord);
  }

  override log(msg: string) {
    console.log(msg);
  }
}

export function get() {
  return log.getLogger("make");
}

export function setup(verbose: boolean) {
  log.setup({
    handlers: {
      internalConsole: new NoColorConsoleHandler("NOTSET", { formatter }),
      userlandConsole: new log.handlers.ConsoleHandler("NOTSET", { formatter }),
    },
    loggers: {
      "make": {
        level: verbose ? "NOTSET" : "INFO",
        handlers: ["internalConsole"],
      },
      "make:task": {
        level: "NOTSET",
        handlers: ["userlandConsole"],
      },
    },
  });
}

function formatter(record: log.LogRecord): string {
  const args = record.args.filter((str) => str !== "");
  const msg = formatTopic(record.msg, record.level);
  if (args.length === 0) return msg;
  return `${msg} ${args.join(" ")}`;
}

function formatTopic(msg: string, level: number) {
  if (level >= log.LogLevels.CRITICAL) return critical(msg);
  if (level >= log.LogLevels.ERROR) return error(msg);
  if (level >= log.LogLevels.WARNING) return warning(msg);
  if (level >= log.LogLevels.INFO) return info(msg);
  if (level >= log.LogLevels.DEBUG) return debug(msg);
  return msg;
}

function critical(msg: string) {
  return bold(brightRed(msg));
}

function error(msg: string) {
  return bold(red(msg));
}

function warning(msg: string) {
  return bold(yellow(msg));
}

function info(msg: string) {
  return bold(white(msg));
}

function debug(msg: string) {
  return bgWhite(black(msg));
}
