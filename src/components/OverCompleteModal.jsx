import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NameInput from './NameInput';
import { triggerHaptic } from '../utils/haptics';
import { SPRING_PRESET, SPRING_BOUNCE } from '../utils/animationPresets';

const OverCompleteModal = ({ show, onStartNext, onClose, lastOverBowler, striker, nonStriker, innings, state }) => {
    const [newBowler, setNewBowler] = useState('');

    if (!show) return null;

    const bLower = newBowler.trim().toLowerCase();
    const isBatsman = (striker && bLower === striker.trim().toLowerCase()) || 
                      (nonStriker && bLower === nonStriker.trim().toLowerCase());

    const isInvalidBowler = (lastOverBowler && bLower === lastOverBowler.trim().toLowerCase()) || isBatsman;

    // Calculate this over's runs
    const thisOverRuns = innings?.thisOver?.reduce((sum, b) => sum + (b.runs || 0) + (b.extras || 0), 0) || 0;
    const thisOverWickets = innings?.thisOver?.filter(b => b.isWicket).length || 0;

    // Current innings info
    const battingTeam = innings?.battingTeam || state?.team1?.name || '—';
    const totalRuns = innings?.runs || 0;
    const totalWickets = innings?.wickets || 0;
    const totalOvers = innings?.overs || 0;
    const totalBalls = innings?.balls || 0;
    const oversDisplay = `${Math.floor(totalBalls / 6)}${totalBalls % 6 > 0 ? '.' + (totalBalls % 6) : ''}`;

    // Target info for 2nd innings
    const isSecondInnings = state?.currentInnings === 2;
    const target = state?.target || 0;
    const remaining = target > 0 ? target - totalRuns : 0;
    const remainingBalls = state?.totalOvers ? (state.totalOvers * 6) - totalBalls : 0;
    const rrr = remainingBalls > 0 && remaining > 0 ? (remaining / (remainingBalls / 6)).toFixed(2) : null;
    const strikerObj = innings?.batsmen?.find(b => b.name === striker);
    const nonStrikerObj = innings?.batsmen?.find(b => b.name === nonStriker);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="modal-overlay"
                    style={{ backdropFilter: 'blur(6px)', background: 'rgba(15, 23, 42, 0.6)', alignItems: 'center', paddingTop: '0' }}
                >
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 16 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: 16 }}
                        transition={SPRING_PRESET}
                        className="modal-content"
                        style={{ padding: '20px', borderRadius: '24px', maxWidth: '340px', width: '90%' }}
                    >
                        {/* Score Summary Card */}
                        <div style={{
                            background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                            borderRadius: '16px',
                            padding: '14px',
                            marginBottom: '16px',
                            color: 'white',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                                <div style={{ fontSize: '13px', fontWeight: '800', opacity: 0.9 }}>
                                    <span style={{ fontWeight: '500', opacity: 0.8, fontSize: '11px' }}>Run: </span>{totalRuns}/{totalWickets} <span style={{ fontWeight: '600', opacity: 0.7, fontSize: '11px' }}>({oversDisplay})</span>
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: '800', background: 'rgba(255,255,255,0.15)', padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontWeight: '500', opacity: 0.8, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>This Over:</span>
                                    {thisOverRuns} • {thisOverWickets}W
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {strikerObj && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                        <span style={{ fontWeight: '700' }}>{strikerObj.name} *</span>
                                        <span style={{ fontWeight: '800' }}>{strikerObj.runs} ({strikerObj.balls})</span>
                                    </div>
                                )}
                                {nonStrikerObj && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', opacity: 0.85 }}>
                                        <span>{nonStrikerObj.name}</span>
                                        <span>{nonStrikerObj.runs} ({nonStrikerObj.balls})</span>
                                    </div>
                                )}
                            </div>

                            {isSecondInnings && target > 0 && (
                                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '11px', display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
                                    <span>Need {remaining} off {remainingBalls}b</span>
                                    {rrr && <span style={{ color: '#fbbf24' }}>RRR: {rrr}</span>}
                                </div>
                            )}
                        </div>

                        <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '4px', color: '#1e1b4b' }}>Over Complete</h3>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', fontWeight: '600' }}>Who will bowl the next over?</p>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <NameInput
                                placeholder="Enter Bowler Name"
                                value={newBowler}
                                onChange={(val) => setNewBowler(val.toUpperCase())}
                                style={{ input: { height: '48px', borderRadius: '12px', fontSize: '15px', border: isInvalidBowler ? '2px solid #ef4444' : '1.5px solid #f1f5f9' } }}
                            />
                            {isInvalidBowler && (
                                <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: '700', marginTop: '6px', textAlign: 'left' }}>
                                    {isBatsman ? "⚠️ Cannot be a current batsman!" : "⚠️ Same bowler cannot bowl consecutive overs!"}
                                </div>
                            )}
                        </div>

                        <motion.button
                            className="primary tap"
                            whileTap={{ scale: 0.95 }}
                            transition={SPRING_BOUNCE}
                            onClick={() => {
                                if (newBowler.trim() && !isInvalidBowler) {
                                    triggerHaptic('medium');
                                    onStartNext(newBowler.trim());
                                    setNewBowler('');
                                }
                            }}
                            disabled={!newBowler.trim() || isInvalidBowler}
                            style={{
                                width: '100%',
                                height: '48px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                                color: 'white',
                                fontWeight: '800',
                                fontSize: '14px',
                                border: 'none',
                                opacity: (!newBowler.trim() || isInvalidBowler) ? 0.5 : 1,
                                cursor: (!newBowler.trim() || isInvalidBowler) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Start Next Over
                        </motion.button>
                        {onClose && (
                            <button
                                className="secondary"
                                onClick={() => { triggerHaptic('light'); onClose(); }}
                                style={{
                                    width: '100%',
                                    height: '40px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#94a3b8',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    marginTop: '8px',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                Cancel
                            </button>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default React.memo(OverCompleteModal);
