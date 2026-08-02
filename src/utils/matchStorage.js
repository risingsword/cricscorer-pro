import { db } from '../firebase';
import { doc, setDoc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { saveNameToStorage } from './nameStorage';
import { addDeletedMatchId, getUserScope } from './dataFetcher';

const STORAGE_KEY = "cricscorer_matches";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Firestore document reference for a given match based on login type.
 * Returns null if sync is not applicable (guest, code-only, unknown).
 */
const getMatchDocRef = (loginType, ownerUid, matchId) => {
    if (!matchId || !ownerUid) return null;
    if (loginType === 'google') {
        return doc(db, 'googleUsers', ownerUid, 'matches', matchId);
    }
    if (loginType === 'shareable') {
        return doc(db, 'shareLogins', ownerUid, 'matches', matchId);
    }
    return null; // guest / code / unknown — no cloud sync
};

/**
 * Resolve the owner UID string from loginInfo.
 */
const resolveOwnerUid = (loginInfo) => {
    const loginType = loginInfo?.loginType || 'guest';
    if (loginType === 'google' && loginInfo?.uid) return loginInfo.uid;
    if ((loginType === 'shareable' || loginType === 'code') && loginInfo?.userCode) return loginInfo.userCode;
    return 'guest';
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE MATCH (local + async cloud)
// ─────────────────────────────────────────────────────────────────────────────

export const saveMatch = (matchData, loginInfo) => {
    const matchId = matchData.matchId || `match_${Date.now()}`;
    const loginType = loginInfo?.loginType || 'guest';
    const ownerUid = resolveOwnerUid(loginInfo);

    const now = Date.now();

    const matchObj = {
        matchId,
        loginType,
        ownerUid,
        matchData: { ...matchData, matchId },
        // --- LWW sync fields ---
        createdAt: matchData.createdAt || now,      // Set once, never overwritten
        updatedAt: now,                              // Always bumped on every save
        deletedAt: null,                             // Null until deleted
        // --- Legacy compat ---
        lastUpdated: now,
        deleted: false,
        pending_sync: true,
        pending_delete: false,
    };

    const userScope = getUserScope(loginInfo);
    const perMatchKey = `cricscorer_${userScope}_match_${matchId}`;
    try {
        localStorage.setItem(perMatchKey, JSON.stringify({ ...matchData, matchId, updatedAt: now, lastUpdated: now }));
    } catch (e) { }

    let matches = [];
    try {
        matches = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
        matches = [];
    }

    const existingIndex = matches.findIndex(m => m.matchId === matchId);
    if (existingIndex >= 0) {
        // Preserve original createdAt — never let it be overwritten
        matchObj.createdAt = matches[existingIndex].createdAt || matchObj.createdAt;
        matches[existingIndex] = { ...matches[existingIndex], ...matchObj };
        console.log(`[Sync] saveMatch: updated existing local record for ${matchId}, updatedAt=${now}`);
    } else {
        matches.push(matchObj);
        console.log(`[Sync] saveMatch: new local record for ${matchId}, createdAt=${now}`);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));

    // Save player names and team names for autocomplete
    if (matchData) {
        if (matchData.team1?.name) saveNameToStorage(matchData.team1.name);
        if (matchData.team2?.name) saveNameToStorage(matchData.team2.name);
        if (matchData.innings) {
            matchData.innings.forEach(inn => {
                if (inn.batsmen) inn.batsmen.forEach(b => saveNameToStorage(b.name));
                if (inn.bowlers) inn.bowlers.forEach(b => saveNameToStorage(b.name));
            });
        }
    }

    // Async LWW push to cloud — does NOT blindly overwrite
    syncToCloud(matchObj).catch(err => {
        console.warn('[Sync] Silent sync error on save:', err);
    });

    return matchId;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL MATCHES (local, filtered)
// ─────────────────────────────────────────────────────────────────────────────

export const getAllMatches = (loginInfo) => {
    let matches = [];
    try {
        matches = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
        matches = [];
    }

    const loginType = loginInfo?.loginType || 'guest';
    const ownerUid = resolveOwnerUid(loginInfo);

    // Exclude soft-deleted and pending-delete records from UI display
    return matches.filter(m =>
        m.ownerUid === ownerUid &&
        m.loginType === loginType &&
        !m.pending_delete &&
        !m.deletedAt           // LWW tombstone check
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE MATCH (soft delete → tombstone push)
// ─────────────────────────────────────────────────────────────────────────────

export const deleteMatch = (matchId, loginInfo) => {
    if (typeof window !== 'undefined' && !window.confirm('Are you sure? This cannot be undone.')) {
        return;
    }

    const now = Date.now();

    let matches = [];
    try {
        matches = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
        matches = [];
    }

    const matchIndex = matches.findIndex(m => m.matchId === matchId);
    if (matchIndex >= 0) {
        matches[matchIndex].pending_delete = true;
        matches[matchIndex].deleted = true;
        matches[matchIndex].deletedAt = now;    // LWW tombstone timestamp
        matches[matchIndex].updatedAt = now;    // Bump updatedAt so other devices know this is newer
        matches[matchIndex].lastUpdated = now;  // Legacy compat
        localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
        console.log(`[Sync] deleteMatch: soft-deleted ${matchId} locally, deletedAt=${now}`);
    }

    // Persist delete in the global deleted list — survives app restarts
    addDeletedMatchId(matchId);

    // Push tombstone to cloud
    deleteFromCloud(matchId, loginInfo).catch(err => {
        console.warn('[Sync] Silent delete error:', err);
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// SYNC TO CLOUD — LWW: only push if local is NEWER than cloud
// ─────────────────────────────────────────────────────────────────────────────

export const syncToCloud = async (matchObj) => {
    const { loginType, ownerUid, matchId, matchData } = matchObj;

    // Do not sync read-only code logins or guest logins
    if (loginType === 'code' || loginType === 'guest') {
        markMatchSynced(matchId);
        return;
    }

    const docRef = getMatchDocRef(loginType, ownerUid, matchId);
    if (!docRef) {
        markMatchSynced(matchId);
        return;
    }

    try {
        // ── LWW Check: read cloud record first ──────────────────────────────
        const cloudSnap = await getDoc(docRef);
        const localUpdatedAt = matchObj.updatedAt || matchObj.lastUpdated || 0;

        if (cloudSnap.exists()) {
            const cloudData = cloudSnap.data();

            // If cloud has a tombstone that is NEWER than local update → do NOT resurrect
            const cloudDeletedAt = cloudData.deletedAt || 0;
            if (cloudDeletedAt && cloudDeletedAt >= localUpdatedAt) {
                console.log(`[Sync] PUSH ${matchId} — SKIPPED: cloud tombstone is newer (cloudDeletedAt=${cloudDeletedAt}, localUpdatedAt=${localUpdatedAt}). Not resurrecting.`);
                // Respect cloud tombstone locally
                addDeletedMatchId(matchId);
                markMatchSynced(matchId);
                return;
            }

            // Standard LWW: cloud is newer or equal → skip push
            const cloudUpdatedAt = cloudData.updatedAt || cloudData.lastUpdated || 0;
            if (cloudUpdatedAt >= localUpdatedAt) {
                console.log(`[Sync] PUSH ${matchId} — SKIPPED: cloud is newer or equal (cloudUpdatedAt=${cloudUpdatedAt}, localUpdatedAt=${localUpdatedAt})`);
                markMatchSynced(matchId);
                return;
            }

            console.log(`[Sync] PUSH ${matchId} — local is newer (localUpdatedAt=${localUpdatedAt}, cloudUpdatedAt=${cloudUpdatedAt}), pushing`);
        } else {
            console.log(`[Sync] PUSH ${matchId} — new record, pushing to cloud`);
        }

        // Strip heavy fields before uploading
        const { history, ...rawData } = (matchData || matchObj);
        const clean = {
            ...rawData,
            matchId,
            deleted: false,
            deletedAt: null,
            updatedAt: localUpdatedAt,
            lastUpdated: localUpdatedAt,   // legacy compat
            createdAt: matchObj.createdAt || localUpdatedAt,
        };
        // Strip wagonData per-batsman (stored separately in timeline already)
        if (clean.innings) {
            clean.innings = clean.innings.map(inn => ({
                ...inn,
                batsmen: (inn.batsmen || []).map(({ wagonData, ...b }) => b)
            }));
        }

        await setDoc(docRef, clean);
        markMatchSynced(matchId);
        console.log(`[Sync] PUSH ${matchId} — SUCCESS`);
    } catch (error) {
        console.warn(`[Sync] PUSH ${matchId} — FAILED:`, error);
        throw error; // Keep pending_sync=true so it retries
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE FROM CLOUD — Tombstone write
// ─────────────────────────────────────────────────────────────────────────────

export const deleteFromCloud = async (matchId, loginInfo) => {
    const loginType = loginInfo?.loginType || 'guest';
    const ownerUid = resolveOwnerUid(loginInfo);

    if (loginType === 'code' || loginType === 'guest') {
        removeMatchLocally(matchId);
        return;
    }

    const docRef = getMatchDocRef(loginType, ownerUid, matchId);
    if (!docRef) {
        removeMatchLocally(matchId);
        return;
    }

    // Build parent ref for currentMatch cleanup
    let parentRef = null;
    if (loginType === 'google') {
        parentRef = doc(db, 'googleUsers', ownerUid);
    } else if (loginType === 'shareable') {
        parentRef = doc(db, 'shareLogins', ownerUid);
    }

    const now = Date.now();

    try {
        // Write tombstone — other devices will see deletedAt and purge locally
        await setDoc(docRef, {
            matchId: matchId,
            deleted: true,
            deletedAt: now,
            updatedAt: now,
            lastUpdated: now,   // legacy compat
        });

        console.log(`[Sync] DELETE ${matchId} — tombstone pushed to cloud at ${now}`);

        // Clean up currentMatch on parent doc if it points to this matchId
        if (parentRef) {
            try {
                const pDocSnap = await getDoc(parentRef);
                if (pDocSnap.exists() && pDocSnap.data()?.currentMatch?.matchId === matchId) {
                    await updateDoc(parentRef, { currentMatch: deleteField() });
                    console.log(`[Sync] DELETE ${matchId} — cleared currentMatch on parent doc`);
                }
            } catch (subErr) {
                console.warn('[Sync] Failed to clean up currentMatch on parent doc:', subErr);
            }
        }

        removeMatchLocally(matchId);
    } catch (error) {
        console.warn(`[Sync] DELETE ${matchId} — cloud push FAILED:`, error);
        throw error; // Keep pending_delete=true so it retries
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const markMatchSynced = (matchId) => {
    try {
        let matches = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const matchIndex = matches.findIndex(m => m.matchId === matchId);
        if (matchIndex >= 0) {
            matches[matchIndex].pending_sync = false;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
        }
    } catch (e) {
        console.warn('[Sync] Failed to mark match synced locally:', e);
    }
};

const removeMatchLocally = (matchId) => {
    try {
        let matches = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        matches = matches.filter(m => m.matchId !== matchId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
        console.log(`[Sync] removeMatchLocally: purged ${matchId} from STORAGE_KEY`);
    } catch (e) {
        console.warn('[Sync] Failed to remove match locally:', e);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SYNC PENDING — retry pending pushes and deletes on reconnect / app resume
// ─────────────────────────────────────────────────────────────────────────────

export const syncPendingMatches = async (loginInfo) => {
    let matches = [];
    try {
        matches = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
        matches = [];
    }

    const loginType = loginInfo?.loginType || 'guest';
    const ownerUid = resolveOwnerUid(loginInfo);

    const pendingSyncs = matches.filter(m =>
        m.pending_sync &&
        !m.pending_delete &&
        !m.deletedAt &&           // Don't push tombstoned records as live
        m.ownerUid === ownerUid &&
        m.loginType === loginType
    );

    const pendingDeletes = matches.filter(m =>
        m.pending_delete &&
        m.ownerUid === ownerUid &&
        m.loginType === loginType
    );

    console.log(`[Sync] syncPendingMatches: ${pendingSyncs.length} pending pushes, ${pendingDeletes.length} pending deletes`);

    for (const matchObj of pendingSyncs) {
        syncToCloud(matchObj).catch(err => console.warn('[Sync] Silent sync retry error:', err));
    }

    for (const matchObj of pendingDeletes) {
        deleteFromCloud(matchObj.matchId, loginInfo).catch(err => console.warn('[Sync] Silent delete retry error:', err));
    }
};
