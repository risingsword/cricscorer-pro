import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING_PRESET } from '../../utils/animationPresets';

const InningsHeader = ({ innings, state, onTeamClick }) => {
    const crr = innings.balls > 0 ? (innings.runs / (innings.balls / 6)).toFixed(2) : '0.00';
    const target = state.target;
    const rrr = (state.currentInnings === 2 && target) ?
        (state.totalOvers > 0 ? ((target - innings.runs) / (Math.max(1, state.totalOvers * 6 - innings.balls) / 6)).toFixed(2) : '-') : null;

    return (
        <div className="card" style={{ padding: '12px 16px', marginBottom: '8px', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', boxShadow: '0 8px 15px rgba(30, 27, 75, 0.1)', color: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', fontWeight: '800', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 2s infinite' }}></div>
                        <span 
                            onClick={() => onTeamClick && onTeamClick(innings.battingTeam, 'team')}
                            style={{ cursor: 'pointer', textDecoration: 'underline dotted 1px' }}
                        >
                            {innings.battingTeam}
                        </span> • Inn {state.currentInnings}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '32px', fontWeight: '900', lineHeight: '1', letterSpacing: '-1px', display: 'inline-flex', alignItems: 'baseline' }}>
                            <AnimatePresence mode="popLayout">
                                <motion.span
                                    key={innings.runs}
                                    initial={{ opacity: 0.2, y: -10, scale: 1.15 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    transition={SPRING_PRESET}
                                    style={{ display: 'inline-block' }}
                                >
                                    {innings.runs}
                                </motion.span>
                            </AnimatePresence>
                            <span style={{ opacity: 0.5, fontSize: '24px', margin: '0 1px' }}>/</span>
                            <AnimatePresence mode="popLayout">
                                <motion.span
                                    key={innings.wickets}
                                    initial={{ opacity: 0.2, y: -10, scale: 1.15 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    transition={SPRING_PRESET}
                                    style={{ display: 'inline-block' }}
                                >
                                    {innings.wickets}
                                </motion.span>
                            </AnimatePresence>
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            <AnimatePresence mode="popLayout">
                                <motion.span
                                    key={innings.overs}
                                    initial={{ opacity: 0.5, scale: 0.95 }}
                                    animate={{ opacity: 0.7, scale: 1 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', fontWeight: '700' }}
                                >
                                    ({innings.overs})
                                </motion.span>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', fontWeight: '800' }}>CRR</div>
                        <AnimatePresence mode="popLayout">
                            <motion.div
                                key={crr}
                                initial={{ opacity: 0.3, scale: 1.1 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.25 }}
                                style={{ fontSize: '16px', fontWeight: '900', color: '#10b981' }}
                            >
                                {crr}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                    {rrr && (
                        <div style={{ textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '12px' }}>
                            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', fontWeight: '800' }}>RRR</div>
                            <AnimatePresence mode="popLayout">
                                <motion.div
                                    key={rrr}
                                    initial={{ opacity: 0.3, scale: 1.1 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.25 }}
                                    style={{ fontSize: '16px', fontWeight: '900', color: '#f59e0b' }}
                                >
                                    {rrr}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            {state.currentInnings === 2 && target && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.9)' }}>
                        {state.totalOvers > 0 ? (
                            <span>Need <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: '900' }}>{Math.max(0, target - innings.runs)}</span> from <span style={{ color: '#ffffff' }}>{Math.max(0, state.totalOvers * 6 - innings.balls)}</span> balls</span>
                        ) : (
                            <span>Need <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: '900' }}>{Math.max(0, target - innings.runs)}</span> runs</span>
                        )}
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '4px', overflow: 'hidden' }}>
                        <motion.div
                            animate={{ width: `${Math.min(100, (innings.runs / target) * 100)}%` }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                            style={{ height: '100%', backgroundColor: '#10b981' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(InningsHeader);
