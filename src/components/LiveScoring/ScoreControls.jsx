import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { triggerHaptic } from '../../utils/haptics';
import { SPRING_BOUNCE, SPRING_PRESET } from '../../utils/animationPresets';

function triggerRipple(containerRef, e, color = 'rgba(255,255,255,0.35)') {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2;

    const dot = document.createElement('span');
    dot.className = 'ios-ripple-dot';
    dot.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${x - size / 2}px;
        top: ${y - size / 2}px;
        background: ${color};
    `;
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
}

const ScoreControls = ({
    extras,
    toggleExtra,
    handleRunClick,
    setShowWicketModal,
    setShowRetireModal,
    setShowCatchDropModal,
    dispatch,
    showPartnership,
    setShowPartnership,
    currentBowler,
    historyLength,
    timelineBalls,
    settings,
    isInningsLive
}) => {
    const canUndo = historyLength > 0 || timelineBalls > 0;
    const [wicketShake, setWicketShake] = useState(false);

    const handleWicketClick = () => {
        if (!currentBowler) return;
        triggerHaptic('warning');
        setWicketShake(true);
        setTimeout(() => {
            setWicketShake(false);
            setShowWicketModal(true);
        }, 160);
    };

    const onRunPress = (run) => {
        if (run <= 3) triggerHaptic('light');
        else if (run === 4) triggerHaptic('medium');
        else if (run === 6) triggerHaptic('heavy');
        handleRunClick(run);
    };

    if (isInningsLive === false) {
        return (
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_BOUNCE}
                    onClick={() => {
                        if (canUndo) {
                            triggerHaptic('medium');
                            dispatch({ type: 'UNDO' });
                        }
                    }}
                    style={{
                        width: '100%',
                        padding: '14px 24px', borderRadius: '16px', backgroundColor: '#fff1f2', color: '#e11d48',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '15px', fontWeight: '800', border: '1.5px solid #ffe4e6', gap: '8px',
                        boxShadow: '0 4px 12px rgba(225, 29, 72, 0.1)',
                        cursor: canUndo ? 'pointer' : 'not-allowed',
                        opacity: canUndo ? 1 : 0.4
                    }}
                >
                    <span style={{ fontSize: '18px' }}>↩️</span> Undo Last Ball
                </motion.div>
            </div>
        );
    }

    return (
        <div style={{ marginTop: '12px' }}>
            {/* Extras Row */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {['wide', 'noBall', 'byes', 'legByes'].filter(extra => {
                    if (extra === 'wide') return settings?.showWideBall !== false;
                    if (extra === 'noBall') return settings?.showNoBall !== false;
                    if (extra === 'byes') return settings?.byesEnabled !== false;
                    if (extra === 'legByes') return settings?.legByesEnabled !== false;
                    return true;
                }).map(extra => {
                    const isActive = extras[extra];
                    return (
                        <motion.div
                            key={extra}
                            whileTap={{ scale: 0.97 }}
                            transition={SPRING_PRESET}
                            onClick={() => {
                                triggerHaptic('light');
                                toggleExtra(extra);
                            }}
                            style={{
                                flex: 1,
                                height: '42px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '12px',
                                backgroundColor: isActive ? 'var(--primary)' : 'white',
                                color: isActive ? 'white' : 'var(--text-muted)',
                                border: isActive ? '1.5px solid transparent' : '1.5px solid #f1f5f9',
                                fontSize: '11px',
                                fontWeight: '800',
                                boxShadow: isActive ? '0 4px 12px rgba(30,27,75,0.2)' : 'none',
                                cursor: 'pointer',
                                zIndex: 0,
                             }}
                        >
                            {extra === 'wide' ? 'WD' : (extra === 'noBall' ? 'NB' : extra.replace('Byes', '').toUpperCase())}
                        </motion.div>
                    );
                })}
            </div>

            {/* Main Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                {/* WICKET */}
                <motion.div
                    animate={wicketShake ? { x: [-8, 8, -6, 6, -3, 3, 0], scale: 0.96 } : { x: 0, scale: 1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_BOUNCE}
                    onClick={handleWicketClick}
                    style={{
                        flex: 1,
                        height: '56px',
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        boxShadow: '0 8px 20px rgba(239, 68, 68, 0.25)',
                        cursor: currentBowler ? 'pointer' : 'not-allowed',
                        opacity: currentBowler ? 1 : 0.5
                    }}
                >
                    <span style={{ fontSize: '18px', zIndex: 2, position: 'relative' }}>☝️</span>
                    <span style={{ fontWeight: '900', fontSize: '14px', color: 'white', letterSpacing: '1px', zIndex: 2, position: 'relative' }}>WICKET</span>
                </motion.div>

                {/* CATCH DROP */}
                <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_PRESET}
                    onClick={() => {
                        if (!currentBowler) return;
                        triggerHaptic('light');
                        setShowCatchDropModal(true);
                    }}
                    style={{
                        flex: 1,
                        height: '56px',
                        borderRadius: '16px',
                        background: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontWeight: '900',
                        fontSize: '13px',
                        border: '1.5px solid #f1f5f9',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
                        color: '#e94560',
                        cursor: currentBowler ? 'pointer' : 'not-allowed',
                        opacity: currentBowler ? 1 : 0.5
                    }}
                >
                    CATCH DROP
                </motion.div>
            </div>

            {/* Quick Tools */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                {/* UNDO */}
                <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_PRESET}
                    onClick={() => {
                        if (canUndo) {
                            triggerHaptic('medium');
                            dispatch({ type: 'UNDO' });
                        }
                    }}
                    style={{
                        height: '42px', borderRadius: '12px', backgroundColor: '#fff1f2', color: '#e11d48',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '800', border: '1px solid #ffe4e6', gap: '4px',
                        cursor: canUndo ? 'pointer' : 'not-allowed',
                        opacity: canUndo ? 1 : 0.4
                    }}
                >
                    <span style={{ fontSize: '13px', zIndex: 2, position: 'relative' }}>↩️</span>
                    <span style={{ zIndex: 2, position: 'relative' }}>Undo</span>
                </motion.div>

                {/* P.SHIP */}
                <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_PRESET}
                    onClick={() => {
                        triggerHaptic('light');
                        setShowPartnership(!showPartnership);
                    }}
                    style={{
                        height: '42px', borderRadius: '12px',
                        backgroundColor: showPartnership ? 'var(--primary)' : 'white',
                        color: showPartnership ? 'white' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '800', border: '1.5px solid #f1f5f9', gap: '4px',
                        cursor: 'pointer'
                    }}
                >
                    <span style={{ fontSize: '13px', zIndex: 2, position: 'relative' }}>🤝</span>
                    <span style={{ zIndex: 2, position: 'relative' }}>P.ship</span>
                </motion.div>

                {/* RETIRE */}
                <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_PRESET}
                    onClick={() => {
                        triggerHaptic('light');
                        setShowRetireModal(true);
                    }}
                    style={{
                        height: '42px', borderRadius: '12px', backgroundColor: 'white', color: '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '800', border: '1.5px solid #f1f5f9', gap: '4px',
                        cursor: 'pointer'
                    }}
                >
                    <span style={{ fontSize: '13px', zIndex: 2, position: 'relative' }}>🏃</span>
                    <span style={{ zIndex: 2, position: 'relative' }}>Retire</span>
                </motion.div>

                {/* SWAP */}
                <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_PRESET}
                    onClick={() => {
                        triggerHaptic('light');
                        dispatch({ type: 'SWAP_BATSMEN' });
                    }}
                    style={{
                        height: '42px', borderRadius: '12px', backgroundColor: 'white', color: '#1e1b4b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '800', border: '1.5px solid #f1f5f9', gap: '4px',
                        cursor: 'pointer'
                    }}
                >
                    <span style={{ fontSize: '13px', zIndex: 2, position: 'relative' }}>🔃</span>
                    <span style={{ zIndex: 2, position: 'relative' }}>Swap</span>
                </motion.div>
            </div>

            {/* Run Buttons */}
            <div className="card" style={{
                padding: '12px',
                borderRadius: '20px',
                backgroundColor: 'white',
                border: '1.5px solid #f1f5f9',
                boxShadow: '0 8px 30px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                    {[0, 1, 2, 3, 4, 6].map(run => {
                        const is4 = run === 4;
                        const is6 = run === 6;
                        return (
                            <motion.div
                                key={run}
                                whileTap={{ scale: 0.97, backgroundColor: is4 ? '#7dd3fc' : (is6 ? '#86efac' : '#e2e8f0') }}
                                transition={SPRING_BOUNCE}
                                onClick={() => onRunPress(run)}
                                style={{
                                    height: '52px',
                                    borderRadius: '12px',
                                    backgroundColor: is4 ? '#e0f2fe' : (is6 ? '#dcfce7' : '#f8fafc'),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '18px',
                                    fontWeight: '900',
                                    color: is4 ? '#0369a1' : (is6 ? '#15803d' : '#1e1b4b'),
                                    gridColumn: run === 6 ? 'span 2' : 'span 1',
                                    cursor: 'pointer',
                                    boxShadow: is4 ? '0 4px 12px rgba(3,105,161,0.15)' : (is6 ? '0 4px 12px rgba(21,128,61,0.15)' : 'none')
                                }}
                            >
                                <span style={{ zIndex: 2, position: 'relative' }}>{run}</span>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default React.memo(ScoreControls);
