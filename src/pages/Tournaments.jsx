import React, { useState, useEffect } from 'react';
import useScrollRestore from '../hooks/useScrollRestore';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { useMatch } from '../context/MatchContext';
import { Plus, Trophy, Users, Search, PlayCircle, ChevronRight, Share2, Eye } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { sanitizeInput } from '../utils/sanitize';

const Tournaments = () => {
    const navigate = useNavigate();
    const { state } = useMatch();
    const [tournaments, setTournaments] = useState([]);
    const [showCodeInput, setShowCodeInput] = useState(false);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadTournaments = () => {
            const stored = localStorage.getItem('cricscore_tournaments');
            if (stored) {
                try {
                    setTournaments(JSON.parse(stored));
                } catch(e) {}
            }
        };

        loadTournaments();

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') loadTournaments();
        };

        document.addEventListener('visibilitychange', handleVisibility);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    // Pre-paint scroll restoration — no flicker
    useScrollRestore('tournaments');

    const ongoing = tournaments.filter(t => t.status === 'ongoing');
    const upcoming = tournaments.filter(t => t.status === 'upcoming');
    const completed = tournaments.filter(t => t.status === 'completed');

    const handleDeleteTournament = async (tournamentId) => {
        const confirmText = window.prompt("Are you sure? This cannot be undone.\nType 'DELETE' to confirm:");
        if (confirmText !== 'DELETE') return;
        const updated = tournaments.filter(t => t.tournamentId !== tournamentId);
        setTournaments(updated);
        localStorage.setItem('cricscore_tournaments', JSON.stringify(updated));
    };

    const renderCard = (t) => {
        const totalMatches = t.matches?.length || 0;
        const completedMatches = t.matches?.filter(m => m.status === 'completed').length || 0;
        const progress = totalMatches ? (completedMatches / totalMatches) * 100 : 0;
        
        return (
            <div 
                key={t.tournamentId} 
                className={`card ${t.status === 'completed' ? 'opacity-75' : ''}`}
                onClick={() => navigate(`/tournament/${t.tournamentId}`)}
                style={{
                background: 'white',
                padding: '16px',
                borderRadius: '16px',
                marginBottom: '12px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                border: t.status === 'ongoing' ? '1px solid #10b981' : 'none',
                cursor: 'pointer'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e1b4b' }}>{t.name}</h3>
                    <span style={{ 
                        fontSize: '10px', 
                        fontWeight: '800',
                        padding: '4px 8px', 
                        borderRadius: '20px',
                        backgroundColor: t.status === 'ongoing' ? '#dcfce7' : t.status === 'completed' ? '#f1f5f9' : '#fef3c7',
                        color: t.status === 'ongoing' ? '#166534' : t.status === 'completed' ? '#475569' : '#92400e',
                        textTransform: 'uppercase'
                    }}>
                        {t.status}
                    </span>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', fontSize: '12px', color: '#64748b' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Trophy size={14} /> {t.format.replace('_', ' ')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={14} /> {t.teams?.length || 0} Teams</span>
                </div>

                <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                        <span>Progress</span>
                        <span>{completedMatches}/{totalMatches} Matches</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', backgroundColor: t.status === 'ongoing' ? '#10b981' : '#4338ca', transition: 'width 0.3s' }}></div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Organizer: <span style={{ fontWeight: '600', color: '#475569' }}>{t.organizer}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteTournament(t.tournamentId); }}
                            style={{
                                background: '#fee2e2',
                                border: 'none',
                                color: '#ef4444',
                                fontSize: '12px',
                                fontWeight: '700',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            Delete
                        </button>
                        <button style={{
                            background: '#f8fafc',
                            border: 'none',
                            color: '#4338ca',
                            fontSize: '12px',
                            fontWeight: '700',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}>
                            Open
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const handleJoinTournament = async () => {
        if (!code.trim() || code.length < 5) return;
        setLoading(true);
        setError('');
        try {
            const q = query(collection(db, 'tournaments'), where('shareCode', '==', code.toUpperCase().trim()));
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                setError('Tournament not found or Invalid Code');
                setLoading(false);
                return;
            }
            
            const fetchedTournament = snapshot.docs[0].data();
            const existing = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
            // Check if already exists
            if (!existing.find(t => t.tournamentId === fetchedTournament.tournamentId)) {
                existing.push(fetchedTournament);
                localStorage.setItem('cricscore_tournaments', JSON.stringify(existing));
                setTournaments(existing);
            }
            setShowCodeInput(false);
            navigate(`/tournament/${fetchedTournament.tournamentId}`);
        } catch (e) {
            console.error(e);
            setError('Failed to fetch tournament. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', paddingBottom: '80px' }}>
            <Header showLogout={true} />
            <div className="container" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#1a1a2e', margin: 0 }}>Tournaments</h2>
                    <button onClick={() => setShowCodeInput(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#eef2ff', color: '#4338ca', border: 'none', padding: '8px 12px', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}>
                        <Search size={16} /> Find 
                    </button>
                </div>

                {tournaments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: 'white', borderRadius: '16px' }}>
                        <Trophy size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                        <h3 style={{ margin: '0 0 8px 0', color: '#1e1b4b' }}>No Tournaments yet</h3>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Create your first tournament and manage matches easily.</p>
                    </div>
                ) : (
                    <>
                        {ongoing.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>Ongoing</h3>
                                {ongoing.map(renderCard)}
                            </div>
                        )}
                        {upcoming.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>Upcoming</h3>
                                {upcoming.map(renderCard)}
                            </div>
                        )}
                        {completed.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>Completed</h3>
                                {completed.map(renderCard)}
                            </div>
                        )}
                    </>
                )}
            </div>

            <button 
                onClick={() => navigate('/create-tournament')}
                style={{
                    position: 'fixed',
                    bottom: '80px',
                    right: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: '#e94560',
                    color: 'white',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(233, 69, 96, 0.4)',
                    cursor: 'pointer',
                    zIndex: 10
                }}
            >
                <Plus size={28} />
            </button>

            <BottomNav />

            {showCodeInput && (
                <div className="modal-overlay" style={{ zIndex: 5000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)' }}>
                    <div className="modal-content animate-fade-in" style={{ padding: '24px', borderRadius: '24px', maxWidth: '320px', width: '90%' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e1b4b', marginBottom: '16px', textAlign: 'center' }}>Enter Tournament Code</h3>
                        <input 
                            type="text" 
                            value={code} 
                            onChange={e => setCode(sanitizeInput(e.target.value).toUpperCase())}
                            placeholder="e.g. A1B2C3"
                            style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '2px solid #e2e8f0', fontSize: '20px', fontWeight: '800', textAlign: 'center', backgroundColor: '#f8fafc', marginBottom: '16px', textTransform: 'uppercase' }}
                        />
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setShowCodeInput(false)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: '800' }}>Cancel</button>
                            <button onClick={handleJoinTournament} disabled={loading} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#4338ca', color: 'white', fontWeight: '800' }}>{loading ? 'Finding...' : 'Join'}</button>
                        </div>
                        {error && <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '700', textAlign: 'center', marginTop: '12px' }}>{error}</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tournaments;
