import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import { ChevronLeft } from 'lucide-react';
import NameInput from '../components/NameInput';

const ManualScore = () => {
    const navigate = useNavigate();
    const { state, dispatch } = useMatch();
    const [team1, setTeam1] = useState('');
    const [team2, setTeam2] = useState('');
    const [totalOvers, setTotalOvers] = useState('');
    const [runs, setRuns] = useState('');
    const [wickets, setWickets] = useState('');
    const [errors, setErrors] = useState({});

    const handleSave = () => {
        const newErrors = {};
        if (!team1.trim()) newErrors.team1 = 'Batting team name is required';
        if (!team2.trim()) newErrors.team2 = 'Bowling team name is required';
        if (team1.trim() && team2.trim() && team1.trim().toLowerCase() === team2.trim().toLowerCase()) {
            newErrors.team2 = 'Team names must be unique';
        }
        if (!totalOvers) newErrors.totalOvers = 'Total match overs is required';
        if (runs === '') newErrors.runs = 'Runs scored is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const r = parseInt(runs) || 0;
        const w = parseInt(wickets) || 0;
        const totalO = parseInt(totalOvers) || 5;
        const o = totalO;

        const matchId = `MATCH-${Date.now()}`;
        const target = r + 1;

        // Initialize match with 1st innings already done
        dispatch({
            type: 'INIT_MATCH',
            payload: {
                matchId,
                startTime: Date.now(),
                team1: { name: team1, score: r, wickets: w, overs: o, balls: Math.floor(o) * 6 },
                team2: { name: team2, score: 0, wickets: 0, overs: 0, balls: 0 },
                totalOvers: totalO,
                target,
                currentInnings: 2,
                matchStatus: 'live',
                innings: [
                    {
                        battingTeam: team1,
                        bowlingTeam: team2,
                        runs: r,
                        wickets: w,
                        balls: Math.floor(o) * 6,
                        overs: o,
                        extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
                        batsmen: [],
                        bowlers: [],
                        partnerships: [],
                        fallOfWickets: [],
                        timeline: [],
                        thisOver: [],
                    },
                    {
                        battingTeam: team2,
                        bowlingTeam: team1,
                        runs: 0,
                        wickets: 0,
                        balls: 0,
                        overs: 0,
                        extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
                        batsmen: [],
                        bowlers: [],
                        partnerships: [],
                        fallOfWickets: [],
                        timeline: [],
                        thisOver: [],
                    }
                ]
            }
        });

        setTimeout(() => {
            navigate('/player-entry');
        }, 100);
    };

    return (
        <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
            <div className="header">
                <ChevronLeft onClick={() => navigate('/home')} style={{ cursor: 'pointer', marginRight: '16px' }} />
                <span style={{ fontWeight: 'bold' }}>Enter 1st Innings Score</span>
            </div>

            <div className="container animate-fade-in">
                <div className="card" style={{ position: 'relative', zIndex: 10 }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '14px', textTransform: 'uppercase', color: '#6b7280' }}>Teams & Match Info</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Batting Team (1st Innings) *</label>
                            <NameInput
                                placeholder="Enter Team Name"
                                value={team1}
                                onChange={(val) => {
                                    setTeam1(val);
                                    if (errors.team1) setErrors(prev => { const n = { ...prev }; delete n.team1; return n; });
                                }}
                                style={{ input: { borderColor: errors.team1 ? '#e94560' : '' } }}
                            />
                            {errors.team1 && <p style={{ color: '#e94560', fontSize: '11px', marginTop: '4px' }}>{errors.team1}</p>}
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Bowling Team (1st Innings) *</label>
                            <NameInput
                                placeholder="Enter Team Name"
                                value={team2}
                                onChange={(val) => {
                                    setTeam2(val);
                                    if (errors.team2) setErrors(prev => { const n = { ...prev }; delete n.team2; return n; });
                                }}
                                style={{ input: { borderColor: errors.team2 ? '#e94560' : '' } }}
                            />
                            {errors.team2 && <p style={{ color: '#e94560', fontSize: '11px', marginTop: '4px' }}>{errors.team2}</p>}
                        </div>
                        <div style={{ marginTop: '8px' }}>
                            <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Total Match Overs *</label>
                            <input
                                type="number"
                                placeholder="5"
                                value={totalOvers}
                                onChange={(e) => {
                                    setTotalOvers(e.target.value);
                                    if (errors.totalOvers) setErrors(prev => { const n = { ...prev }; delete n.totalOvers; return n; });
                                }}
                                style={{ borderColor: errors.totalOvers ? '#e94560' : '' }}
                            />
                            {errors.totalOvers && <p style={{ color: '#e94560', fontSize: '11px', marginTop: '4px' }}>{errors.totalOvers}</p>}
                        </div>
                    </div>
                </div>

                <div className="card" style={{ position: 'relative', zIndex: 5 }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '14px', textTransform: 'uppercase', color: '#6b7280' }}>1st Innings Score</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Runs Scored *</label>
                            <input
                                type="number"
                                placeholder="0"
                                value={runs}
                                onChange={(e) => {
                                    setRuns(e.target.value);
                                    if (errors.runs) setErrors(prev => { const n = { ...prev }; delete n.runs; return n; });
                                }}
                                style={{ borderColor: errors.runs ? '#e94560' : '' }}
                            />
                            {errors.runs && <p style={{ color: '#e94560', fontSize: '11px', marginTop: '4px' }}>{errors.runs}</p>}
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Wickets (Optional)</label>
                            <input type="number" placeholder="0" value={wickets} onChange={(e) => setWickets(e.target.value)} />
                        </div>
                    </div>
                </div>

                <button
                    className="primary"
                    onClick={handleSave}
                    style={{ marginTop: '20px', backgroundColor: '#e94560' }}
                >
                    Save & Start 2nd Innings
                </button>
            </div>
        </div>
    );
};

export default ManualScore;
