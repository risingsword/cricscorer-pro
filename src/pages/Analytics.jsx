import React, { useEffect, useState } from 'react';

import { BarChart as BarChartIcon, BarChart2, User, Coins, Handshake, TrendingUp, Trophy } from 'lucide-react';
import { openDB } from 'idb';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import { getMatchTimestamp } from '../utils/dataFetcher';
import useScrollRestore from '../hooks/useScrollRestore';

// We need Recharts components too, but naming conflict with Lucide
import {
    BarChart as RechartsBarChart,
    Bar as RechartsBar,
    XAxis as RechartsXAxis,
    YAxis as RechartsYAxis,
    Tooltip as RechartsTooltip,
    ResponsiveContainer as RechartsResponsiveContainer,
    Cell as RechartsCell
} from 'recharts';

const Analytics = () => {
    const navigate = useNavigate();
    const { dispatch } = useMatch();
    const [activeTab, setActiveTab] = useState('player');
    const [matches, setMatches] = useState([]);
    const [allMatches, setAllMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [matchTypeFilter, setMatchTypeFilter] = useState('Regular Matches');
    const [sortConfig, setSortConfig] = useState({ key: 'runs', direction: 'desc' });
    const [hasTournaments, setHasTournaments] = useState(false);
    const [selectedStat, setSelectedStat] = useState(null);
    const [activeMilestone, setActiveMilestone] = useState(null);

    // Pre-paint scroll restoration — no flicker
    useScrollRestore('analytics', !loading);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const { fetchAllMatches, getMatchTimestamp } = await import('../utils/dataFetcher');

                const processData = (regMatches) => {
                    const storedTournaments = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
                    const deletedList = JSON.parse(localStorage.getItem('deleted_matches') || '[]');

                    setHasTournaments(storedTournaments.length > 0);
                    let tournamentMatches = [];
                    storedTournaments.forEach(t => {
                        t.matches.forEach(m => {
                            if ((m.status === 'completed' || m.status === 'live') && m.matchState) {
                                tournamentMatches.push({ ...m.matchState, isTournamentMatch: true });
                            }
                        });
                    });

                    const combined = [...regMatches, ...tournamentMatches];
                    const visible = combined.filter(m =>
                        (m.matchStatus === 'complete' || m.matchStatus === 'live' || m.matchStatus === 'innings_break') && !deletedList.includes(m.matchId)
                    );

                    setAllMatches(visible);
                    setLoading(false);
                };

                const initialMatches = await fetchAllMatches(false, processData);
                processData(initialMatches);
            } catch (err) {
                console.error("Analytics Load Error:", err);
                setLoading(false);
            }
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') loadData();
        };

        loadData();
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    // Intercept hardware back button to close stat details instead of leaving tab
    useEffect(() => {
        const handleAppBack = (e) => {
            if (selectedStat) {
                e.preventDefault(); // Stop global back handler
                setSelectedStat(null);
            }
        };
        window.addEventListener('app-back-button', handleAppBack);
        return () => window.removeEventListener('app-back-button', handleAppBack);
    }, [selectedStat]);

    useEffect(() => {
        setMatches(allMatches.filter(m => {
            if (matchTypeFilter === 'Regular Matches') return !m.isTournamentMatch;
            if (matchTypeFilter === 'Tournament Matches') return m.isTournamentMatch;
            return true;
        }));
    }, [allMatches, matchTypeFilter]);

    const playerStats = React.useMemo(() => {
        const stats = {};
        
        // Process matches in chronological order to accurately track cumulative dataset stats
        const sortedMatches = [...matches].sort((a, b) => getMatchTimestamp(a) - getMatchTimestamp(b));

        sortedMatches.forEach(m => {
            const playersInMatch = new Set();
            (m.innings || []).forEach(inn => {
                const battingTeam = inn.battingTeam;
                (inn.batsmen || []).forEach(b => {
                    if (!b.name) return;
                    const key = b.name.trim().toLowerCase();
                    if (!stats[key]) {
                        stats[key] = {
                            name: b.name.trim(), matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0,
                            wickets: 0, inns: 0, notOuts: 0, highScore: 0, hundreds: 0, fifties: 0, nineties: 0,
                            fastestFifty: Infinity, fastestHundred: Infinity,
                            fiftiesList: [], hundredsList: [],
                            cumulativeMilestonesReached: {},
                            cumulativeMilestoneData: [],
                            bowlRuns: 0, bowlBalls: 0, bestBowling: { wkts: 0, runs: 0 }, fiveWickets: 0
                        };
                    }
                    playersInMatch.add(key);

                    // Track dataset cumulative milestones
                    let tempRuns = stats[key].runs;
                    let tempBalls = stats[key].balls;
                    const milestoneChecks = [50, ...Array.from({length: 100}, (_, i) => (i + 1) * 100)];
                    const playerTimeline = (inn.timeline || []).filter(bl => bl.batsmanName === b.name);

                    if (playerTimeline.length > 0) {
                        playerTimeline.forEach((bl) => {
                            if (!bl.isWide) tempBalls += 1;
                            const batsmanRuns = (bl.isWide || bl.isBye || bl.isLegBye) ? 0 : (bl.runs || 0);
                            tempRuns += batsmanRuns;

                            milestoneChecks.forEach(ms => {
                                if (tempRuns >= ms && !stats[key].cumulativeMilestonesReached[ms]) {
                                    stats[key].cumulativeMilestonesReached[ms] = true;
                                    stats[key].cumulativeMilestoneData.push({
                                        milestone: ms,
                                        ballsFaced: tempBalls,
                                        matchesPlayed: stats[key].matches + 1,
                                        runsAtMilestone: tempRuns
                                    });
                                }
                            });
                        });
                    } else {
                        tempRuns += (b.runs || 0);
                        tempBalls += (b.balls || 0);
                        milestoneChecks.forEach(ms => {
                            if (tempRuns >= ms && !stats[key].cumulativeMilestonesReached[ms]) {
                                stats[key].cumulativeMilestonesReached[ms] = true;
                                stats[key].cumulativeMilestoneData.push({
                                    milestone: ms,
                                    ballsFaced: tempBalls,
                                    matchesPlayed: stats[key].matches + 1,
                                    runsAtMilestone: tempRuns
                                });
                            }
                        });
                    }

                    const runs = b.runs || 0;
                    stats[key].runs += runs;
                    stats[key].balls += b.balls || 0;
                    stats[key].fours += b.fours || 0;
                    stats[key].sixes += b.sixes || 0;
                    stats[key].inns += 1;
                    if (!b.isOut) stats[key].notOuts += 1;

                    if (runs > stats[key].highScore) stats[key].highScore = runs;
                    if (runs >= 100) {
                        stats[key].hundreds += 1;
                        let singleInningsCumulativeRuns = 0;
                        let singleInningsBalls = 0;
                        let milestoneBall = -1;
                        let milestoneRuns = -1;
                        (inn.timeline || []).filter(bl => bl.batsmanName === b.name).forEach((bl) => {
                            if (!bl.isWide) singleInningsBalls += 1;
                            const batsmanRuns = (bl.isWide || bl.isBye || bl.isLegBye) ? 0 : (bl.runs || 0);
                            singleInningsCumulativeRuns += batsmanRuns;
                            if (singleInningsCumulativeRuns >= 100 && milestoneBall === -1) {
                                milestoneBall = singleInningsBalls;
                                milestoneRuns = singleInningsCumulativeRuns;
                            }
                        });
                        if (milestoneBall !== -1) {
                            stats[key].hundredsList.push({ balls: milestoneBall, runs: milestoneRuns, matchId: m.matchId });
                            if (milestoneBall < stats[key].fastestHundred) {
                                stats[key].fastestHundred = milestoneBall;
                            }
                        }
                    }
                    if (runs >= 50) {
                        if (runs < 100) stats[key].fifties += 1;
                        let singleInningsCumulativeRuns = 0;
                        let singleInningsBalls = 0;
                        let milestoneBall = -1;
                        let milestoneRuns = -1;
                        (inn.timeline || []).filter(bl => bl.batsmanName === b.name).forEach((bl) => {
                            if (!bl.isWide) singleInningsBalls += 1;
                            const batsmanRuns = (bl.isWide || bl.isBye || bl.isLegBye) ? 0 : (bl.runs || 0);
                            singleInningsCumulativeRuns += batsmanRuns;
                            if (singleInningsCumulativeRuns >= 50 && milestoneBall === -1) {
                                milestoneBall = singleInningsBalls;
                                milestoneRuns = singleInningsCumulativeRuns;
                            }
                        });
                        if (milestoneBall !== -1) {
                            stats[key].fiftiesList.push({ balls: milestoneBall, runs: milestoneRuns, matchId: m.matchId });
                            if (milestoneBall < stats[key].fastestFifty) {
                                stats[key].fastestFifty = milestoneBall;
                            }
                        }
                    }
                    if (runs >= 90 && runs < 100) stats[key].nineties += 1;
                });
                
                (inn.bowlers || []).forEach(bw => {
                    if (!bw.name) return;
                    const key = bw.name.trim().toLowerCase();
                    if (!stats[key]) {
                        stats[key] = {
                            name: bw.name.trim(), matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0,
                            wickets: 0, inns: 0, notOuts: 0, highScore: 0, hundreds: 0, fifties: 0, nineties: 0,
                            fastestFifty: Infinity, fastestHundred: Infinity,
                            fiftiesList: [], hundredsList: [],
                            cumulativeMilestonesReached: {},
                            cumulativeMilestoneData: [],
                            bowlRuns: 0, bowlBalls: 0, bestBowling: { wkts: 0, runs: 0 }, fiveWickets: 0
                        };
                    }
                    playersInMatch.add(key);
                    const wkts = bw.wickets || 0;
                    const rns = bw.runs || 0;
                    stats[key].wickets += wkts;
                    stats[key].bowlRuns += rns;
                    
                    const ov = bw.overs || 0;
                    const bowlBallsFromOvers = Math.floor(ov) * 6 + Math.round((ov % 1) * 10);
                    stats[key].bowlBalls += bowlBallsFromOvers;
                    stats[key].bowlOvers = (stats[key].bowlOvers || 0) + ov;

                    if (wkts >= 5) stats[key].fiveWickets += 1;

                    if (wkts > stats[key].bestBowling.wkts) {
                        stats[key].bestBowling = { wkts, runs: rns, matchId: m.matchId };
                    } else if (wkts === stats[key].bestBowling.wkts && rns < stats[key].bestBowling.runs) {
                        stats[key].bestBowling = { wkts, runs: rns, matchId: m.matchId };
                    }
                });
            });
            playersInMatch.forEach(key => {
                if (stats[key]) stats[key].matches += 1;
            });
        });

        return Object.values(stats)
            .filter(p => p.runs > 0 || p.wickets > 0 || p.balls > 0 || p.bowlBalls > 0)
            .map(p => {
                const divisor = p.inns - (p.notOuts || 0);
                const overs = p.bowlBalls / 6;
                // Format bowlOvers for display (e.g., 15.3)
                const bowlOversDisplay = p.bowlOvers ? p.bowlOvers.toFixed(1) : '0.0';
                return {
                    ...p,
                    avg: divisor > 0 ? (p.runs / divisor).toFixed(1) : (p.runs > 0 ? p.runs.toFixed(1) : '–'),
                    sr: p.balls > 0 ? ((p.runs / p.balls) * 100).toFixed(0) : '0',
                    bowlAvg: p.wickets > 0 ? (p.bowlRuns / p.wickets).toFixed(2) : '–',
                    economy: overs > 0 ? (p.bowlRuns / overs).toFixed(2) : '–',
                    bowlSR: p.wickets > 0 ? (p.bowlBalls / p.wickets).toFixed(2) : '–',
                    bowlOversDisplay,
                    bestBowlingText: p.bestBowling.wkts > 0 ? `${p.bestBowling.wkts}/${p.bestBowling.runs}` : (p.bowlBalls > 0 ? `0/${p.bowlRuns}` : '–')
                };
            })
            .sort((a, b) => b.runs - a.runs);
    }, [matches]);

    const sortedPlayerStats = React.useMemo(() => {
        return [...playerStats].sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];
            if (sortConfig.key === 'avg' || sortConfig.key === 'sr') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }
            if (sortConfig.key === 'name') {
                return sortConfig.direction === 'asc'
                    ? String(valA).localeCompare(String(valB))
                    : String(valB).localeCompare(String(valA));
            }
            if (valA === valB) return 0;
            return sortConfig.direction === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
        });
    }, [playerStats, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const tossStats = React.useMemo(() => {
        const toss = {
            batFirst: { wins: 0, losses: 0, total: 0 },
            bowlFirst: { wins: 0, losses: 0, total: 0 }
        };

        matches.forEach(m => {
            const winner = m.winner?.trim().toLowerCase();
            const batFirstTeam = (m.batFirst || m.team1?.name)?.trim().toLowerCase();

            if (!winner || winner === 'tie' || !batFirstTeam) return;

            if (winner === batFirstTeam) {
                toss.batFirst.wins += 1;
                toss.bowlFirst.losses += 1;
            } else {
                toss.batFirst.losses += 1;
                toss.bowlFirst.wins += 1;
            }
            toss.batFirst.total += 1;
            toss.bowlFirst.total += 1;
        });

        return {
            ...toss,
            batWinRate: toss.batFirst.total > 0 ? Math.round((toss.batFirst.wins / toss.batFirst.total) * 100) : 0,
            bowlWinRate: toss.bowlFirst.total > 0 ? Math.round((toss.bowlFirst.wins / toss.bowlFirst.total) * 100) : 0
        };
    }, [matches]);

    const partnerships = React.useMemo(() => {
        const pairs = {};
        matches.forEach(m => {
            (m.innings || []).forEach(inn => {
                if (inn && inn.batsmen && inn.batsmen.length >= 2) {
                    const sorted = [...inn.batsmen].sort((a, b) => (b.runs || 0) - (a.runs || 0));
                    const n1 = sorted[0].name?.trim();
                    const n2 = sorted[1].name?.trim();
                    if (!n1 || !n2) return;

                    const names = [n1, n2].sort((a, b) => a.localeCompare(b));
                    const key = `${names[0].toLowerCase()} & ${names[1].toLowerCase()}`;
                    const displayName = `${names[0]} & ${names[1]}`;

                    if (!pairs[key]) {
                        pairs[key] = {
                            name: displayName, runs: 0, balls: 0, innings: 0,
                            players: {
                                [names[0].toLowerCase()]: { name: names[0], runs: 0, balls: 0 },
                                [names[1].toLowerCase()]: { name: names[1], runs: 0, balls: 0 }
                            }
                        };
                    }
                    const k0 = n1.toLowerCase();
                    const k1 = n2.toLowerCase();
                    if (pairs[key].players[k0]) {
                        pairs[key].players[k0].runs += (sorted[0].runs || 0);
                        pairs[key].players[k0].balls += (sorted[0].balls || 0);
                    }
                    if (pairs[key].players[k1]) {
                        pairs[key].players[k1].runs += (sorted[1].runs || 0);
                        pairs[key].players[k1].balls += (sorted[1].balls || 0);
                    }

                    pairs[key].runs += ((sorted[0].runs || 0) + (sorted[1].runs || 0));
                    pairs[key].balls += ((sorted[0].balls || 0) + (sorted[1].balls || 0));
                    pairs[key].innings += 1;
                }
            });
        });
        return Object.values(pairs).sort((a, b) => b.runs - a.runs).slice(0, 5);
    }, [matches]);

    const teamStats = React.useMemo(() => {
        const teams = {};
        matches.forEach(m => {
            [m.team1, m.team2].forEach(t => {
                if (!t?.name) return;
                const key = t.name.trim().toLowerCase();
                if (!teams[key]) teams[key] = { name: t.name.trim(), matches: 0, wins: 0, losses: 0, totalRuns: 0 };
                teams[key].matches += 1;
                const winnerKey = m.winner?.trim().toLowerCase();
                if (winnerKey === key) teams[key].wins += 1;
                else if (winnerKey && winnerKey !== 'tie') teams[key].losses += 1;
            });
            (m.innings || []).forEach((inn) => {
                const tName = inn.battingTeam?.trim();
                if (tName) {
                    const key = tName.toLowerCase();
                    if (teams[key]) {
                        teams[key].totalRuns += (inn.runs || 0);
                    }
                }
            });
        });
        return Object.values(teams).map(t => ({
            ...t,
            avg: (t.totalRuns / (t.matches || 1)).toFixed(0)
        })).sort((a, b) => b.wins - a.wins);
    }, [matches]);

    const COLORS = ['#1e1b4b', '#4338ca', '#ef4444', '#f59e0b', '#10b981'];

    const renderSortHeader = (key, label, textAlign = 'center') => {
        const isActive = sortConfig.key === key;
        return (
            <th
                onClick={() => handleSort(key)}
                style={{
                    textAlign, padding: '12px 8px', color: isActive ? '#1e1b4b' : '#64748b',
                    fontWeight: '800', cursor: 'pointer', userSelect: 'none',
                    backgroundColor: isActive ? '#f1f5f9' : 'transparent',
                    borderBottom: isActive ? '2px solid #4338ca' : '1px solid #eee'
                }}
            >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: textAlign === 'left' ? 'flex-start' : 'center' }}>
                    {label}
                    <span style={{ fontSize: '11px', color: isActive ? '#4338ca' : '#94a3b8' }}>
                        {isActive ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                </div>
            </th>
        );
    };

    return (
        <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', paddingBottom: '120px' }}>
            <div className="header" style={{ padding: '0 20px', height: '64px', border: 'none', background: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BarChart2 size={20} color="#1e1b4b" />
                    </div>
                    <span style={{ fontWeight: '900', fontSize: '18px', color: '#1e1b4b', letterSpacing: '-0.5px' }}>Performance Hub</span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '16px 20px 24px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {[
                    { id: 'player', label: 'Players', icon: <User size={14} /> },
                    { id: 'fastest', label: 'Fastest', icon: <TrendingUp size={14} /> },
                    { id: 'toss', label: 'Toss Luck', icon: <Coins size={14} /> },
                    { id: 'team', label: 'Teams', icon: <Trophy size={14} /> },
                ].map(tab => (
                    <div
                        key={tab.id}
                        className="tap-card"
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '0 20px',
                            borderRadius: '16px',
                            backgroundColor: activeTab === tab.id ? '#1e1b4b' : 'white',
                            color: activeTab === tab.id ? 'white' : '#64748b',
                            fontSize: '13px',
                            fontWeight: '800',
                            whiteSpace: 'nowrap',
                            height: '44px',
                            boxShadow: activeTab === tab.id ? '0 8px 16px rgba(30,27,75,0.2)' : '0 2px 8px rgba(0,0,0,0.02)',
                            cursor: 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                    >
                        {tab.icon} {tab.label}
                    </div>
                ))}
            </div>

            {hasTournaments && (
                <div style={{ padding: '0 20px 16px', overflowX: 'auto', display: 'flex', gap: '8px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {['Regular Matches', 'Tournament Matches', 'All Matches'].map(f => (
                        <button
                            key={f}
                            className="tap-card"
                            onClick={() => setMatchTypeFilter(f)}
                            style={{
                                whiteSpace: 'nowrap',
                                padding: '0 20px',
                                borderRadius: '16px',
                                fontSize: '13px',
                                fontWeight: '800',
                                border: 'none',
                                backgroundColor: matchTypeFilter === f ? '#1e1b4b' : 'white',
                                color: matchTypeFilter === f ? 'white' : '#64748b',
                                cursor: 'pointer',
                                height: '40px',
                                boxShadow: matchTypeFilter === f ? '0 8px 16px rgba(30,27,75,0.2)' : '0 2px 8px rgba(0,0,0,0.02)'
                            }}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            )}

            <div className="container animate-fade-in" style={{ padding: '0 12px' }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="animate-pulse" style={{ height: '400px', backgroundColor: 'white', borderRadius: '28px' }}></div>
                        <div className="animate-pulse" style={{ height: '300px', backgroundColor: 'white', borderRadius: '28px' }}></div>
                    </div>
                ) : (
                    <>
                        {activeTab === 'player' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {!selectedStat ? (
                                    <>
                                        {/* Batting Section */}
                                        <div className="card" style={{ padding: '24px 16px', borderRadius: '28px', backgroundColor: 'white', width: '100%', boxSizing: 'border-box' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                                <TrendingUp size={18} color="#1e1b4b" />
                                                <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b', textTransform: 'uppercase', letterSpacing: '1px' }}>Batting</h3>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                {[
                                                    { id: 'runs', label: 'Most Runs' },
                                                    { id: 'highScore', label: 'Highest Scores' },
                                                    { id: 'avg', label: 'Best Batting Average' },
                                                    { id: 'sr', label: 'Best Batting Strike Rate' },
                                                    { id: 'hundreds', label: 'Most Hundreds' },
                                                    { id: 'fifties', label: 'Most Fifties' },
                                                    { id: 'fastestHundred', label: 'Fastest 100s' },
                                                    { id: 'fastestFifty', label: 'Fastest 50s' },
                                                    { id: 'fours', label: 'Most Fours' },
                                                    { id: 'sixes', label: 'Most Sixes' },
                                                    { id: 'nineties', label: 'Most Nineties' },
                                                ].map((item, idx) => (
                                                    <div
                                                        key={item.id}
                                                        className="tap"
                                                        onClick={() => setSelectedStat({ ...item, type: 'bat' })}
                                                        style={{
                                                            padding: '16px 12px',
                                                            borderRadius: '12px',
                                                            borderBottom: idx === 10 ? 'none' : '1px solid #f1f5f9',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#334155' }}>{item.label}</span>
                                                        <span style={{ color: '#94a3b8' }}>➔</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Bowling Section */}
                                        <div className="card" style={{ padding: '24px 16px', borderRadius: '28px', backgroundColor: 'white', width: '100%', boxSizing: 'border-box' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                                <TrendingUp size={18} color="#1e1b4b" style={{ transform: 'rotate(90deg)' }} />
                                                <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b', textTransform: 'uppercase', letterSpacing: '1px' }}>Bowling</h3>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                {[
                                                    { id: 'wickets', label: 'Most Wickets' },
                                                    { id: 'bowlAvg', label: 'Best Bowling Average' },
                                                    { id: 'bestBowling', label: 'Best Bowling (Innings)' },
                                                    { id: 'fiveWickets', label: 'Most 5 Wickets Haul' },
                                                    { id: 'economy', label: 'Best Economy' },
                                                    { id: 'bowlSR', label: 'Best Bowling Strike Rate' },
                                                ].map((item, idx) => (
                                                    <div
                                                        key={item.id}
                                                        className="tap"
                                                        onClick={() => setSelectedStat({ ...item, type: 'bowl' })}
                                                        style={{
                                                            padding: '16px 12px',
                                                            borderRadius: '12px',
                                                            borderBottom: idx === 5 ? 'none' : '1px solid #f1f5f9',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#334155' }}>{item.label}</span>
                                                        <span style={{ color: '#94a3b8' }}>➔</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="card animate-scale-in" style={{ padding: '24px 12px', borderRadius: '28px', backgroundColor: 'white', width: '100%', boxSizing: 'border-box' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                                            <button
                                                onClick={() => setSelectedStat(null)}
                                                style={{
                                                    border: 'none', background: '#f1f5f9', width: '36px', height: '36px',
                                                    borderRadius: '10px', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', cursor: 'pointer', color: '#1e1b4b'
                                                }}
                                            >
                                                ←
                                            </button>
                                            <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b' }}>{selectedStat.label}</h3>
                                        </div>

                                        <div style={{ overflowX: 'auto' }}>
                                            {(() => {
                                                // Determine columns based on stat type
                                                const isBowl = selectedStat.type === 'bowl';
                                                const statId = selectedStat.id;

                                                // Build dynamic columns
                                                let columns = [];
                                                if (isBowl) {
                                                    columns = [
                                                        { key: 'name', label: 'Bowler', align: 'left' },
                                                        { key: 'matches', label: 'M', align: 'center' },
                                                        { key: 'bowlOversDisplay', label: 'O', align: 'center' },
                                                        { key: 'wickets', label: 'W', align: 'center' },
                                                    ];
                                                    // Add the specific stat column
                                                    if (statId === 'wickets') columns.push({ key: 'economy', label: 'ER', align: 'right', highlight: false });
                                                    else if (statId === 'bowlAvg') columns.push({ key: 'bowlAvg', label: 'Avg', align: 'right', highlight: true });
                                                    else if (statId === 'bowlSR') columns.push({ key: 'bowlSR', label: 'SR', align: 'right', highlight: true });
                                                    else if (statId === 'economy') columns.push({ key: 'economy', label: 'ER', align: 'right', highlight: true });
                                                    else if (statId === 'bestBowling') columns.push({ key: 'bestBowlingText', label: 'Best', align: 'right', highlight: true });
                                                    else if (statId === 'fiveWickets') columns.push({ key: 'fiveWickets', label: '5W', align: 'right', highlight: true });
                                                    else columns.push({ key: statId, label: statId.toUpperCase(), align: 'right', highlight: true });
                                                } else {
                                                    columns = [
                                                        { key: 'name', label: 'Batsman', align: 'left' },
                                                        { key: 'matches', label: 'M', align: 'center' },
                                                        { key: 'inns', label: 'I', align: 'center' },
                                                    ];
                                                    if (statId === 'runs') columns.push({ key: 'balls', label: 'B', align: 'center' }, { key: 'runs', label: 'R', align: 'right', highlight: true });
                                                    else if (statId === 'highScore') columns.push({ key: 'runs', label: 'R', align: 'center' }, { key: 'highScore', label: 'HS', align: 'right', highlight: true });
                                                    else if (statId === 'avg') columns.push({ key: 'runs', label: 'R', align: 'center' }, { key: 'avg', label: 'Avg', align: 'right', highlight: true });
                                                    else if (statId === 'sr') columns.push({ key: 'runs', label: 'R', align: 'center' }, { key: 'balls', label: 'B', align: 'center' }, { key: 'sr', label: 'SR', align: 'right', highlight: true });
                                                    else if (statId === 'hundreds') columns.push({ key: 'runs', label: 'R', align: 'center' }, { key: 'hundreds', label: '100s', align: 'right', highlight: true });
                                                    else if (statId === 'fifties') columns.push({ key: 'runs', label: 'R', align: 'center' }, { key: 'fifties', label: '50s', align: 'right', highlight: true });
                                                    else if (statId === 'fours') columns.push({ key: 'balls', label: 'B', align: 'center' }, { key: 'fours', label: '4s', align: 'right', highlight: true });
                                                    else if (statId === 'sixes') columns.push({ key: 'balls', label: 'B', align: 'center' }, { key: 'sixes', label: '6s', align: 'right', highlight: true });
                                                    else if (statId === 'nineties') columns.push({ key: 'runs', label: 'R', align: 'center' }, { key: 'nineties', label: '90s', align: 'right', highlight: true });
                                                    else if (statId === 'fastestFifty') columns.push({ key: 'fastestFiftyDisplay', label: 'Score (Balls)', align: 'right', highlight: true });
                                                    else if (statId === 'fastestHundred') columns.push({ key: 'fastestHundredDisplay', label: 'Score (Balls)', align: 'right', highlight: true });
                                                    else columns.push({ key: statId, label: statId.toUpperCase(), align: 'right', highlight: true });
                                                }

                                                let filtered = [];

                                                if (statId === 'fastestFifty' || statId === 'fastestHundred') {
                                                    const listName = statId === 'fastestFifty' ? 'fiftiesList' : 'hundredsList';
                                                    playerStats.forEach(p => {
                                                        (p[listName] || []).forEach(milestone => {
                                                            // Handle legacy data (number) or new data (object)
                                                            const milestoneBalls = typeof milestone === 'object' ? milestone.balls : milestone;
                                                            const milestoneRuns = typeof milestone === 'object' ? milestone.runs : (statId === 'fastestFifty' ? 50 : 100);
                                                            const milestoneMatchId = typeof milestone === 'object' ? milestone.matchId : null;

                                                            if (statId === 'fastestFifty' && milestoneBalls > 25) return;
                                                            if (statId === 'fastestHundred' && milestoneBalls > 50) return;
                                                            filtered.push({
                                                                ...p,
                                                                [statId]: milestoneBalls, // override for sorting
                                                                [`${statId}Display`]: `${milestoneRuns} (${milestoneBalls})`, // new column for display
                                                                matchId: milestoneMatchId
                                                            });
                                                        });
                                                    });
                                                    filtered.sort((a, b) => a[statId] - b[statId]);
                                                    filtered = filtered.slice(0, 15);
                                                } else {
                                                    filtered = [...playerStats]
                                                        .filter(p => {
                                                            const val = p[selectedStat.id];
                                                            if (val === 0 || val === '0' || val === '–' || val === null || val === undefined) return false;
                                                            if (statId === 'avg') return parseFloat(p.avg) > 0 && p.inns >= 10;
                                                            if (statId === 'sr') return parseFloat(p.sr) > 0 && p.matches >= 5 && p.balls >= 70;
                                                            if (statId === 'bowlAvg' || statId === 'bowlSR') return p.wickets > 0 && p.bowlBalls >= 60;
                                                            if (statId === 'economy') return p.bowlBalls >= 60;
                                                            return true;
                                                        })
                                                        .sort((a, b) => {
                                                            if (statId === 'bestBowling') {
                                                                if (b.bestBowling.wkts !== a.bestBowling.wkts) return b.bestBowling.wkts - a.bestBowling.wkts;
                                                                return a.bestBowling.runs - b.bestBowling.runs;
                                                            }
                                                            if (statId === 'economy' || statId === 'bowlAvg' || statId === 'bowlSR') {
                                                                return (parseFloat(a[statId]) || 999) - (parseFloat(b[statId]) || 999);
                                                            }
                                                            return (parseFloat(b[statId]) || 0) - (parseFloat(a[statId]) || 0);
                                                        })
                                                        .slice(0, 15);
                                                }

                                                return (
                                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                                                {columns.map((col, ci) => (
                                                                    <th key={ci} style={{
                                                                        textAlign: col.align,
                                                                        padding: '12px 6px',
                                                                        color: col.highlight ? '#1e1b4b' : '#64748b',
                                                                        fontSize: '12px',
                                                                        fontWeight: '800'
                                                                    }}>
                                                                        {col.label}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {filtered.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={columns.length} style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: '700' }}>
                                                                        No stats available for this category yet.
                                                                    </td>
                                                                </tr>
                                                            ) : filtered.map((p, i) => (
                                                                <tr
                                                                    key={i}
                                                                    className={`animate-fade-in stagger-${(i % 10) + 1}`}
                                                                    style={{
                                                                        borderBottom: '1px solid #f8fafc',
                                                                        cursor: (p.matchId || (statId === 'bestBowling' && p.bestBowling?.matchId)) ? 'pointer' : 'default',
                                                                        transition: 'background-color 0.2s',
                                                                        backgroundColor: 'transparent'
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        if (p.matchId || (statId === 'bestBowling' && p.bestBowling?.matchId)) e.currentTarget.style.backgroundColor = '#f1f5f9';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.backgroundColor = 'transparent';
                                                                    }}
                                                                    onClick={() => {
                                                                        const mId = p.matchId || (statId === 'bestBowling' ? p.bestBowling?.matchId : null);
                                                                        if (mId) {
                                                                            const targetMatch = allMatches.find(x => x.matchId === mId);
                                                                            if (targetMatch) {
                                                                                dispatch({ type: 'INIT_MATCH', payload: targetMatch });
                                                                                navigate('/scorecard');
                                                                            }
                                                                        }
                                                                    }}
                                                                >
                                                                    {columns.map((col, ci) => {
                                                                        if (col.key === 'name') {
                                                                            return (
                                                                                <td key={ci} style={{ padding: '14px 6px', minWidth: '110px' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#334155', whiteSpace: 'normal', lineHeight: '1.2', textTransform: 'uppercase' }}>{p.name}</span>
                                                                                    </div>
                                                                                </td>
                                                                            );
                                                                        }
                                                                        const value = col.key === 'bestBowlingText' ? p.bestBowlingText : p[col.key];
                                                                        return (
                                                                            <td key={ci} style={{
                                                                                textAlign: col.align,
                                                                                padding: '14px 6px',
                                                                                fontSize: col.highlight ? '15px' : '14px',
                                                                                fontWeight: col.highlight ? '900' : '700',
                                                                                color: col.key === 'runs' && col.highlight ? '#10b981' : (col.highlight ? '#4338ca' : '#64748b')
                                                                            }}>
                                                                                {value}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'fastest' && (
                            <div className="card animate-fade-in" style={{ padding: '24px 16px', borderRadius: '28px', backgroundColor: 'white' }}>
                                {!activeMilestone ? (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#e0e7ff' }}><TrendingUp size={18} color="#4338ca" /></div>
                                            <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b' }}>Dataset Milestones</h3>
                                        </div>
                                        <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '20px', lineHeight: '1.4' }}>
                                            Fastest players to reach run milestones based on total balls faced cumulatively within the current loaded dataset.
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            {(() => {
                                                const maxRuns = Math.max(0, ...playerStats.map(p => p.runs));
                                                let topMilestone = Math.floor(maxRuns / 100) * 100;
                                                if (topMilestone < 1000) topMilestone = 1000;
                                                
                                                const milestones = [50];
                                                for (let i = 100; i <= topMilestone; i += 100) {
                                                    milestones.push(i);
                                                }

                                                return milestones.map((ms, idx) => (
                                                    <div
                                                        key={ms}
                                                        className="tap"
                                                        onClick={() => setActiveMilestone(ms)}
                                                        style={{
                                                            padding: '16px 12px',
                                                            borderRadius: '12px',
                                                            borderBottom: idx === milestones.length - 1 ? 'none' : '1px solid #f1f5f9',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#334155' }}>Fastest {ms}</span>
                                                        <span style={{ color: '#94a3b8' }}>➔</span>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                                            <button
                                                onClick={() => setActiveMilestone(null)}
                                                style={{
                                                    border: 'none', background: '#f1f5f9', width: '36px', height: '36px',
                                                    borderRadius: '10px', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', cursor: 'pointer', color: '#1e1b4b'
                                                }}
                                            >
                                                ←
                                            </button>
                                            <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b' }}>Fastest {activeMilestone}</h3>
                                        </div>
                                        
                                        <div style={{ overflowX: 'auto', marginTop: '8px' }}>
                                            {(() => {
                                        let milestoneList = [];
                                        playerStats.forEach(p => {
                                            (p.cumulativeMilestoneData || []).filter(d => d.milestone === activeMilestone).forEach(data => {
                                                milestoneList.push({
                                                    name: p.name,
                                                    balls: data.ballsFaced,
                                                    matches: data.matchesPlayed,
                                                    runs: data.runsAtMilestone
                                                });
                                            });
                                        });
                                        
                                        milestoneList.sort((a, b) => a.balls - b.balls);
                                        const top15 = milestoneList.slice(0, 15);

                                        if (top15.length === 0) {
                                            return <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: '700' }}>No players have reached {activeMilestone} runs yet in this dataset.</div>;
                                        }

                                        return (
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                                        <th style={{ textAlign: 'left', padding: '12px 6px', color: '#64748b', fontSize: '12px', fontWeight: '800' }}>Rank</th>
                                                        <th style={{ textAlign: 'left', padding: '12px 6px', color: '#64748b', fontSize: '12px', fontWeight: '800' }}>Player</th>
                                                        <th style={{ textAlign: 'right', padding: '12px 6px', color: '#1e1b4b', fontSize: '12px', fontWeight: '800' }}>Balls</th>
                                                        <th style={{ textAlign: 'right', padding: '12px 6px', color: '#64748b', fontSize: '12px', fontWeight: '800' }}>Matches</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {top15.map((item, idx) => (
                                                        <tr key={idx} className={`animate-fade-in stagger-${(idx % 10) + 1}`} style={{ borderBottom: '1px solid #f8fafc', animationFillMode: 'both' }}>
                                                            <td style={{ padding: '14px 6px', fontSize: '14px', fontWeight: '800', color: '#94a3b8' }}>#{idx + 1}</td>
                                                            <td style={{ padding: '14px 6px', fontSize: '14px', fontWeight: '800', color: '#334155', textTransform: 'uppercase' }}>
                                                                {item.name}
                                                                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>{item.runs} runs</div>
                                                            </td>
                                                            <td style={{ textAlign: 'right', padding: '14px 6px', fontSize: '16px', fontWeight: '900', color: '#4338ca' }}>{item.balls}</td>
                                                            <td style={{ textAlign: 'right', padding: '14px 6px', fontSize: '13px', fontWeight: '700', color: '#64748b' }}>in {item.matches}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        );
                                    })()}
                                </div>
                            </>
                        )}
                    </div>
                )}

                        {activeTab === 'toss' && (
                            <div className="card" style={{ padding: '24px', borderRadius: '28px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                                    <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#fff7ed' }}><Coins size={18} color="#f59e0b" /></div>
                                    <h3 style={{ fontSize: '17px', fontWeight: '900', color: '#1e1b4b' }}>Toss Strategy</h3>
                                </div>
                                <div style={{ width: '100%', height: '220px', marginBottom: '24px' }}>
                                    <RechartsResponsiveContainer width="100%" height="100%">
                                        <RechartsBarChart data={[
                                            { name: 'Bat First', winRate: tossStats.batWinRate, fill: '#10b981' },
                                            { name: 'Bowl First', winRate: tossStats.bowlWinRate, fill: '#3b82f6' }
                                        ]} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                            <RechartsXAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} fontWeight={800} fill="#64748b" />
                                            <RechartsYAxis hide domain={[0, 100]} />
                                            <RechartsTooltip
                                                cursor={{ fill: '#f8fafc' }}
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        return (
                                                            <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: 'none' }}>
                                                                <p style={{ margin: 0, fontWeight: '900', color: '#1e1b4b', fontSize: '14px' }}>{payload[0].payload.name}</p>
                                                                <p style={{ margin: '4px 0 0', fontWeight: '800', color: payload[0].payload.fill, fontSize: '16px' }}>{payload[0].value}% Win Rate</p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <RechartsBar dataKey="winRate" radius={[10, 10, 0, 0]} barSize={45}>
                                                {payload => (
                                                    <RechartsCell key={`cell-0`} fill="#10b981" />
                                                )}
                                                <RechartsCell key={`cell-1`} fill="#3b82f6" />
                                            </RechartsBar>
                                        </RechartsBarChart>
                                    </RechartsResponsiveContainer>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '20px', padding: '16px', textAlign: 'center', boxShadow: '0 4px 12px rgba(16,185,129,0.05)' }}>
                                        <div style={{ fontSize: '11px', color: '#15803d', fontWeight: '800', textTransform: 'uppercase', marginBottom: '4px' }}>Bat Win Rate</div>
                                        <div style={{ fontSize: '24px', fontWeight: '900', color: '#166534' }}>{tossStats.batWinRate}%</div>
                                        <div style={{ fontSize: '11px', color: '#15803d', fontWeight: '800', marginTop: '4px', opacity: 0.7 }}>
                                            {tossStats.batFirst.wins} Wins ({tossStats.batFirst.total} M)
                                        </div>
                                    </div>
                                    <div style={{ backgroundColor: '#eff6ff', borderRadius: '20px', padding: '16px', textAlign: 'center', boxShadow: '0 4px 12px rgba(59,130,246,0.05)' }}>
                                        <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: '800', textTransform: 'uppercase', marginBottom: '4px' }}>Bowl Win Rate</div>
                                        <div style={{ fontSize: '24px', fontWeight: '900', color: '#1e40af' }}>{tossStats.bowlWinRate}%</div>
                                        <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: '800', marginTop: '4px', opacity: 0.7 }}>
                                            {tossStats.bowlFirst.wins} Wins ({tossStats.bowlFirst.total} M)
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'partnership' && (
                            <div className="card" style={{ padding: '24px', borderRadius: '28px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                                    <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#eef2ff' }}><Handshake size={18} color="#4338ca" /></div>
                                    <h3 style={{ fontSize: '17px', fontWeight: '900', color: '#1e1b4b' }}>Dynamic Duos</h3>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {partnerships.map((p, i) => (
                                        <div key={i} style={{ padding: '20px', borderRadius: '20px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '14px', flexShrink: 0 }}>
                                                #{i + 1}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '800', fontSize: '15px', color: '#1e1b4b', marginBottom: '2px' }}>{p.name}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '4px' }}>
                                                    {p.players && Object.values(p.players).map((pl, pi) => (
                                                        <span key={pi}>
                                                            {pl.name}: <span style={{ fontWeight: '800', color: '#4338ca' }}>{pl.runs}r</span> <span style={{ color: '#94a3b8' }}>({pl.balls}b)</span>
                                                            {pi === 0 ? ' • ' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>In {p.innings} matches together</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b' }}>{p.runs}</div>
                                                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', marginBottom: '4px' }}>Runs</div>
                                                <div style={{ fontSize: '15px', fontWeight: '900', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '2px', display: 'inline-block' }}>{p.balls}</div>
                                                <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase' }}>Balls</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'team' && (
                            <div className="card" style={{ padding: '24px', borderRadius: '28px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                                    <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#fdf2f8' }}><Trophy size={18} color="#db2777" /></div>
                                    <h3 style={{ fontSize: '17px', fontWeight: '900', color: '#1e1b4b' }}>Team Standings</h3>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {teamStats.map((t, i) => (
                                        <div key={i} style={{ padding: '20px', borderRadius: '24px', background: 'white', border: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '900', fontSize: '16px', color: '#1e1b4b', marginBottom: '4px' }}>{t.name}</div>
                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                    <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '800' }}>{t.wins} Wins</div>
                                                    <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: '800' }}>{t.losses} Losses</div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '20px', fontWeight: '900', color: '#1e1b4b' }}>{Math.round((t.wins / (t.matches || 1)) * 100)}%</div>
                                                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase' }}>Win Rate</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            
        </div>
    );
};

export default Analytics;
