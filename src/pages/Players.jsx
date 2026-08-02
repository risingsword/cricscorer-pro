import React, { useEffect, useState } from 'react';
import useScrollRestore from '../hooks/useScrollRestore';
import { getScroll } from '../utils/scrollStore';
import { useNavigate } from 'react-router-dom';
import { Search, Users } from 'lucide-react';

import NameInput from '../components/NameInput';

const Players = () => {
    const navigate = useNavigate();
    const [players, setPlayers] = useState(() => {
        const cached = sessionStorage.getItem('cricscorer_players_list');
        return cached ? JSON.parse(cached) : [];
    });
    const [loading, setLoading] = useState(() => !sessionStorage.getItem('cricscorer_players_list'));
    const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('playersSearchTerm') || '');
    const [filter, setFilter] = useState(() => sessionStorage.getItem('playersFilter') || 'All');
    const [matchTypeFilter, setMatchTypeFilter] = useState(() => sessionStorage.getItem('playersMatchTypeFilter') || 'Regular Matches');
    const [allMatches, setAllMatches] = useState([]);
    const [allMatchesLoaded, setAllMatchesLoaded] = useState(false);
    const [hasTournaments, setHasTournaments] = useState(false);
    const [showSearch, setShowSearch] = useState(() => !!sessionStorage.getItem('playersSearchTerm'));
    const [hiddenPlayers, setHiddenPlayers] = useState([]);
    const [renderLimit, setRenderLimit] = useState(() => {
        const saved = getScroll('players');
        return saved > 0 ? 100 : 15;
    });

    useEffect(() => {
        if (renderLimit < players.length) {
            const timer = setTimeout(() => {
                setRenderLimit(prev => Math.min(prev + 10, players.length));
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [renderLimit, players.length]);

    useEffect(() => {
        loadMatches();
    }, []);

    // Pre-paint scroll restoration — no flicker
    useScrollRestore('players', !loading);

    const loadMatches = async () => {
        const { fetchAllMatches } = await import('../utils/dataFetcher');
        
        const processData = (regularMatches) => {
            const storedTournaments = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
            setHasTournaments(storedTournaments.length > 0);
            let tournamentMatches = [];
            storedTournaments.forEach(t => {
                t.matches.forEach(m => {
                    if ((m.status === 'completed' || m.status === 'live') && m.matchState) {
                        tournamentMatches.push({ ...m.matchState, isTournamentMatch: true });
                    }
                });
            });

            setAllMatches([...regularMatches, ...tournamentMatches]);
            setAllMatchesLoaded(true);
            setLoading(false);
        };

        const initialMatches = await fetchAllMatches(false, processData);
        processData(initialMatches);
    };

    useEffect(() => {
        if (!allMatchesLoaded) return;
        const playerMap = {};
        const matchesToProcess = allMatches.filter(m => {
            const deletedList = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
            if (deletedList.includes(m.matchId)) return false;
            if (m.matchStatus !== 'complete' && m.matchStatus !== 'live' && m.matchStatus !== 'innings_break') return false;
            
            if (matchTypeFilter === 'Regular Matches') return !m.isTournamentMatch;
            if (matchTypeFilter === 'Tournament Matches') return m.isTournamentMatch;
            return true;
        });

        matchesToProcess.forEach(match => {
            const matchId = match.matchId;

            (match.innings || []).forEach(inn => {
                (inn.batsmen || []).forEach(b => {
                    if (!b.name) return;
                    const nameKey = b.name.trim().toLowerCase();
                    if (!playerMap[nameKey]) {
                        playerMap[nameKey] = {
                            name: b.name.trim(),
                            matches: new Set(),
                            runs: 0,
                            wickets: 0,
                            dismissals: 0,
                            ballsFaced: 0,
                            ballsBowled: 0
                        };
                    }
                    playerMap[nameKey].matches.add(matchId);
                    playerMap[nameKey].runs += (b.runs || 0);
                    playerMap[nameKey].ballsFaced += (b.balls || 0);
                    if (b.isOut) playerMap[nameKey].dismissals += 1;
                });

                (inn.bowlers || []).forEach(b => {
                    const nameKey = b.name.trim().toLowerCase();
                    if (!playerMap[nameKey]) {
                        playerMap[nameKey] = {
                            name: b.name.trim(),
                            matches: new Set(),
                            runs: 0,
                            wickets: 0,
                            dismissals: 0,
                            ballsFaced: 0,
                            ballsBowled: 0
                        };
                    }
                    playerMap[nameKey].matches.add(matchId);
                    playerMap[nameKey].wickets += (b.wickets || 0);
                    playerMap[nameKey].ballsBowled += (Math.floor(b.overs || 0) * 6 + ((b.overs || 0) % 1 * 10));
                });
            });
        });

        const playerList = Object.values(playerMap).map(p => {
            const avg = p.dismissals > 0 ? (p.runs / p.dismissals).toFixed(1) : (p.runs > 0 ? p.runs.toFixed(1) : '-');
            let role = 'Batsman';
            if (p.ballsBowled > 0 && p.ballsFaced > 0) role = 'All-rounder';
            else if (p.ballsBowled > 0) role = 'Bowler';

            return {
                ...p,
                matchCount: p.matches.size,
                avg,
                role
            };
        }).sort((a, b) => b.runs - a.runs);

        setPlayers(playerList);
        try {
            sessionStorage.setItem('cricscorer_players_list', JSON.stringify(playerList));
        } catch (e) {
            console.warn("Could not cache players to sessionStorage", e);
        }
    }, [allMatches, matchTypeFilter, allMatchesLoaded]);

    const filteredPlayers = players.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        if (filter === 'All') return true;
        if (filter === 'Batsmen') return p.role === 'Batsman' || p.role === 'All-rounder';
        if (filter === 'Bowlers') return p.role === 'Bowler' || p.role === 'All-rounder';
        if (filter === 'All-rounders') return p.role === 'All-rounder';
        return true;
    });

    const getInitials = (name) => {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    };

    const getColor = (name) => {
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    return (
        <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', paddingBottom: '120px' }}>
            <div className="header" style={{ padding: '0 20px', height: '64px', border: 'none', background: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={20} color="#1e1b4b" />
                    </div>
                    <span style={{ fontWeight: '900', fontSize: '18px', color: '#1e1b4b', letterSpacing: '-0.5px' }}>Cricket Legends</span>
                </div>
            </div>


            <div className="container animate-fade-in" style={{ padding: '12px 16px' }}>
                {hasTournaments && (
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '12px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {['Regular Matches', 'Tournament Matches', 'All Matches'].map(f => (
                            <button
                                key={f}
                                onClick={() => {
                                    setMatchTypeFilter(f);
                                    sessionStorage.setItem('playersMatchTypeFilter', f);
                                }}
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

                {/* Filter row and search circle */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: showSearch ? '8px' : '12px' }}>
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', msOverflowStyle: 'none', flex: 1 }}>
                        {['All', 'Batsmen', 'Bowlers', 'All-rounders'].map(f => (
                            <button
                                key={f}
                                onClick={() => {
                                    setFilter(f);
                                    sessionStorage.setItem('playersFilter', f);
                                }}
                                style={{
                                    whiteSpace: 'nowrap',
                                    padding: '0 12px',
                                    borderRadius: '16px',
                                    fontSize: '12px',
                                    fontWeight: '800',
                                    border: 'none',
                                    backgroundColor: filter === f ? '#1e1b4b' : 'white',
                                    color: filter === f ? 'white' : '#64748b',
                                    cursor: 'pointer',
                                    height: '34px',
                                    flexShrink: 0,
                                    boxShadow: filter === f ? '0 8px 16px rgba(30,27,75,0.2)' : '0 2px 8px rgba(0,0,0,0.02)'
                                }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    {/* Search circle button */}
                    <button
                        onClick={() => {
                            setShowSearch(s => !s);
                            if (showSearch) {
                                setSearchTerm('');
                                sessionStorage.removeItem('playersSearchTerm');
                            }
                        }}
                        style={{
                            flexShrink: 0,
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            border: showSearch ? 'none' : '2px solid #c7d2fe',
                            backgroundColor: showSearch ? '#4338ca' : '#eef2ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: showSearch ? '0 8px 16px rgba(67,56,202,0.3)' : '0 2px 8px rgba(0,0,0,0.06)',
                            transition: 'all 0.2s ease',
                            padding: 0
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                            stroke={showSearch ? '#ffffff' : '#4338ca'}
                            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </button>
                </div>

                {/* Expandable search input — no icon inside, lens is in the circle */}
                {showSearch && (
                    <div style={{ marginBottom: '12px' }}>
                        <input
                            type="text"
                            placeholder="Search player stats..."
                            value={searchTerm}
                            autoFocus
                            onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                setSearchTerm(val);
                                sessionStorage.setItem('playersSearchTerm', val);
                            }}
                            style={{
                                width: '100%',
                                height: '44px',
                                padding: '0 16px',
                                borderRadius: '14px',
                                border: '2px solid #e2e8f0',
                                backgroundColor: 'white',
                                fontSize: '13px',
                                fontWeight: '700',
                                color: '#1e1b4b',
                                outline: 'none',
                                boxSizing: 'border-box',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                fontFamily: 'inherit'
                            }}
                            onFocus={e => e.target.style.borderColor = '#4338ca'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>
                )}

                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="animate-pulse" style={{ height: '80px', backgroundColor: 'white', borderRadius: '24px', display: 'flex', alignItems: 'center', padding: '16px', gap: '16px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#f1f5f9' }}></div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ width: '120px', height: '14px', backgroundColor: '#f1f5f9', borderRadius: '4px', marginBottom: '8px' }}></div>
                                    <div style={{ width: '60px', height: '10px', backgroundColor: '#f1f5f9', borderRadius: '4px' }}></div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}></div>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredPlayers.slice(0, renderLimit).map((p, idx) => (
                            <div
                                key={idx}
                                className={`card tap-card animate-fade-in stagger-${(idx % 10) + 1}`}
                                onClick={() => navigate(`/player-profile/${encodeURIComponent(p.name)}`)}
                                style={{
                                    padding: '16px',
                                    marginBottom: '0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    border: 'none',
                                    borderRadius: '24px',
                                    boxShadow: '0 8px 30px rgba(0,0,0,0.03)'
                                }}
                            >
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '16px',
                                    backgroundColor: getColor(p.name),
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '900',
                                    fontSize: '18px',
                                    marginRight: '16px',
                                    flexShrink: 0,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                }}>
                                    {getInitials(p.name)}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '900', fontSize: '16px', color: '#1e1b4b', marginBottom: '2px', textTransform: 'uppercase' }}>{p.name}</div>
                                    <div style={{ fontSize: '10px', color: '#4338ca', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{p.role}</div>
                                </div>
                                    <div style={{ display: 'flex', gap: '16px', textAlign: 'center' }}>
                                        <div style={{ minWidth: '40px' }}>
                                            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase' }}>Runs</div>
                                            <div style={{ fontSize: '15px', fontWeight: '900', color: '#1e1b4b' }}>{p.runs}</div>
                                        </div>
                                        <div style={{ minWidth: '40px' }}>
                                            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase' }}>Wkts</div>
                                            <div style={{ fontSize: '15px', fontWeight: '900', color: '#1e1b4b' }}>{p.wickets}</div>
                                        </div>
                                    </div>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && filteredPlayers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'white', borderRadius: '32px', marginTop: '20px' }}>
                        <div style={{ fontSize: '56px', marginBottom: '20px' }}>🔎</div>
                        <h3 style={{ fontWeight: '900', fontSize: '20px', color: '#1e1b4b', marginBottom: '8px' }}>No legends found</h3>
                        <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '600' }}>Could not find any player matching "{searchTerm}"</p>
                    </div>
                )}
            </div>

            
        </div>
    );
};

export default Players;
