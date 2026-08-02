/**
 * matchPermissions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Role-Based Edit Permission helpers for CricScorer Pro.
 *
 * LOGIN TYPE MATRIX:
 *   'google'     → Full owner (Google UID-based, can create + edit + delete)
 *   'shareable'  → Full owner (Google OAuth with share code, can create + edit + delete)
 *   'code'       → Read-only viewer (can only view/watch, NO edits after match ends)
 *   'guest'      → Local only (can do everything locally, no cloud)
 *
 * PERMISSION RULES:
 *   Live match  → ALL login types can score (so scorers using code login can input balls)
 *   Complete match → Only 'google' / 'shareable' owners can delete or resume/edit
 *   createdByUid on match → Used to verify the specific owner of a match
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Owner Login Types ───────────────────────────────────────────────────────

/**
 * Returns true if the current session is an "owner" login
 * (google or shareable — can push to cloud, delete, create matches).
 */
export const isOwnerLogin = (loginType) => {
    return loginType === 'google' || loginType === 'shareable';
};

/**
 * Returns true if current session is a "code" viewer (read-only after match ends).
 */
export const isCodeViewer = (loginType) => {
    return loginType === 'code';
};

// ─── Session Helpers ─────────────────────────────────────────────────────────

/**
 * Get the current session from localStorage.
 * Returns a normalized object with loginType, userCode, uid, ownerEmail.
 */
export const getCurrentSession = () => {
    try {
        const str = localStorage.getItem('userSession') || localStorage.getItem('cricscorer_login');
        if (!str) return { loginType: 'guest' };
        return JSON.parse(str);
    } catch (e) {
        return { loginType: 'guest' };
    }
};

/**
 * Get the effective owner UID from a session.
 * For 'google' → Firebase UID (user.uid)
 * For 'shareable' → userCode (share code acts as owner identifier)
 * For 'code' / 'guest' → null
 */
export const getSessionOwnerUid = (session) => {
    if (!session) return null;
    if (session.loginType === 'google') return session.uid || session.userCode || null;
    if (session.loginType === 'shareable') return session.uid || session.userCode || null;
    return null;
};

// ─── Core Permission Function ─────────────────────────────────────────────────

/**
 * canEditMatch(match, session?)
 *
 * Determines whether the current user can edit/score/delete a given match.
 *
 * Rules:
 *  1. If match is LIVE or in INNINGS BREAK → all logins can score/edit
 *     (The scorer using a code login needs to be able to input balls live)
 *  2. If match is COMPLETE / SETUP → only the owner can edit or delete
 *     - 'google' or 'shareable' login = owner
 *     - 'code' login = view-only
 *     - 'guest' = local only (treated as owner of their own local data)
 *  3. If match has a `createdByUid` field, use that for fine-grained owner check
 *
 * @param {Object} match - The match object (from Firestore or localStorage)
 * @param {Object} [session] - Optional session override; reads localStorage if omitted
 * @returns {boolean}
 */
export const canEditMatch = (match, session = null) => {
    const sess = session || getCurrentSession();
    const loginType = sess?.loginType || 'guest';

    // ── Rule 1: Live / Innings Break → everyone can score ───────────────────
    const liveStatuses = ['live', 'innings_break', 'in_progress'];
    if (liveStatuses.includes(match?.matchStatus)) {
        console.log(`[Permission] canEditMatch ${match?.matchId}: LIVE → allowed for all (loginType=${loginType})`);
        return true;
    }

    // ── Rule 2: Guest → full local control ──────────────────────────────────
    if (loginType === 'guest') {
        console.log(`[Permission] canEditMatch ${match?.matchId}: guest → allowed locally`);
        return true;
    }

    // ── Rule 3: Code viewer → Bypassed for local/user control ───────────────
    if (loginType === 'code') {
        console.log(`[Permission] canEditMatch ${match?.matchId}: code viewer bypassed -> allowed`);
        return true;
    }

    // ── Rule 4: Owner login (google / shareable) ─────────────────────────────
    if (isOwnerLogin(loginType)) {
        // If the match has a createdByUid, verify it matches the current session owner
        if (match?.createdByUid) {
            const sessionOwnerUid = getSessionOwnerUid(sess);
            if (sessionOwnerUid && match.createdByUid !== sessionOwnerUid) {
                console.log(`[Permission] canEditMatch ${match?.matchId}: owner UID mismatch (match=${match.createdByUid}, session=${sessionOwnerUid}) → BLOCKED`);
                return false;
            }
        }
        console.log(`[Permission] canEditMatch ${match?.matchId}: owner login → allowed`);
        return true;
    }

    // Fallback: deny
    return false;
};

/**
 * canDeleteMatch(match, session?)
 *
 * Delete is stricter than edit: only owner logins can delete, never code viewers.
 * Guests can delete their own local-only data.
 */
export const canDeleteMatch = (match, session = null) => {
    const sess = session || getCurrentSession();
    const loginType = sess?.loginType || 'guest';

    // Code viewers NEVER delete
    if (loginType === 'code') {
        console.log(`[Permission] canDeleteMatch ${match?.matchId}: code viewer → BLOCKED`);
        return false;
    }

    // Guest → local delete only
    if (loginType === 'guest') return true;

    // Owner login with optional UID check
    if (isOwnerLogin(loginType)) {
        if (match?.createdByUid) {
            const sessionOwnerUid = getSessionOwnerUid(sess);
            if (sessionOwnerUid && match.createdByUid !== sessionOwnerUid) {
                console.log(`[Permission] canDeleteMatch ${match?.matchId}: owner UID mismatch → BLOCKED`);
                return false;
            }
        }
        return true;
    }

    return false;
};

/**
 * canResumeMatch(match, session?)
 *
 * Resuming (going back to live scoring) should only be allowed for:
 *  - Live/innings_break matches → any login can resume to continue scoring
 *  - Complete matches → only owner can resume (for undo / correction)
 */
export const canResumeMatch = (match, session = null) => {
    return canEditMatch(match, session);
};

/**
 * canCreateMatch(session?)
 *
 * Only 'google', 'shareable', or 'guest' can create matches.
 * Code viewers cannot create matches.
 */
export const canCreateMatch = () => {
    return true;
};

// ─── Owner Identity for New Matches ──────────────────────────────────────────

/**
 * buildOwnerIdentity(session)
 *
 * Returns the `createdByUid` and `createdByEmail` to embed in a new match record.
 * Call this when creating a new match in NewMatch.jsx.
 *
 * @param {Object} session - Current session from localStorage
 * @returns {{ createdByUid: string|null, createdByEmail: string|null, ownerLoginType: string }}
 */
export const buildOwnerIdentity = (session = null) => {
    const sess = session || getCurrentSession();
    return {
        createdByUid: getSessionOwnerUid(sess),
        createdByEmail: sess?.ownerEmail || null,
        ownerLoginType: sess?.loginType || 'guest',
    };
};
