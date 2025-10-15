/**
 * Constants used throughout the application
 */

/**
 * Process management related constants
 */
export const PROCESS = {
  /** SIGTERM→SIGKILL wait time when stopping process (milliseconds) */
  SIGKILL_TIMEOUT_MS: 5000,

  /** Valid port number range */
  PORT_MIN: 1,
  PORT_MAX: 65535,
} as const;

/**
 * UI related constants
 */
export const UI = {
  /** URL copy completion display time (milliseconds) */
  URL_COPIED_DISPLAY_MS: 2000,
} as const;

/**
 * Log levels
 */
export const LOG_LEVEL = {
  INFO: 'info',
  ERROR: 'error',
  WARNING: 'warning',
} as const;

/**
 * Default port numbers (Streamlit)
 */
export const DEFAULT_PORTS = {
  STREAMLIT: 8501,
} as const;
