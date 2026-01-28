export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerLike {
  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

function sortKeys(obj: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  );
}

export class Logger implements LoggerLike {
  private readonly levelThreshold: LogLevel;

  constructor(private readonly scope: string = "app") {
    this.levelThreshold = resolveLevel(process.env.LOG_LEVEL);
  }
  private emit(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (!shouldLog(level, this.levelThreshold)) return;
    const time = new Date().toISOString();
    const payload = meta && Object.keys(meta).length
      ? ` | ${JSON.stringify(sortKeys(meta))}`
      : "";
    // eslint-disable-next-line no-console
    console.log(`[${time}] [${this.scope}] [${level.toUpperCase()}] ${msg}${payload}`);
  }
  log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    this.emit(level, msg, meta);
  }
  debug(msg: string, meta?: Record<string, unknown>) {
    this.emit("debug", msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>) {
    this.emit("info", msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    this.emit("warn", msg, meta);
  }
  error(msg: string, meta?: Record<string, unknown>) {
    this.emit("error", msg, meta);
  }
}

const levelWeights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: LogLevel, threshold: LogLevel) {
  return levelWeights[level] >= levelWeights[threshold];
}

function resolveLevel(envLevel: string | undefined): LogLevel {
  if (!envLevel) return "info";
  const normalized = envLevel.trim().toLowerCase();
  if (normalized === "debug") return "debug";
  if (normalized === "info") return "info";
  if (normalized === "warn" || normalized === "warning") return "warn";
  if (normalized === "error") return "error";
  return "info";
}
