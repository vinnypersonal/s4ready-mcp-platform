/**
 * Structured logger. JSON in production, pretty in dev.
 * Designed so that BTP Application Logging Service picks up the JSON output.
 */

import winston from 'winston';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const isProd = process.env.NODE_ENV === 'production' || process.env.DEPLOY_MODE === 'btp';

const winstonLogger = winston.createLogger({
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  format: isProd
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
          const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} ${level} ${message}${meta}`;
        })
      ),
  transports: [new winston.transports.Console()]
});

class WinstonLoggerAdapter implements Logger {
  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.debug(message, { ...this.bindings, ...meta });
  }
  info(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.info(message, { ...this.bindings, ...meta });
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.warn(message, { ...this.bindings, ...meta });
  }
  error(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.error(message, { ...this.bindings, ...meta });
  }
  child(bindings: Record<string, unknown>): Logger {
    return new WinstonLoggerAdapter({ ...this.bindings, ...bindings });
  }
}

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return new WinstonLoggerAdapter(bindings);
}

export { WinstonLoggerAdapter as DefaultLogger };
