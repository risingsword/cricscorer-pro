import { 
    click_nice, 
    vine_boom, 
    koun_hai_re_8ep4nAR_Ringtone, 
    aisa_mat_karo_Ringtone, 
    wow_kya_ladka_hai_very_handsome_boy_Ringtone, 
    rom_rom_bhaiyo, 
    faaah_Ringtone 
} from './sounds.js';

export const isMemeMode = () => {
    return localStorage.getItem("cricscorer_meme_mode") === "true";
};

export const processedBatsmen = new Set(); 
const activeSounds = new Map();
const lastPlayedTimes = new Map();

export const stopAllSounds = () => {
    activeSounds.forEach((audio) => {
        try {
            audio.onended = null; // Prevents sequential callback chains from triggering on interruption
            audio.pause();
            audio.currentTime = 0;
        } catch (e) {}
    });
    activeSounds.clear();
};

export const playSound = (key, base64DataUrl, onEndedCallback = null) => {
    if (!isMemeMode()) return;

    const now = Date.now();
    const lastPlayed = lastPlayedTimes.get(key) || 0;
    if (now - lastPlayed < 500) return; // 500ms cooldown

    // Stop existing instance of same key if playing
    if (activeSounds.has(key)) {
        const existing = activeSounds.get(key);
        try { existing.pause(); existing.currentTime = 0; } catch (e) {}
        activeSounds.delete(key);
    }

    try {
        const audio = new Audio(base64DataUrl);
        activeSounds.set(key, audio);
        lastPlayedTimes.set(key, now);

        audio.onended = () => {
            activeSounds.delete(key);
            if (onEndedCallback) onEndedCallback();
        };

        audio.play().catch(e => {
            activeSounds.delete(key);
        });
    } catch (e) {
        activeSounds.delete(key);
    }
};

export const playIntroSound = (name) => {
    if (!name || !isMemeMode()) return;
    const nameLower = name.trim().toLowerCase();
    
    if (!processedBatsmen.has(nameLower)) {
        if (nameLower.includes("shakti") || nameLower.includes("shivshakti")) {
            processedBatsmen.add(nameLower);
            playSound('rom_rom_bhaiyo', rom_rom_bhaiyo);
        }
    }
};

export const playBallSound = (ballResult, ballLog = [], inningsNumber = 1, batsmanName = "") => {
    if (!isMemeMode()) return;

    // Rule 3 Stop All sound triggers
    stopAllSounds();

    const { runs, isWide, isNoBall, isWicket } = ballResult;
    const isLegal = !isWide && !isNoBall;

    if (isWicket) {
        playSound('faaah_Ringtone', faaah_Ringtone);
        return;
    }
    
    // FILTER BALL LOG for consecutive analysis (legal balls only)
    const legalLog = ballLog.filter(b => !b.isWide && !b.isNoBall);
    
    // CALCULATE RULE 5 - 3 CONSECUTIVE BOUNDARIES FIRST
    let is3ConsecutiveBoundaries = false;
    if (legalLog.length >= 2) {
        const lastBall = legalLog[legalLog.length - 1];
        const ballBefore = legalLog[legalLog.length - 2];
        const currentBoundary = (runs === 4 || runs === 6);
        const lastBoundary = (lastBall.runs === 4 || lastBall.runs === 6);
        const beforeBoundary = (ballBefore.runs === 4 || ballBefore.runs === 6);
        if (currentBoundary && lastBoundary && beforeBoundary) {
            is3ConsecutiveBoundaries = true;
        }
    }

    // RULE 1 - EVERY DOT BALL
    if (runs === 0 && isLegal) {
        playSound('vine_boom', vine_boom);
    }

    // RULE 2 - FOUR
    if (runs === 4) {
        playSound('click_nice', click_nice);
    }

    // RULE 3 - SIX
    if (runs === 6) {
        playSound('click_nice', click_nice);
    }

    if (legalLog.length >= 2) {
        const lastBall = legalLog[legalLog.length - 1];
        const ballBefore = legalLog[legalLog.length - 2];

        // RULE 4 - 3 CONSECUTIVE DOTS
        if (runs === 0 && lastBall.runs === 0 && ballBefore.runs === 0) {
            const key = inningsNumber === 1 ? 'koun_hai_re' : 'aisa_mat_karo';
            const sound = inningsNumber === 1 ? koun_hai_re_8ep4nAR_Ringtone : aisa_mat_karo_Ringtone;
            setTimeout(() => playSound(key, sound), 400); 
        }

        // RULE 5 - 3 CONSECUTIVE BOUNDARIES
        if (is3ConsecutiveBoundaries) {
            setTimeout(() => playSound('handsome_boy', wow_kya_ladka_hai_very_handsome_boy_Ringtone), 400);
        }
    }
}
;
