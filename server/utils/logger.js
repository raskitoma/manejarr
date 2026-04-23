/**
 * Structured Logger
 *
 * Provides consistent log formatting with timestamps and categories.
 */

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const COLORS = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  debug: '\x1b[90m',
  reset: '\x1b[0m',
};

function formatTimestamp() {
  return new Date().toISOString();
}

function log(level, category, message, metadata = null) {
  const color = COLORS[level] || COLORS.info;
  const reset = COLORS.reset;
  const timestamp = formatTimestamp();
  const prefix = `${color}[${timestamp}] [${level.toUpperCase()}] [${category}]${reset}`;

  if (level === 'error') {
    console.error(`${prefix} ${message}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }

  if (metadata) {
    console.log(`${color}  └─ ${JSON.stringify(metadata)}${reset}`);
  }
}

export const logger = {
  error: (category, message, metadata) => log('error', category, message, metadata),
  warn: (category, message, metadata) => log('warn', category, message, metadata),
  info: (category, message, metadata) => log('info', category, message, metadata),
  debug: (category, message, metadata) => log('debug', category, message, metadata),
};
