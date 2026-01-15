import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash a master password
 */
export async function hashMasterPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a master password against a hash
 */
export async function verifyMasterPassword(
    password: string,
    hash: string
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Master password session management
 * Stores in sessionStorage (expires when browser closes or daily)
 */
export const MasterPasswordSession = {
    /**
     * Set master password session
     */
    set: (userId: string) => {
        if (typeof window === 'undefined') return;

        const session = {
            userId,
            timestamp: Date.now(),
        };
        sessionStorage.setItem('master_password_session', JSON.stringify(session));
    },

    /**
     * Check if master password session is valid
     * Session expires after 24 hours
     */
    isValid: (userId: string): boolean => {
        if (typeof window === 'undefined') return false;

        const sessionData = sessionStorage.getItem('master_password_session');
        if (!sessionData) return false;

        try {
            const session = JSON.parse(sessionData);
            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            // Check if session belongs to this user and hasn't expired
            return (
                session.userId === userId &&
                now - session.timestamp < twentyFourHours
            );
        } catch {
            return false;
        }
    },

    /**
     * Clear master password session
     */
    clear: () => {
        if (typeof window === 'undefined') return;
        sessionStorage.removeItem('master_password_session');
    },
};
