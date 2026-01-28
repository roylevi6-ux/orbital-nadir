/**
 * Simple logging utility that can be disabled in production
 * Replace console.log calls with these functions for better control
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
    /**
     * Log debug information - only in development
     */
    debug: (...args: unknown[]) => {
        if (isDev) {
            console.log('[DEBUG]', ...args);
        }
    },

    /**
     * Log general info - always visible (needed for production debugging)
     */
    info: (...args: unknown[]) => {
        console.info('[INFO]', ...args);
    },

    /**
     * Log warnings - always visible
     */
    warn: (...args: unknown[]) => {
        console.warn('[WARN]', ...args);
    },

    /**
     * Log errors - always visible
     */
    error: (...args: unknown[]) => {
        console.error('[ERROR]', ...args);
    },
};

export default logger;
