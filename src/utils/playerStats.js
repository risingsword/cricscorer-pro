/**
 * Utility functions for calculating player statistics.
 */

/**
 * Calculates win impact stats for a single player regarding Not Outs.
 * @param {string} playerName - The name of the player to calculate stats for.
 * @param {Array} matches - The array of matches to process (usually pre-filtered by type).
 * @returns {Object} Object containing totalNotOuts, notOutWins, and winPercentage
 */
export const calculateNotOutWinStats = (playerName, matches) => {
    let totalNotOuts = 0;
    let notOutWins = 0;
    const nameKey = playerName.trim().toLowerCase();

    matches.forEach(match => {
        // Only consider matches with a declared winner (ignore ongoing/abandoned)
        if (!match.winner || match.winner === 'Tie') return;

        (match.innings || []).forEach(inn => {
            const bTeam = inn.battingTeam || '';
            // Determine if the player's team won this match
            const wonMatch = match.winner.trim().toLowerCase() === bTeam.trim().toLowerCase();

            (inn.batsmen || []).forEach(b => {
                if (b.name?.trim().toLowerCase() === nameKey) {
                    // Consider Not Out only if they were not dismissed.
                    // Also ensuring they actually batted (played balls or scored runs or just in list as not out and it's not a retired out)
                    if (!b.isOut && b.dismissalType !== 'retired') {
                        totalNotOuts++;
                        if (wonMatch) {
                            notOutWins++;
                        }
                    }
                }
            });
        });
    });

    const winPercentage = totalNotOuts > 0 ? ((notOutWins / totalNotOuts) * 100).toFixed(0) : 0;

    return {
        totalNotOuts,
        notOutWins,
        winPercentage: Number(winPercentage)
    };
};

/**
 * Calculates win impact stats for a single player regarding Run Milestones (50s, 100s).
 * @param {string} playerName - The name of the player to calculate stats for.
 * @param {Array} matches - The array of matches to process.
 * @returns {Object} Object containing counts and win stats for milestones
 */
export const calculateRunMilestoneWinStats = (playerName, matches) => {
    let thirties = 0;
    let thirtyWins = 0;
    let fifties = 0;
    let fiftyWins = 0;
    let hundreds = 0;
    let hundredWins = 0;

    const nameKey = playerName.trim().toLowerCase();

    matches.forEach(match => {
        if (!match.winner || match.winner === 'Tie') return;

        (match.innings || []).forEach(inn => {
            const bTeam = inn.battingTeam || '';
            const wonMatch = match.winner.trim().toLowerCase() === bTeam.trim().toLowerCase();

            (inn.batsmen || []).forEach(b => {
                if (b.name?.trim().toLowerCase() === nameKey) {
                    const runs = b.runs || 0;

                    // 100+ runs milestone
                    if (runs >= 100) {
                        hundreds++;
                        if (wonMatch) hundredWins++;
                    } 
                    // 50+ runs milestone (excluding hundreds for accurate bucketing)
                    else if (runs >= 50) {
                        fifties++;
                        if (wonMatch) fiftyWins++;
                    }
                    // 30+ runs milestone (excluding fifties and hundreds)
                    else if (runs >= 30) {
                        thirties++;
                        if (wonMatch) thirtyWins++;
                    }
                }
            });
        });
    });

    const thirtyWinPct = thirties > 0 ? ((thirtyWins / thirties) * 100).toFixed(0) : 0;
    const fiftyWinPct = fifties > 0 ? ((fiftyWins / fifties) * 100).toFixed(0) : 0;
    const hundredWinPct = hundreds > 0 ? ((hundredWins / hundreds) * 100).toFixed(0) : 0;

    return {
        thirties,
        thirtyWins,
        thirtyWinPercentage: Number(thirtyWinPct),
        fifties,
        fiftyWins,
        fiftyWinPercentage: Number(fiftyWinPct),
        hundreds,
        hundredWins,
        hundredWinPercentage: Number(hundredWinPct)
    };
};

/**
 * Calculates win impact stats for a single player regarding Bowling Milestones (3+ wkts, 5+ wkts).
 * @param {string} playerName - The name of the player to calculate stats for.
 * @param {Array} matches - The array of matches to process.
 * @returns {Object} Object containing counts and win stats for milestones
 */
export const calculateBowlingWinStats = (playerName, matches) => {
    let threeWickets = 0; let threeWktWins = 0;
    let fiveWickets = 0; let fiveWktWins = 0;

    const nameKey = playerName.trim().toLowerCase();

    matches.forEach(match => {
        if (!match || !match.winner || match.winner === 'Tie') return;

        (match.innings || []).forEach(inn => {
            const bTeam = inn.battingTeam || '';
            const t1Name = (typeof match.team1 === 'object' ? match.team1?.name : match.team1) || '';
            const t2Name = (typeof match.team2 === 'object' ? match.team2?.name : match.team2) || '';
            let bowlTeam = inn.bowlingTeam || '';
            if (!bowlTeam && t1Name && t2Name) {
                bowlTeam = t1Name.trim().toLowerCase() === bTeam.trim().toLowerCase() ? t2Name : t1Name;
            }
            if (!bowlTeam) return;

            const wonMatch = String(match.winner).trim().toLowerCase() === String(bowlTeam).trim().toLowerCase();

            (inn.bowlers || []).forEach(b => {
                if (b.name?.trim().toLowerCase() === nameKey) {
                    const wkts = b.wickets || 0;

                    if (wkts >= 5) {
                        fiveWickets++;
                        if (wonMatch) fiveWktWins++;
                    }
                    if (wkts >= 3) {
                        threeWickets++;
                        if (wonMatch) threeWktWins++;
                    }
                }
            });
        });
    });

    const threeWktWinPct = threeWickets > 0 ? ((threeWktWins / threeWickets) * 100).toFixed(0) : 0;
    const fiveWktWinPct = fiveWickets > 0 ? ((fiveWktWins / fiveWickets) * 100).toFixed(0) : 0;

    return {
        threeWickets, threeWktWins, threeWktWinPercentage: Number(threeWktWinPct),
        fiveWickets, fiveWktWins, fiveWktWinPercentage: Number(fiveWktWinPct)
    };
};
