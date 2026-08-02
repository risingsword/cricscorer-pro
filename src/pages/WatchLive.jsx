import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { rtdb } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { ChevronLeft } from 'lucide-react';
import { sanitizeInput } from '../utils/sanitize';

const WatchLive = () => {
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [matchData, setMatchData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleWatch = () => {
        if (code.length < 6 || code.length > 8) {
            setError('Enter a valid share code (6-8 characters)');
            return;
        }
        setLoading(true);
        const matchRef = ref(rtdb, `live/${code.toUpperCase()}`);
        onValue(matchRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setMatchData(data.matchState);
                setError('');
            } else {
                setError('No live match found for this code');
            }
            setLoading(false);
        });
    };

    return (
        <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
            <div className="header" style={{ justifyContent: 'space-between' }}>
                <ChevronLeft onClick={() => navigate(-1)} style={{ cursor: 'pointer' }} />
                <span style={{ fontWeight: 'bold' }}>Watch Live</span>
                <div style={{ width: '20px' }}></div>
            </div>

            <div className="container animate-fade-in">
                {!matchData ? (
                    <div className="card" style={{ marginTop: '40px' }}>
                        <h3 style={{ marginBottom: '16px', textAlign: 'center' }}>Enter Live Code</h3>
                        <input
                            placeholder="Share code (e.g. CR4X9Z8Y)"
                            maxLength={8}
                            value={code}
                            onChange={(e) => setCode(sanitizeInput(e.target.value).toUpperCase())}
                            style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '2px', marginBottom: '20px' }}
                        />
                        {error && <p style={{ color: '#e94560', fontSize: '13px', textAlign: 'center', marginBottom: '16px' }}>{error}</p>}
                        <button className="primary" onClick={handleWatch} disabled={loading}>
                            {loading ? 'Connecting...' : '🛰️ Start Watching'}
                        </button>
                    </div>
                ) : (
                    <div className="animate-fade-in">
                        <div className="card" style={{ backgroundColor: '#1a1a2e', color: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '14px', color: '#e94560', fontWeight: 'bold', marginBottom: '4px' }}>🔴 LIVE</div>
                                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{matchData.innings[matchData.currentInnings - 1].runs}-{matchData.innings[matchData.currentInnings - 1].wickets}</div>
                                    <div style={{ fontSize: '14px', opacity: 0.8 }}>Overs: {matchData.innings[matchData.currentInnings - 1].overs}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{matchData.team1.name} v {matchData.team2.name}</div>
                                    <div style={{ fontSize: '13px', opacity: 0.8 }}>CRR: {(matchData.innings[matchData.currentInnings - 1].runs / (matchData.innings[matchData.currentInnings - 1].overs || 1)).toFixed(2)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Viewer only sees essential info, readonly */}
                        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '12px', marginTop: '20px' }}>
                            👁️ You are viewing this match live. Scoring is disabled.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WatchLive;
