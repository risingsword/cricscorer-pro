import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { openDB } from 'idb';
import { ChevronLeft, Share2, ChevronDown, ChevronUp } from 'lucide-react';
import WagonWheelVisuals from '../components/WagonWheelVisuals';
import { useMatch } from '../context/MatchContext';
import { calculateNotOutWinStats, calculateRunMilestoneWinStats, calculateBowlingWinStats } from '../utils/playerStats';

const PlayerProfile = () => {
    const { name } = useParams();
    const navigate = useNavigate();
    const { dispatch } = useMatch();
    const allMatchesRef = useRef([]);
    const [activeTab, setActiveTab] = useState('BATTING');
    const [showWinImpact, setShowWinImpact] = useState(false);
    const [wagonInning, setWagonInning] = useState('Both'); // 1st, 2nd, Both
    const [wagonSide, setWagonSide] = useState('All'); // All, Off, Leg
    const [visibleRuns, setVisibleRuns] = useState({ 0: true, 1: true, 2: true, 3: true, 4: true, 6: true });
    const [stats, setStats] = useState(null);
    const [showAllBat, setShowAllBat] = useState(false);
    const [showAllBowl, setShowAllBowl] = useState(false);
    const [showAllField, setShowAllField] = useState(false);
    const [showBndryStats, setShowBndryStats] = useState(false);

    useLayoutEffect(() => {
        window.scrollTo(0, 0);
    }, [name]);

    useEffect(() => {
        loadPlayerStats();
    }, [name]);

    const loadPlayerStats = async () => {
        const { fetchAllMatches, getMatchTimestamp } = await import('../utils/dataFetcher');
        
        const processData = (regularMatches) => {
            const storedTournaments = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
            let tournamentMatches = [];
            storedTournaments.forEach(t => {
                t.matches.forEach(m => {
                    if ((m.status === 'completed' || m.status === 'live') && m.matchState) {
                        tournamentMatches.push({ ...m.matchState, isTournamentMatch: true });
                    }
                });
            });

            const combined = [...regularMatches, ...tournamentMatches];
            const deletedList = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
            const matches = combined.filter(m => (m.matchStatus === 'complete' || m.matchStatus === 'live' || m.matchStatus === 'innings_break') && !deletedList.includes(m.matchId));
            
            const decodedName = decodeURIComponent(name).toLowerCase();
            allMatchesRef.current = matches;

        let matchCount = 0;

        const bat = {
            inns: 0, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, notOuts: 0, ducks: 0,
            highScoreNum: 0, highScore: '-', scores30: 0, scores50: 0, scores100: 0,
            bestPerf: { v: '-', p: '-', text: '-' },
            bestSr: { sr: 0, text: '-' },
            most4s: { c: 0, text: '-' },
            most6s: { c: 0, text: '-' },
            records: [], // recent form
            outBy: {},
            rivalry: {}
        };

        const field = {
            catches: 0,
            stumpings: 0,
            runOuts: 0,
            droppedCatches: 0,
            totalField: 0,
            records: []
        };

        const bowl = {
            inns: 0, runs: 0, balls: 0, wickets: 0, dots: 0, foursGiven: 0, sixesGiven: 0,
            bestWkts: -1, bestRuns: 999, bestText: '-',
            bestEcon: { e: 999, text: '-' },
            mostWktsMatch: { w: 0, text: '-' },
            records: [], // recent form
            dominantOn: {},
            rivalry: {}
        };

        const wagon = {
            'Third Man': 0, 'Fine Leg': 0, 'Square Leg': 0, 'Mid Wicket': 0,
            'Long On': 0, 'Long Off': 0, 'Cover': 0, 'Point': 0
        };

        const wagonInnings = {
            1: { ...wagon },
            2: { ...wagon }
        };

        const runFreq = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 6: 0 };
        const runFreq1 = { ...runFreq }, runFreq2 = { ...runFreq };
        const shots1 = [];
        const shots2 = [];
        let momCount = 0;
        let momStats = { runs: 0, wickets: 0, catches: 0 };

        // Temporary Sets to track unique innings per rival opponent
        // Key format: 'matchId__innings_index__OpponentName'
        const batRivalryInns = {}; // bowlerName -> Set of 'matchId_innNum'
        const bowlRivalryInns = {}; // batsmanName -> Set of 'matchId_innNum'

        matches.sort((a, b) => getMatchTimestamp(b) - getMatchTimestamp(a));

        matches.forEach(match => {
            let played = false;
            let batRow = null;
            let batInnNum = 0;
            let bowlRow = null;
            let bowlInnNum = 0;
            let vsMatch = '';

            (match.innings || []).forEach((inn, i) => {
                const innNum = i + 1;
                const opp = inn.bowlingTeam; // The team they played against

                // Batting - Aggrerage multiple entries if they exist (e.g. from renames or casing variations)
                const matchingBatsmen = (inn.batsmen || []).filter(bt => bt.name?.trim().toLowerCase() === decodedName);
                if (matchingBatsmen.length > 0) {
                    played = true;
                    // Aggregate stats for this player in this innings
                    const aggregatedBat = matchingBatsmen.reduce((acc, current) => {
                        return {
                            ...current,
                            runs: (acc.runs || 0) + (current.runs || 0),
                            balls: (acc.balls || 0) + (current.balls || 0),
                            fours: (acc.fours || 0) + (current.fours || 0),
                            sixes: (acc.sixes || 0) + (current.sixes || 0),
                            isOut: acc.isOut || current.isOut // If out in any entry, count as out
                        };
                    }, { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false });

                    batRow = aggregatedBat;
                    batInnNum = innNum;
                    vsMatch = opp;

                    bat.inns += 1;
                    bat.runs += (aggregatedBat.runs || 0);
                    bat.balls += (aggregatedBat.balls || 0);
                    bat.fours += (aggregatedBat.fours || 0);
                    bat.sixes += (aggregatedBat.sixes || 0);
                    if (!aggregatedBat.isOut) bat.notOuts += 1;

                    if (aggregatedBat.runs >= 100) bat.scores100 += 1;
                    else if (aggregatedBat.runs >= 50) bat.scores50 += 1;
                    else if (aggregatedBat.runs >= 30) bat.scores30 += 1;
                    else if (aggregatedBat.runs === 0 && aggregatedBat.isOut) bat.ducks += 1;

                    if (aggregatedBat.runs > bat.highScoreNum || (aggregatedBat.runs === bat.highScoreNum && !aggregatedBat.isOut)) {
                        bat.highScoreNum = aggregatedBat.runs || 0;
                        bat.highScore = `${aggregatedBat.runs}${aggregatedBat.isOut ? '' : '*'}`;
                        bat.bestPerf.v = aggregatedBat.runs;
                        bat.bestPerf.text = `${bat.highScore}(${aggregatedBat.balls}) vs ${opp}`;
                    }
                    if (aggregatedBat.balls >= 10) {
                        const sr = (aggregatedBat.runs / aggregatedBat.balls) * 100;
                        if (sr > bat.bestSr.sr) {
                            bat.bestSr.sr = sr;
                            bat.bestSr.text = `${sr.toFixed(2)}`;
                        }
                    }
                    if (aggregatedBat.fours > bat.most4s.c) bat.most4s = { c: aggregatedBat.fours, text: `${aggregatedBat.fours} vs ${opp}` };
                    if (aggregatedBat.sixes > bat.most6s.c) bat.most6s = { c: aggregatedBat.sixes, text: `${aggregatedBat.sixes} vs ${opp}` };

                    const hsr = aggregatedBat.balls > 0 ? (aggregatedBat.runs / aggregatedBat.balls * 100).toFixed(0) : '0';
                    bat.records.push({ id: match.matchId, vs: opp, score: `${aggregatedBat.runs}${aggregatedBat.isOut ? '' : '*'}`, balls: aggregatedBat.balls, sr: hsr, r: aggregatedBat.runs, isMom: match.manOfMatch?.name?.trim().toLowerCase() === decodedName });
                }

                // Bowling - Aggrerage multiple entries if they exist
                const matchingBowlers = (inn.bowlers || []).filter(bw => bw.name?.trim().toLowerCase() === decodedName);
                if (matchingBowlers.length > 0) {
                    played = true;
                    // Aggregate stats for this player in this innings
                    const aggregatedBowl = matchingBowlers.reduce((acc, current) => {
                        const currentBalls = Math.floor(current.overs || 0) * 6 + ((current.overs || 0) % 1 * 10);
                        return {
                            ...current,
                            wickets: (acc.wickets || 0) + (current.wickets || 0),
                            runs: (acc.runs || 0) + (current.runs || 0),
                            balls: (acc.balls || 0) + currentBalls
                        };
                    }, { wickets: 0, runs: 0, balls: 0 });

                    // Recalculate overs from aggregated balls
                    const totalBalls = aggregatedBowl.balls;
                    const totalOversFormatted = Math.floor(totalBalls / 6) + (totalBalls % 6) / 10;

                    bowlRow = aggregatedBowl;
                    bowlInnNum = innNum;
                    vsMatch = inn.battingTeam;

                    bowl.inns += 1;
                    bowl.wickets += aggregatedBowl.wickets;
                    bowl.runs += aggregatedBowl.runs;
                    bowl.balls += totalBalls;

                    if (aggregatedBowl.wickets > bowl.bestWkts || (aggregatedBowl.wickets === bowl.bestWkts && aggregatedBowl.runs < bowl.bestRuns)) {
                        bowl.bestWkts = aggregatedBowl.wickets;
                        bowl.bestRuns = aggregatedBowl.runs;
                        bowl.bestText = `${aggregatedBowl.wickets}/${aggregatedBowl.runs} vs ${vsMatch}`;
                    }
                    if (totalBalls >= 12) {
                        const econ = aggregatedBowl.runs / (totalBalls / 6);
                        if (econ < bowl.bestEcon.e) {
                            bowl.bestEcon.e = econ;
                            bowl.bestEcon.text = `${econ.toFixed(2)} vs ${vsMatch}`;
                        }
                    }
                    if (aggregatedBowl.wickets > bowl.mostWktsMatch.w) {
                        bowl.mostWktsMatch.w = aggregatedBowl.wickets;
                        bowl.mostWktsMatch.text = `${aggregatedBowl.wickets} vs ${vsMatch}`;
                    }

                    const her = totalBalls > 0 ? (aggregatedBowl.runs / (totalBalls / 6)).toFixed(1) : '0.0';
                    bowl.records.push({ id: match.matchId, vs: vsMatch, w: aggregatedBowl.wickets, r: aggregatedBowl.runs, o: totalOversFormatted, er: her, isMom: match.manOfMatch?.name?.trim().toLowerCase() === decodedName });
                }

                // Timeline Processing for Dots, Zones, and Rivalries
                (inn.timeline || []).forEach(ball => {
                    const isBatsman = ball.batsmanName && ball.batsmanName.trim().toLowerCase() === decodedName;
                    const isBowler = ball.bowlerName && ball.bowlerName.trim().toLowerCase() === decodedName;

                    // Track dropped catches by this player
                    if (ball.droppedCatch && ball.droppedCatch.fielderName?.trim().toLowerCase() === decodedName) {
                        field.droppedCatches = (field.droppedCatches || 0) + 1;
                    }

                    if (isBatsman) {
                        const isLegitDelivery = !ball.isWide && !ball.isNoBall;
                        if (isLegitDelivery && ball.runs === 0 && !ball.isBye && !ball.isLegBye) {
                            bat.dots += 1;
                        }
                        if (ball.zone) {
                            wagonInnings[innNum][ball.zone] = (wagonInnings[innNum][ball.zone] || 0) + 1;
                            if (isLegitDelivery && ball.runs > 0) {
                                if (innNum === 1) shots1.push({ r: ball.runs, z: ball.zone });
                                else shots2.push({ r: ball.runs, z: ball.zone });
                            }
                        }
                        if (isLegitDelivery) {
                            let rc = ball.runs || 0;
                            if (rc === 4 || rc === 6 || rc <= 3) {
                                if (innNum === 1) runFreq1[rc] = (runFreq1[rc] || 0) + 1;
                                else runFreq2[rc] = (runFreq2[rc] || 0) + 1;
                            }
                        }

                        // Out By Stats
                        // IMPORTANT: WICKET-dispatched balls store wicketType directly on the ball,
                        // NOT inside a nested wicketData object. ADD_BALL wickets may have wicketData.
                        // We are already inside isBatsman (batsmanName === decodedName), so this player IS the striker.
                        if (ball.isWicket) {
                            // wicketType is set by WICKET dispatch; dismissalType may be in wicketData (ADD_BALL path)
                            const wicketType = (ball.wicketType || ball.wicketData?.dismissalType || 'other').toLowerCase();
                            const bowlerName = (ball.bowlerName || 'Unknown').toUpperCase();

                            if (!bat.outBy[bowlerName]) bat.outBy[bowlerName] = { Bowled: 0, Caught: 0, RunOut: 0, Stumped: 0, total: 0 };
                            bat.outBy[bowlerName].total += 1;
                            if (wicketType.includes('bowled')) bat.outBy[bowlerName].Bowled += 1;
                            else if (wicketType.includes('caught')) bat.outBy[bowlerName].Caught += 1;
                            else if (wicketType.includes('runout') || wicketType.includes('run out')) bat.outBy[bowlerName].RunOut += 1;
                            else if (wicketType.includes('stumped')) bat.outBy[bowlerName].Stumped += 1;
                            else bat.outBy[bowlerName].Bowled += 1;

                            // Rivalry - Times Out
                            if (!bat.rivalry[bowlerName]) bat.rivalry[bowlerName] = { balls: 0, runs: 0, out: 0, 4: 0, 6: 0 };
                            bat.rivalry[bowlerName].out += 1;
                        }

                        // Rivalry batting vs bowler
                        if (ball.bowlerName) {
                            const bName = ball.bowlerName.toUpperCase();
                            if (!bat.rivalry[bName]) bat.rivalry[bName] = { balls: 0, runs: 0, out: 0, 4: 0, 6: 0, inns: 0 };
                            if (!ball.isWide) bat.rivalry[bName].balls += 1;
                            bat.rivalry[bName].runs += (ball.runs || 0);
                            if (ball.runs === 4) bat.rivalry[bName][4] += 1;
                            if (ball.runs === 6) bat.rivalry[bName][6] += 1;
                            // Track unique innings
                            const batInnKey = `${match.matchId}_${innNum}_${bName}`;
                            if (!batRivalryInns[bName]) batRivalryInns[bName] = new Set();
                            batRivalryInns[bName].add(batInnKey);
                        }
                    }

                    if (isBowler) {
                        const isLegitDelivery = !ball.isWide && !ball.isNoBall;
                        if (isLegitDelivery && ball.runs === 0 && !ball.isBye && !ball.isLegBye) {
                            bowl.dots += 1;
                        }
                        if (ball.runs === 4) bowl.foursGiven += 1;
                        if (ball.runs === 6) bowl.sixesGiven += 1;

                        // Dominant On / Rivalry - outs counted when bowler gets credit for the wicket
                        // wicketType is stored directly on the ball (not in wicketData) for WICKET-dispatched balls
                        if (ball.isWicket) {
                            const wicketType = (ball.wicketType || ball.wicketData?.dismissalType || '').toLowerCase();
                            const isRunOut = wicketType.includes('runout') || wicketType.includes('run out');
                            const isRetired = wicketType.includes('retired');
                            const isStumped = wicketType.includes('stumped');
                            const isBowlerWicket = !isRunOut && !isRetired;

                            // Use ball.batsmanName since WICKET dispatch sets batsmanName = outBatsmanName
                            const outBatsman = (ball.batsmanName || ball.wicketData?.outBatsmanName || 'Unknown').toUpperCase();

                            if (isBowlerWicket) {
                                if (!bowl.dominantOn[outBatsman]) bowl.dominantOn[outBatsman] = 0;
                                bowl.dominantOn[outBatsman] += 1;
                            }

                            if (!bowl.rivalry[outBatsman]) bowl.rivalry[outBatsman] = { balls: 0, runs: 0, out: 0 };
                            bowl.rivalry[outBatsman].out += 1;
                        }

                        // Rivalry bowling vs batsman
                        if (ball.batsmanName) {
                            const batsName = ball.batsmanName.toUpperCase();
                            if (!bowl.rivalry[batsName]) bowl.rivalry[batsName] = { balls: 0, runs: 0, out: 0, inns: 0 };
                            if (!ball.isWide) bowl.rivalry[batsName].balls += 1;
                            bowl.rivalry[batsName].runs += (ball.runs || 0);
                            // Track unique innings
                            const bowlInnKey = `${match.matchId}_${innNum}_${batsName}`;
                            if (!bowlRivalryInns[batsName]) bowlRivalryInns[batsName] = new Set();
                            bowlRivalryInns[batsName].add(bowlInnKey);
                        }
                    }
                });

                // Fielding stats from Scorecard records (The most reliable source for career totals)
                (inn.batsmen || []).forEach(b => {
                    const fielder = (b.fielderName || '').trim().toLowerCase();
                    if (fielder === decodedName && b.isOut) {
                        played = true;
                        const type = (b.dismissalType || b.dismissalText || '').toLowerCase();
                        if (type.includes('caught')) {
                            field.catches++;
                            field.totalField++;
                        } else if (type.includes('stumped')) {
                            field.stumpings++;
                            field.totalField++;
                        } else if (type.includes('run out') || type.includes('runout')) {
                            field.runOuts++;
                            field.totalField++;
                        }
                    }
                });
            });
            if (played) matchCount++;
            if (match.manOfMatch?.name?.trim().toLowerCase() === decodedName) {
                momCount++;
                momStats.runs += (match.manOfMatch.batting?.runs || 0);
                momStats.wickets += (match.manOfMatch.bowling?.wickets || 0);
                momStats.catches += (match.manOfMatch.fielding?.catches || 0);
            }
        });

        // Convert innings tracking Sets to counts on rivalry objects
        Object.entries(batRivalryInns).forEach(([bowlerName, innSet]) => {
            if (bat.rivalry[bowlerName]) bat.rivalry[bowlerName].inns = innSet.size;
        });
        Object.entries(bowlRivalryInns).forEach(([batsName, innSet]) => {
            if (bowl.rivalry[batsName]) bowl.rivalry[batsName].inns = innSet.size;
        });

        // Top 3 out by
        const topOutBy = Object.entries(bat.outBy)
            .map(([n, v]) => ({ name: n, ...v }))
            .sort((a, b) => b.total - a.total).slice(0, 3);

        // Top 3 dominant
        const topDominant = Object.entries(bowl.dominantOn)
            .map(([n, w]) => ({ name: n, w }))
            .sort((a, b) => b.w - a.w).slice(0, 3);

        const notOutStats = calculateNotOutWinStats(decodedName, matches);
        const milestoneStats = calculateRunMilestoneWinStats(decodedName, matches);
        const bowlWinStats = calculateBowlingWinStats(decodedName, matches);

        setStats({
            name: decodeURIComponent(name),
            matches: matchCount,
            bat,
            bowl,
            field,
            wagonInnings,
            runFreq1,
            runFreq2,
            shots1,
            shots2,
            topOutBy,
            topDominant,
            momCount,
            momStats,
            winImpactStats: { notOutStats, milestoneStats, bowlWinStats }
        });
    };

    const initialMatches = await fetchAllMatches(false, processData);
    processData(initialMatches);
};

    if (!stats) {
        return (
            <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', paddingBottom: '30px' }}>
                <div className="header" style={{ backgroundColor: '#1a1a2e', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '54px', borderBottom: 'none' }}>
                    <ChevronLeft color="rgba(255,255,255,0.5)" style={{ cursor: 'pointer' }} />
                    <div style={{ width: '120px', height: '16px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }}></div>
                    <Share2 color="rgba(255,255,255,0.5)" size={20} />
                </div>
                <div style={{ padding: '12px' }}>
                    <div className="card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '12px 16px', marginBottom: '16px', borderRadius: '20px', gap: '16px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <div style={{ width: '52px', height: '52px', borderRadius: '16px', backgroundColor: '#e2e8f0', animation: 'pulse 1.5s infinite', flexShrink: 0 }}></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                            <div style={{ height: '20px', width: '60%', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }}></div>
                            <div style={{ height: '14px', width: '40%', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }}></div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', overflowX: 'auto', gap: '8px', marginBottom: '16px', paddingBottom: '4px' }}>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} style={{ width: '90px', height: '36px', borderRadius: '24px', backgroundColor: '#e2e8f0', animation: 'pulse 1.5s infinite', flexShrink: 0 }}></div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                        {[...Array(15)].map((_, i) => (
                            <div key={i} className="card" style={{ height: '60px', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: 'none', backgroundColor: '#f8fafc', animation: 'pulse 1.5s infinite' }}></div>
                        ))}
                    </div>

                    <div className="card" style={{ height: '180px', borderRadius: '16px', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', boxShadow: 'none', animation: 'pulse 1.5s infinite' }}></div>
                </div>
                <style>{`
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                `}</style>
            </div>
        );
    }

    const { bat, bowl, wagonInnings, runFreq1, runFreq2 } = stats;

    const getInitials = (n) => n.split(' ').map(x => x[0]).join('').substring(0, 2).toUpperCase();
    const getColor = (n) => {
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
        let hash = 0;
        for (let i = 0; i < n.length; i++) hash = n.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    const batAvg = bat.inns - bat.notOuts > 0 ? (bat.runs / (bat.inns - bat.notOuts)).toFixed(2) : (bat.runs > 0 ? bat.runs.toFixed(2) : '-');
    const batSr = bat.balls > 0 ? ((bat.runs / bat.balls) * 100).toFixed(2) : '0.00';

    const bowlAvg = bowl.wickets > 0 ? (bowl.runs / bowl.wickets).toFixed(2) : '-';
    const bowlEcon = bowl.balls > 0 ? (bowl.runs / (bowl.balls / 6)).toFixed(2) : '0.00';

    const bpb = (bat.fours + bat.sixes) > 0 ? (bat.balls / (bat.fours + bat.sixes)).toFixed(1) : '-';
    const bp4 = bat.fours > 0 ? (bat.balls / bat.fours).toFixed(1) : '-';
    const bp6 = bat.sixes > 0 ? (bat.balls / bat.sixes).toFixed(1) : '-';

    return (
        <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', paddingBottom: '30px', animation: 'fadeIn 0.5s ease-out' }}>
            <div className="header" style={{ backgroundColor: '#1a1a2e', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '54px', borderBottom: 'none' }}>
                <ChevronLeft color="white" onClick={() => navigate(-1)} style={{ cursor: 'pointer' }} />
                <div style={{ color: 'white', fontSize: '17px', fontWeight: '800' }}>Player Profile</div>
                <Share2 color="white" size={20} style={{ cursor: 'pointer' }} onClick={() => alert('Sharing coming soon!')} />
            </div>

            <div style={{ padding: '12px' }}>
                <div className="card" style={{ 
                    display: 'flex', flexDirection: 'column', 
                    padding: '12px 16px', marginBottom: '8px', borderRadius: '20px', 
                    gap: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                    animation: 'slideUp 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                            width: '42px', height: '42px', borderRadius: '12px', 
                            backgroundColor: getColor(stats.name), color: 'white', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            fontWeight: '900', fontSize: '18px', flexShrink: 0, 
                            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                            animation: 'popIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
                        }}>
                            {getInitials(stats.name)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ fontWeight: '900', fontSize: '18px', color: '#0f172a', letterSpacing: '-0.5px', lineHeight: '1' }}>{stats.name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#22c55e' }}></div>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>{stats.matches} Matches Played</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card" style={{ padding: '0', marginBottom: '16px', borderRadius: '20px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', animation: 'slideUp 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)', overflow: 'hidden' }}>
                    <div 
                        onClick={() => setShowWinImpact(!showWinImpact)}
                        style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', backgroundColor: showWinImpact ? '#f8fafc' : 'white' }}
                    >
                        <h3 style={{ fontSize: '15px', fontWeight: '900', color: '#1e1b4b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '16px' }}>🎯</span> Win Impact Stats
                        </h3>
                        {showWinImpact ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
                    </div>
                    
                    {showWinImpact && (
                        <div style={{ padding: '0 16px 16px 16px', backgroundColor: '#f8fafc' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Not Out Row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '12px', borderRadius: '12px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>Not Outs</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: '#1a1a2e' }}>{stats.winImpactStats.notOutStats.totalNotOuts} times</span>
                                            <span style={{ color: '#e94560' }}>({stats.winImpactStats.notOutStats.notOutWins} {stats.winImpactStats.notOutStats.notOutWins === 1 ? 'win' : 'wins'})</span>
                                        </div>
                                        <div style={{
                                            padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '900',
                                            backgroundColor: stats.winImpactStats.notOutStats.winPercentage >= 50 ? '#dcfce7' : '#fee2e2',
                                            color: stats.winImpactStats.notOutStats.winPercentage >= 50 ? '#16a34a' : '#ef4444'
                                        }}>
                                            {stats.winImpactStats.notOutStats.winPercentage}% Win
                                        </div>
                                    </div>
                                </div>
                                
                                {/* 30+ Runs Row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '12px', borderRadius: '12px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>30+ Runs</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: '#1a1a2e' }}>{stats.winImpactStats.milestoneStats.thirties} times</span>
                                            <span style={{ color: '#e94560' }}>({stats.winImpactStats.milestoneStats.thirtyWins} {stats.winImpactStats.milestoneStats.thirtyWins === 1 ? 'win' : 'wins'})</span>
                                        </div>
                                        <div style={{
                                            padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '900',
                                            backgroundColor: stats.winImpactStats.milestoneStats.thirtyWinPercentage >= 50 ? '#dcfce7' : '#fee2e2',
                                            color: stats.winImpactStats.milestoneStats.thirtyWinPercentage >= 50 ? '#16a34a' : '#ef4444'
                                        }}>
                                            {stats.winImpactStats.milestoneStats.thirtyWinPercentage}% Win
                                        </div>
                                    </div>
                                </div>

                                {/* 50+ Runs Row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '12px', borderRadius: '12px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>50+ Runs</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: '#1a1a2e' }}>{stats.winImpactStats.milestoneStats.fifties} times</span>
                                            <span style={{ color: '#e94560' }}>({stats.winImpactStats.milestoneStats.fiftyWins} {stats.winImpactStats.milestoneStats.fiftyWins === 1 ? 'win' : 'wins'})</span>
                                        </div>
                                        <div style={{
                                            padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '900',
                                            backgroundColor: stats.winImpactStats.milestoneStats.fiftyWinPercentage >= 50 ? '#dcfce7' : '#fee2e2',
                                            color: stats.winImpactStats.milestoneStats.fiftyWinPercentage >= 50 ? '#16a34a' : '#ef4444'
                                        }}>
                                            {stats.winImpactStats.milestoneStats.fiftyWinPercentage}% Win
                                        </div>
                                    </div>
                                </div>

                                {/* 100+ Runs Row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '12px', borderRadius: '12px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>100+ Runs</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: '#1a1a2e' }}>{stats.winImpactStats.milestoneStats.hundreds} times</span>
                                            <span style={{ color: '#e94560' }}>({stats.winImpactStats.milestoneStats.hundredWins} {stats.winImpactStats.milestoneStats.hundredWins === 1 ? 'win' : 'wins'})</span>
                                        </div>
                                        <div style={{
                                            padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '900',
                                            backgroundColor: stats.winImpactStats.milestoneStats.hundredWinPercentage >= 50 ? '#dcfce7' : '#fee2e2',
                                            color: stats.winImpactStats.milestoneStats.hundredWinPercentage >= 50 ? '#16a34a' : '#ef4444'
                                        }}>
                                            {stats.winImpactStats.milestoneStats.hundredWinPercentage}% Win
                                        </div>
                                    </div>
                                </div>

                                {/* 3+ Wickets Row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '12px', borderRadius: '12px', marginTop: '8px', borderTop: '1px dashed #e2e8f0' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>3+ Wickets</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: '#1a1a2e' }}>{stats.winImpactStats.bowlWinStats.threeWickets} times</span>
                                            <span style={{ color: '#e94560' }}>({stats.winImpactStats.bowlWinStats.threeWktWins} {stats.winImpactStats.bowlWinStats.threeWktWins === 1 ? 'win' : 'wins'})</span>
                                        </div>
                                        <div style={{
                                            padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '900',
                                            backgroundColor: stats.winImpactStats.bowlWinStats.threeWktWinPercentage >= 50 ? '#dcfce7' : '#fee2e2',
                                            color: stats.winImpactStats.bowlWinStats.threeWktWinPercentage >= 50 ? '#16a34a' : '#ef4444'
                                        }}>
                                            {stats.winImpactStats.bowlWinStats.threeWktWinPercentage}% Win
                                        </div>
                                    </div>
                                </div>

                                {/* 5+ Wickets Row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '12px', borderRadius: '12px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>5+ Wickets</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: '#1a1a2e' }}>{stats.winImpactStats.bowlWinStats.fiveWickets} times</span>
                                            <span style={{ color: '#e94560' }}>({stats.winImpactStats.bowlWinStats.fiveWktWins} {stats.winImpactStats.bowlWinStats.fiveWktWins === 1 ? 'win' : 'wins'})</span>
                                        </div>
                                        <div style={{
                                            padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '900',
                                            backgroundColor: stats.winImpactStats.bowlWinStats.fiveWktWinPercentage >= 50 ? '#dcfce7' : '#fee2e2',
                                            color: stats.winImpactStats.bowlWinStats.fiveWktWinPercentage >= 50 ? '#16a34a' : '#ef4444'
                                        }}>
                                            {stats.winImpactStats.bowlWinStats.fiveWktWinPercentage}% Win
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', overflowX: 'auto', gap: '8px', marginBottom: '12px', scrollbarWidth: 'none', paddingBottom: '4px' }}>
                    {['BATTING', 'BOWLING', 'WAGON WHEEL', 'RIVALRY'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                whiteSpace: 'nowrap',
                                padding: '4px 20px',
                                borderRadius: '16px',
                                fontSize: '13px',
                                fontWeight: '700',
                                border: 'none',
                                backgroundColor: activeTab === tab ? '#1a1a2e' : 'white',
                                color: activeTab === tab ? 'white' : '#4b5563',
                                boxShadow: activeTab === tab ? '0 4px 6px -1px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.1)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                height: '36px'
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {activeTab === 'BATTING' && (
                    <div className="animate-fade-in">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginBottom: '16px' }}>
                            {[
                                { l: 'Matches', v: stats.matches }, { l: 'Innings', v: bat.inns }, { l: 'Runs', v: bat.runs },
                                { l: 'Balls', v: bat.balls }, { l: 'Average', v: batAvg }, { l: 'S/R', v: batSr },
                                { l: 'HS', v: bat.highScore }, { l: '30s', v: bat.scores30 }, { l: '50s', v: bat.scores50 },
                                { l: '100s', v: bat.scores100 }, { l: '4s', v: bat.fours }, { l: '6s', v: bat.sixes },
                                { l: 'Dots', v: bat.dots }, { l: 'Ducks', v: bat.ducks }, { l: 'Not Outs', v: bat.notOuts },
                                { l: 'BALLS PER BOUNDARY', v: bpb, expandable: true, fullWidth: true },
                                ...(showBndryStats ? [
                                    { l: 'BALLS PER 4', v: bp4, halfWidth: true },
                                    { l: 'BALLS PER 6', v: bp6, halfWidth: true }
                                ] : [])
                            ].map((s, i) => (
                                <div
                                    key={i}
                                    className="card"
                                    onClick={() => s.expandable && setShowBndryStats(!showBndryStats)}
                                    style={{
                                        padding: s.fullWidth ? '14px 16px' : (s.halfWidth ? '12px 8px' : '10px 4px'),
                                        textAlign: s.fullWidth ? 'left' : 'center',
                                        borderRadius: '12px',
                                        border: '1px solid #f1f5f9',
                                        boxShadow: 'none',
                                        marginBottom: '0',
                                        position: 'relative',
                                        cursor: s.expandable ? 'pointer' : 'default',
                                        transition: 'all 0.2s',
                                        gridColumn: s.fullWidth ? 'span 6' : (s.halfWidth ? 'span 3' : 'span 2'),
                                        backgroundColor: (s.halfWidth) ? '#f8fafc' : 'white',
                                        display: 'flex',
                                        flexDirection: s.fullWidth ? 'row' : 'column',
                                        alignItems: 'center',
                                        justifyContent: s.fullWidth ? 'space-between' : 'center',
                                        gap: s.fullWidth ? '12px' : '4px',
                                        animation: `slideUp 0.6s cubic-bezier(0.2, 1, 0.3, 1) ${0.1 + (i * 0.04)}s both`
                                    }}
                                >
                                    <div style={{
                                        fontSize: '9px',
                                        color: '#94a3b8',
                                        fontWeight: '800',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: s.fullWidth ? 'flex-start' : 'center',
                                        gap: '4px'
                                    }}>
                                        {s.l}
                                        {s.expandable && (showBndryStats ? <ChevronUp size={12} strokeWidth={3} /> : <ChevronDown size={12} strokeWidth={3} />)}
                                    </div>
                                    <div style={{
                                        fontSize: s.fullWidth ? '18px' : '15px',
                                        fontWeight: '900',
                                        color: '#1e293b'
                                    }}>{s.v}</div>
                                </div>
                            ))}
                        </div>

                        <div className="card" style={{ marginBottom: '20px', borderRadius: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>🏆</span> Best Performances
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
                                    <span style={{ color: '#6b7280' }}>Highest</span>
                                    <span style={{ fontWeight: '600' }}>{bat.bestPerf.text}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
                                    <span style={{ color: '#6b7280' }}>Best SR (min 10b)</span>
                                    <span style={{ fontWeight: '600' }}>{bat.bestSr.text}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
                                    <span style={{ color: '#6b7280' }}>Most 4s</span>
                                    <span style={{ fontWeight: '600' }}>{bat.most4s.text}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#6b7280' }}>Most 6s</span>
                                    <span style={{ fontWeight: '600' }}>{bat.most6s.text}</span>
                                </div>
                            </div>
                        </div>

                        {stats.momCount > 0 && (
                            <div className="card animate-fade-in" style={{ padding: '0', overflow: 'hidden', marginTop: '24px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', border: 'none', boxShadow: '0 10px 25px rgba(245, 158, 11, 0.25)', borderRadius: '24px' }}>
                                <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '24px', flexShrink: 0, backdropFilter: 'blur(10px)' }}>
                                        ⭐
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1.5px', opacity: 0.9, marginBottom: '2px' }}>Man of the Match Awards</div>
                                        <div style={{ fontSize: '22px', fontWeight: '900', lineHeight: 1.2 }}>{stats.momCount} <span style={{ fontSize: '14px', fontWeight: '700', opacity: 0.8 }}>Times 🏆</span></div>
                                        <div style={{ fontSize: '13px', fontWeight: '600', opacity: 0.9, marginTop: '6px' }}>
                                            Career MoM Stats: {stats.momStats.runs} runs • {stats.momStats.wickets} wkts • {stats.momStats.catches} catches
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {stats.topOutBy.length > 0 && (
                            <div className="card" style={{ marginBottom: '20px', borderRadius: '16px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    Most Out By
                                </h3>
                                <div>
                                    {stats.topOutBy.map((ob, i) => (
                                        <div key={i} style={{ marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                                                <span>{ob.name}</span>
                                                <span style={{ color: '#ef4444' }}>{ob.total} times</span>
                                            </div>
                                            <div style={{ height: '8px', backgroundColor: '#fee2e2', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
                                                <div style={{ height: '100%', backgroundColor: '#ef4444', width: `${(ob.total / stats.topOutBy[0].total) * 100}%` }}></div>
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                                {ob.Bowled > 0 && `Bowled:${ob.Bowled} `}
                                                {ob.Caught > 0 && `Caught:${ob.Caught} `}
                                                {ob.RunOut > 0 && `RunOut:${ob.RunOut} `}
                                                {ob.Stumped > 0 && `Stumped:${ob.Stumped}`}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="card" style={{ borderRadius: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>📈</span> {showAllBat ? 'Career Database' : 'Recent Form (Last 5)'}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(showAllBat ? bat.records : bat.records.slice(0, 5)).map((r, i) => {
                                    let c = '#ef4444';
                                    if (r.r >= 50) c = '#22c55e';
                                    else if (r.r >= 30) c = '#eab308';
                                    else if (r.r >= 10) c = '#f97316';
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                if (r.id) {
                                                    const match = allMatchesRef.current.find(m => m.matchId === r.id);
                                                    if (match) {
                                                        dispatch({ type: 'INIT_MATCH', payload: match });
                                                        navigate('/scorecard');
                                                    }
                                                }
                                            }}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                backgroundColor: '#f9fafb',
                                                padding: '12px',
                                                borderRadius: '8px',
                                                borderLeft: `4px solid ${c}`,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ fontSize: '13px', color: '#4b5563', fontWeight: '500' }}>vs {r.vs}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: c, display: 'flex', alignItems: 'center' }}>
                                                    {r.score} <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal', margin: '0 4px' }}>({r.balls})</span>
                                                    {r.isMom && <span style={{ fontSize: '10px', padding: '2px 6px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', borderRadius: '4px', fontWeight: '900', letterSpacing: '0.5px', textShadow: '0 1px 2px rgba(0,0,0,0.2)', boxShadow: '0 0 10px rgba(245, 158, 11, 0.6)' }}>MOM</span>}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#6b7280', width: '45px', textAlign: 'right' }}>SR: {r.sr}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {bat.records.length > 5 && (
                                    <button
                                        onClick={() => setShowAllBat(!showAllBat)}
                                        className="secondary"
                                        style={{ height: '36px', fontSize: '13px', marginTop: '4px' }}
                                    >
                                        {showAllBat ? 'Show Less' : 'View Career Database'}
                                    </button>
                                )}
                                {bat.records.length === 0 && <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>No recent batting stats available.</div>}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'BOWLING' && (
                    <div className="animate-fade-in">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                            {[
                                { l: 'Innings', v: bowl.inns }, { l: 'Overs', v: (bowl.balls / 6).toFixed(1) }, { l: 'Wickets', v: bowl.wickets },
                                { l: 'Best', v: bowl.bestWkts >= 0 ? `${bowl.bestWkts}/${bowl.bestRuns}` : '-' }, { l: 'Average', v: bowlAvg }, { l: 'Economy', v: bowlEcon },
                                { l: 'Dots', v: bowl.dots }, { l: '4s Given', v: bowl.foursGiven }, { l: '6s Given', v: bowl.sixesGiven },
                                { l: 'Catches', v: stats.field.catches }, { l: 'Stumped', v: stats.field.stumpings }, { l: 'Run-Outs', v: stats.field.runOuts },
                                { l: 'Drops', v: stats.field.droppedCatches || 0 }
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ padding: '10px 4px', textAlign: 'center', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: 'none', marginBottom: '0' }}>
                                    <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
                                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#1e293b', marginTop: '4px' }}>{s.v}</div>
                                </div>
                            ))}
                        </div>

                        <div className="card" style={{ marginBottom: '20px', borderRadius: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>🎯</span> Best Performances
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
                                    <span style={{ color: '#6b7280' }}>Best Bowling</span>
                                    <span style={{ fontWeight: '600' }}>{bowl.bestText !== '-' ? bowl.bestText : '-'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
                                    <span style={{ color: '#6b7280' }}>Best Economy (min 2 ov)</span>
                                    <span style={{ fontWeight: '600' }}>{bowl.bestEcon.text}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#6b7280' }}>Most Wkts in Match</span>
                                    <span style={{ fontWeight: '600' }}>{bowl.mostWktsMatch.text}</span>
                                </div>
                            </div>
                        </div>

                        {stats.topDominant.length > 0 && (
                            <div className="card" style={{ marginBottom: '20px', borderRadius: '16px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '18px' }}>💪</span> Most Wickets Against
                                </h3>
                                <div>
                                    {stats.topDominant.map((ob, i) => (
                                        <div key={i} style={{ marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                                                <span>{ob.name}</span>
                                                <span style={{ color: '#2563eb' }}>{ob.w} wickets</span>
                                            </div>
                                            <div style={{ height: '8px', backgroundColor: '#dbeafe', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', backgroundColor: '#2563eb', width: `${(ob.w / stats.topDominant[0].w) * 100}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="card" style={{ borderRadius: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>📈</span> {showAllBowl ? 'Career Database' : 'Recent Form (Last 5 Spells)'}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(showAllBowl ? bowl.records : bowl.records.slice(0, 5)).map((r, i) => {
                                    let c = '#ef4444';
                                    if (r.w >= 3) c = '#22c55e';
                                    else if (r.w >= 1 || parseFloat(r.er) < 6.0) c = '#eab308';
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                if (r.id) {
                                                    const match = allMatchesRef.current.find(m => m.matchId === r.id);
                                                    if (match) {
                                                        dispatch({ type: 'INIT_MATCH', payload: match });
                                                        navigate('/scorecard');
                                                    }
                                                }
                                            }}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                backgroundColor: '#f9fafb',
                                                padding: '12px',
                                                borderRadius: '8px',
                                                borderLeft: `4px solid ${c}`,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ fontSize: '13px', color: '#4b5563', fontWeight: '500' }}>vs {r.vs}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: c, display: 'flex', alignItems: 'center' }}>
                                                    {r.w}/{r.r} <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal', margin: '0 4px' }}>({r.o}o)</span>
                                                    {r.isMom && <span style={{ fontSize: '10px', padding: '2px 6px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', borderRadius: '4px', fontWeight: '900', letterSpacing: '0.5px', textShadow: '0 1px 2px rgba(0,0,0,0.2)', boxShadow: '0 0 10px rgba(245, 158, 11, 0.6)' }}>MOM</span>}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#6b7280', width: '45px', textAlign: 'right' }}>ER: {r.er}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {bowl.records.length > 5 && (
                                    <button
                                        onClick={() => setShowAllBowl(!showAllBowl)}
                                        className="secondary"
                                        style={{ height: '36px', fontSize: '13px', marginTop: '4px' }}
                                    >
                                        {showAllBowl ? 'Show Less' : 'View Career Database'}
                                    </button>
                                )}
                                {bowl.records.length === 0 && <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>No recent bowling stats available.</div>}
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'WAGON WHEEL' && (
                    <div className="animate-fade-in">
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                            {['1st Inn', '2nd Inn', 'Both'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => setWagonInning(t)}
                                    style={{
                                        padding: '8px 20px', borderRadius: '20px', fontSize: '13px', fontWeight: '800',
                                        backgroundColor: wagonInning === t ? '#1e1b4b' : 'white', color: wagonInning === t ? 'white' : '#64748b',
                                        border: '1px solid #e2e8f0', height: '40px'
                                    }}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        {(() => {
                            let cShots = [];
                            if (wagonInning === 'Both' || wagonInning === '1st Inn') cShots = cShots.concat(stats.shots1 || []);
                            if (wagonInning === 'Both' || wagonInning === '2nd Inn') cShots = cShots.concat(stats.shots2 || []);

                            if (cShots.length === 0) return <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>No wagon wheel data recorded.</div>;

                            const offSideZones = ['Third Man', 'Point', 'Cover', 'Long Off'];
                            const legSideZones = ['Fine Leg', 'Square Leg', 'Mid Wicket', 'Long On'];

                            let offRuns = 0;
                            let legRuns = 0;
                            cShots.forEach(s => {
                                if (offSideZones.includes(s.z)) offRuns += s.r;
                                else if (legSideZones.includes(s.z)) legRuns += s.r;
                            });

                            const totalRuns = offRuns + legRuns;
                            const offPct = totalRuns > 0 ? Math.round((offRuns / totalRuns) * 100) : 0;
                            const legPct = totalRuns > 0 ? Math.round((legRuns / totalRuns) * 100) : 0;

                            const runColors = { 1: '#ffffff', 2: '#3b82f6', 3: '#db2777', 4: '#eab308', 6: '#ef4444' };
                            const zoneAngles = {
                                'Third Man': 67.5, 'Point': 22.5, 'Cover': 337.5, 'Long Off': 292.5,
                                'Long On': 247.5, 'Mid Wicket': 202.5, 'Square Leg': 157.5, 'Fine Leg': 112.5
                            };

                            return (
                                <div className="card" style={{ backgroundColor: '#111827', color: 'white', padding: '24px', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                                    <WagonWheelVisuals shots={cShots.filter(s => visibleRuns[s.r])} showStats={true} />

                                    {/* Run Legend */}
                                    <div style={{
                                        display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', justifyContent: 'center'
                                    }}>
                                        {[1, 2, 3, 4, 6].map(r => {
                                            const active = visibleRuns[r];
                                            return (
                                                <div
                                                    key={r}
                                                    onClick={() => setVisibleRuns(prev => ({ ...prev, [r]: !prev[r] }))}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '12px', cursor: 'pointer',
                                                        backgroundColor: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                                                        border: `1px solid ${active ? runColors[r] : 'rgba(255,255,255,0.05)'}`,
                                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        transform: active ? 'scale(1.05)' : 'scale(1)'
                                                    }}
                                                >
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: runColors[r], boxShadow: active ? `0 0 10px ${runColors[r]}` : 'none' }} />
                                                    <span style={{ fontSize: '12px', fontWeight: '800', color: active ? 'white' : '#64748b' }}>{r} {r === 1 ? 'Run' : 'Runs'}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {activeTab === 'RIVALRY' && (
                    <div className="animate-fade-in">
                        {Object.keys(bat.rivalry).length > 0 && (() => {
                            const rows = Object.entries(bat.rivalry)
                                .filter(([opp, val]) => opp.trim().toLowerCase() !== 'all' && val.balls >= 10)
                                .sort((a, b) => b[1].balls - a[1].balls);
                            if (rows.length === 0) return null;
                            const thStyle = { padding: '8px 6px', color: '#94a3b8', fontWeight: '800', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' };
                            const tdStyle = { padding: '10px 6px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#374151', borderBottom: '1px solid #f1f5f9' };
                            return (
                                <div className="card" style={{ marginBottom: '16px', borderRadius: '16px', padding: '16px 12px', overflow: 'hidden' }}>
                                    <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b' }}>
                                        <span>⚔️</span> vs Bowlers (Batting)
                                    </h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '8px', minWidth: '90px' }}>BOWLER</th>
                                                    <th style={thStyle}>INN</th>
                                                    <th style={thStyle}>BALLS</th>
                                                    <th style={thStyle}>RUNS</th>
                                                    <th style={thStyle}>SR</th>
                                                    <th style={thStyle}>4s</th>
                                                    <th style={thStyle}>6s</th>
                                                    <th style={thStyle}>OUT</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map(([opp, val]) => {
                                                    const sr = val.balls > 0 ? ((val.runs / val.balls) * 100).toFixed(0) : 0;
                                                    return (
                                                        <tr key={opp}>
                                                            <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '8px', fontWeight: '700', color: '#1e293b', fontSize: '12px' }}>{opp}</td>
                                                            <td style={{ ...tdStyle, color: '#6366f1' }}>{val.inns || 0}</td>
                                                            <td style={tdStyle}>{val.balls}</td>
                                                            <td style={{ ...tdStyle, fontWeight: '700', color: '#111827' }}>{val.runs}</td>
                                                            <td style={{ ...tdStyle, color: sr >= 150 ? '#16a34a' : sr < 100 ? '#dc2626' : '#374151' }}>{sr}</td>
                                                            <td style={tdStyle}>{val[4] || 0}</td>
                                                            <td style={tdStyle}>{val[6] || 0}</td>
                                                            <td style={{ ...tdStyle, fontWeight: '700', color: val.out >= 3 ? '#dc2626' : val.out > 0 ? '#ef4444' : '#9ca3af' }}>{val.out}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}

                        {Object.keys(bowl.rivalry).length > 0 && (() => {
                            const rows = Object.entries(bowl.rivalry)
                                .filter(([opp, val]) => val.balls >= 10)
                                .sort((a, b) => b[1].balls - a[1].balls);
                            if (rows.length === 0) return null;
                            const thStyle = { padding: '8px 6px', color: '#94a3b8', fontWeight: '800', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' };
                            const tdStyle = { padding: '10px 6px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#374151', borderBottom: '1px solid #f1f5f9' };
                            return (
                                <div className="card" style={{ marginBottom: '16px', borderRadius: '16px', padding: '16px 12px', overflow: 'hidden' }}>
                                    <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b' }}>
                                        <span>⚔️</span> vs Batsmen (Bowling)
                                    </h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '8px', minWidth: '90px' }}>BATSMAN</th>
                                                    <th style={thStyle}>INN</th>
                                                    <th style={thStyle}>BALLS</th>
                                                    <th style={thStyle}>RUNS</th>
                                                    <th style={thStyle}>ECON</th>
                                                    <th style={thStyle}>OUT</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map(([opp, val]) => {
                                                    const econ = val.balls > 0 ? (val.runs / (val.balls / 6)).toFixed(1) : 0;
                                                    return (
                                                        <tr key={opp}>
                                                            <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '8px', fontWeight: '700', color: '#1e293b', fontSize: '12px' }}>{opp}</td>
                                                            <td style={{ ...tdStyle, color: '#6366f1' }}>{val.inns || 0}</td>
                                                            <td style={tdStyle}>{val.balls}</td>
                                                            <td style={{ ...tdStyle, fontWeight: '700', color: '#111827' }}>{val.runs}</td>
                                                            <td style={{ ...tdStyle, color: parseFloat(econ) < 6 ? '#16a34a' : parseFloat(econ) >= 10 ? '#dc2626' : '#374151' }}>{econ}</td>
                                                            <td style={{ ...tdStyle, fontWeight: '700', color: val.out >= 2 ? '#16a34a' : val.out > 0 ? '#22c55e' : '#9ca3af' }}>{val.out}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}

                        {Object.keys(bat.rivalry).length === 0 && Object.keys(bowl.rivalry).length === 0 && (
                            <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>No rivalry data found for this player.</div>
                        )}
                    </div>
                )}

            </div>
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes popIn {
                    0% { opacity: 0; transform: scale(0.6); }
                    70% { transform: scale(1.1); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default PlayerProfile;
