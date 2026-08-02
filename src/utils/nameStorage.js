/**
 * Name Storage - Only shows names used in 2+ matches
 * Scans localStorage match data to build frequency-based suggestions
 */

const CACHE_KEY = 'cricscorer_name_freq_cache';
const CACHE_TTL = 60000; // 1 minute cache

let _nameCache = null;
let _lastCacheTime = 0;

/**
 * Scan all matches in localStorage and count how many unique matches each name appears in.
 * Returns a Map of name -> matchCount
 */
const buildNameFrequencyMap = () => {
    const now = Date.now();
    if (_nameCache && (now - _lastCacheTime) < CACHE_TTL) {
        return _nameCache;
    }

    const nameMatchMap = new Map(); // name -> Set of matchIds

    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.includes('_match_')) continue;

            try {
                const data = JSON.parse(localStorage.getItem(key));
                if (!data || !data.matchId || !data.innings) continue;

                // Only consider names from fully COMPLETED matches
                if (data.matchStatus !== 'complete' && data.matchStatus !== 'completed') continue;

                const matchId = data.matchId;
                data.innings.forEach(inn => {
                    if (inn.batsmen) {
                        inn.batsmen.forEach(b => {
                            if (b.name && b.name.trim().length >= 2) {
                                const name = b.name.trim().toUpperCase();
                                if (!nameMatchMap.has(name)) nameMatchMap.set(name, new Set());
                                nameMatchMap.get(name).add(matchId);
                            }
                        });
                    }
                    if (inn.bowlers) {
                        inn.bowlers.forEach(b => {
                            if (b.name && b.name.trim().length >= 2) {
                                const name = b.name.trim().toUpperCase();
                                if (!nameMatchMap.has(name)) nameMatchMap.set(name, new Set());
                                nameMatchMap.get(name).add(matchId);
                            }
                        });
                    }
                });
            } catch (e) { /* skip invalid entries */ }
        }
        
        // cricscorer_blocked_names is intentionally kept — it stores permanently hidden players
    } catch (e) {
        console.error("Failed to build name frequency map", e);
    }

    // Convert Set sizes to counts
    const freqMap = new Map();
    nameMatchMap.forEach((matchIds, name) => {
        freqMap.set(name, matchIds.size);
    });

    _nameCache = freqMap;
    _lastCacheTime = now;

    return freqMap;
};

/**
 * Get names used in 2+ matches, sorted by frequency (most used first)
 */
export const getSavedNames = () => {
    const freqMap = buildNameFrequencyMap();
    const qualified = [];

    freqMap.forEach((count, name) => {
        if (count >= 1) {
            qualified.push({ name, count });
        }
    });

    // Sort by frequency (most used first), then alphabetically
    qualified.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return qualified.map(q => q.name);
};

/**
 * Returns the number of matches a given name has appeared in.
 * Used by NameInput to decide if the X (dismiss) button should be shown.
 */
export const getNameMatchCount = (name) => {
    if (!name) return 0;
    const freqMap = buildNameFrequencyMap();
    return freqMap.get(name.trim().toUpperCase()) || 0;
};

// ── Session-only dismiss set ──────────────────────────────────────────────
// Names crossed out during this session are hidden from suggestions ONLY
// until the app is reloaded OR the name is entered again.
// Nothing is written to localStorage — no permanent data loss.
const sessionDismissed = new Set();

/**
 * No-op - we no longer save names on blur.
 * Names are derived from match data.
 */
export const saveNameToStorage = (_name) => {
    // Intentionally empty - names come from match data now
};

/**
 * Dismiss a name from suggestions for this session only.
 * Does NOT permanently block it — if the user types and submits
 * the name again it will reappear in future suggestions.
 */
export const removeNameFromStorage = (name) => {
    if (name) {
        sessionDismissed.add(name.trim().toUpperCase());
        // Invalidate cache so suggestions refresh immediately
        _nameCache = null;
        _lastCacheTime = 0;
    }
};

/**
 * Un-dismiss a name (called when user actually selects / enters the name).
 * Also clears the old permanent blocklist if it somehow still exists.
 */
export const unblockNameFromStorage = (name) => {
    if (name) {
        sessionDismissed.delete(name.trim().toUpperCase());
        _nameCache = null;
        _lastCacheTime = 0;
        sessionStorage.removeItem('cricscorer_players_list');
    }
    // cricscorer_blocked_names is kept intentionally for persistent player hiding
};

/**
 * No-op for backward compatibility
 */
export const saveMultipleNamesToStorage = (_names) => {
    // Intentionally empty - names come from match data now
};

/**
 * Filter names that appear in 2+ matches, matching the query
 */
export const filterNames = (query) => {
    const freqMap = buildNameFrequencyMap();

    const q = (query || "").trim().toLowerCase();
    const qualified = [];

    freqMap.forEach((count, name) => {
        // Skip names dismissed this session
        if (sessionDismissed.has(name.toUpperCase())) return;
        if (count >= 1) {
            qualified.push({ name, count });
        }
    });

    if (!q) {
        qualified.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        return qualified.slice(0, 20).map(q => q.name);
    }

    const exact      = qualified.filter(n => n.name.toLowerCase() === q);
    const startsWith = qualified.filter(n => n.name.toLowerCase() !== q && n.name.toLowerCase().startsWith(q));
    const contains   = qualified.filter(n => !n.name.toLowerCase().startsWith(q) && n.name.toLowerCase().includes(q));

    startsWith.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    contains.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return [...exact, ...startsWith, ...contains].slice(0, 30).map(q => q.name);
};

/**
 * Force refresh the name cache (call after match save/sync)
 */
export const refreshNameCache = () => {
    _nameCache = null;
    _lastCacheTime = 0;
};
