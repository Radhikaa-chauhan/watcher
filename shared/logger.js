const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? 1;

function fmt(level, service, msg, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta
    ? ' ' + (meta instanceof Error
        ? meta.stack ?? meta.message
        : JSON.stringify(meta))
    : '';
  return `${ts} [${level.toUpperCase()}] [${service}] ${msg}${metaStr}`;
}

export function createLogger(service) {
  return {
    debug(msg, meta) {
      if (MIN_LEVEL <= LEVELS.debug) console.debug(fmt('debug', service, msg, meta));
    },
    info(msg, meta) {
      if (MIN_LEVEL <= LEVELS.info) console.log(fmt('info', service, msg, meta));
    },
    warn(msg, meta) {
      if (MIN_LEVEL <= LEVELS.warn) console.warn(fmt('warn', service, msg, meta));
    },
    error(msg, meta) {
      if (MIN_LEVEL <= LEVELS.error) console.error(fmt('error', service, msg, meta));
    },
  };
}
