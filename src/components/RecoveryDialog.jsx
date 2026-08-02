import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';

const RecoveryDialog = () => {
    const navigate = useNavigate();
    const { dispatch } = useMatch();
    const [show, setShow] = React.useState(false);
    const [liveMatch, setLiveMatch] = React.useState(null);

    React.useEffect(() => {
        const saved = localStorage.getItem("cricscorer_live_match");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.matchId) {
                    setLiveMatch(parsed);
                    setShow(true);
                }
            } catch (e) {}
        }
    }, []);

    const handleResume = () => {
        dispatch({ type: 'UPDATE_STATE', payload: liveMatch });
        setShow(false);
        if (liveMatch.matchStatus === 'live') {
            navigate('/live-scoring');
        } else if (liveMatch.matchStatus === 'innings_break') {
            navigate('/innings-break');
        }
    };

    const handleDismiss = () => {
        localStorage.removeItem("cricscorer_live_match");
        setShow(false);
    };

    if (!show) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 999999, padding: '20px'
        }}>
            <div className="card" style={{ 
                width: '100%', maxWidth: '400px', padding: '32px', 
                backgroundColor: 'white', borderRadius: '32px', textAlign: 'center',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
            }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🏟️</div>
                <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#1e1b4b', marginBottom: '12px' }}>Resume Match?</h2>
                <p style={{ color: '#64748b', fontSize: '15px', fontWeight: '600', marginBottom: '32px', lineHeight: '1.6' }}>
                    An incomplete match was found: <br/> 
                    <span style={{ color: 'var(--primary)', fontWeight: '800' }}>
                        {liveMatch.team1.name} vs {liveMatch.team2.name}
                    </span>
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button 
                        onClick={handleResume}
                        style={{
                            height: '56px', borderRadius: '18px', backgroundColor: '#1e1b4b',
                            color: 'white', border: 'none', fontWeight: '800', fontSize: '16px',
                            cursor: 'pointer', boxShadow: '0 8px 20px rgba(30,27,75,0.2)'
                        }}
                    >
                        Resume Match
                    </button>
                    <button 
                        onClick={handleDismiss}
                        style={{
                            height: '56px', borderRadius: '18px', backgroundColor: 'transparent',
                            color: '#ef4444', border: '1.5px solid #fee2e2', fontWeight: '800', fontSize: '14px',
                            cursor: 'pointer'
                        }}
                    >
                        Start New Match
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecoveryDialog;
