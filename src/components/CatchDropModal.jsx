import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NameInput from './NameInput';
import { triggerHaptic } from '../utils/haptics';
import { SPRING_PRESET } from '../utils/animationPresets';

function triggerRipple(containerRef, e, color = 'rgba(255,255,255,0.35)') {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ios-ripple-dot';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${x - size/2}px;top:${y - size/2}px;background:${color};`;
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 620);
}

const TapButton = ({ onClick, isSelected, disabled, style, children, rippleColor }) => {
    const ref = useRef(null);
    const handlePointerDown = useCallback((e) => {
        if (disabled) return;
        triggerRipple(ref, e, rippleColor || (isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(30,27,75,0.12)'));
    }, [disabled, isSelected, rippleColor]);

    return (
        <motion.div
            ref={ref}
            whileTap={disabled ? {} : { scale: 0.97 }}
            transition={SPRING_PRESET}
            onClick={(e) => {
                if (disabled) return;
                triggerHaptic('light');
                if (onClick) onClick(e);
            }}
            onPointerDown={handlePointerDown}
            style={{
                position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '14px', fontFamily: 'inherit', fontWeight: '800', fontSize: '14px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                border: isSelected ? 'none' : '1.5px solid #f1f5f9',
                background: isSelected ? 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)' : '#ffffff',
                color: isSelected ? '#ffffff' : '#1e1b4b',
                boxShadow: isSelected ? '0 8px 20px rgba(30,27,75,0.22)' : '0 2px 8px rgba(0,0,0,0.03)',
                userSelect: 'none', WebkitUserSelect: 'none',
                ...style,
            }}
        >
            <span style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'rgba(255,255,255,0)', pointerEvents: 'none' }} />
            <span style={{ position: 'relative', zIndex: 2 }}>{children}</span>
        </motion.div>
    );
};

const CatchDropModal = ({
    show,
    currentStriker,
    currentBowler,
    settings,
    onConfirm,
    onClose
}) => {
    const [fielderName, setFielderName] = useState('');
    const [runsScored, setRunsScored] = useState(0);
    const [isNoBall, setIsNoBall] = useState(false);

    if (!show) return null;

    const showNoBallQuestion = settings?.showNoBall !== false;

    const handleConfirm = () => {
        if (!fielderName.trim()) return;
        triggerHaptic('medium');
        onConfirm({
            fielderName: fielderName.trim(),
            runsScored,
            isNoBall,
        });
        resetAll();
    };

    const resetAll = () => {
        setFielderName('');
        setRunsScored(0);
        setIsNoBall(false);
    };

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="modal-overlay"
                    style={{ zIndex: 2000, alignItems: 'flex-end', padding: 0 }}
                >
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: '0%' }}
                        exit={{ y: '100%' }}
                        transition={SPRING_PRESET}
                        className="modal-content"
                        style={{ padding: '28px 24px', borderRadius: '28px 28px 0 0', maxWidth: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                    >
                        {/* Header */}
                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#1e1b4b', marginBottom: '4px' }}>
                                Catch Dropped
                            </h3>
                            <p style={{ color: '#64748b', fontSize: '12px', fontWeight: '700' }}>
                                Dropped: {currentStriker} (Bowler: {currentBowler})
                            </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {/* Fielder Name Input */}
                            <div>
                                <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                                    Fielder Name
                                </p>
                                <NameInput
                                    placeholder="Enter fielder name"
                                    value={fielderName}
                                    onChange={(val) => setFielderName(val.toUpperCase())}
                                    style={{ input: { marginBottom: '0' } }}
                                />
                            </div>

                            {/* Runs Scored */}
                            <div>
                                <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                                    Runs Scored on this Ball
                                </p>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {[0, 1, 2, 3, 4, 6].map(runs => (
                                        <TapButton
                                            key={runs}
                                            isSelected={runsScored === runs}
                                            onClick={() => setRunsScored(runs)}
                                            style={{ flex: 1, height: '44px', fontSize: '14px', fontWeight: '900' }}
                                        >
                                            {runs}
                                        </TapButton>
                                    ))}
                                </div>
                            </div>

                            {/* No Ball Question (Conditional) */}
                            {showNoBallQuestion && (
                                <div>
                                    <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                                        Delivery Type
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <TapButton
                                            isSelected={!isNoBall}
                                            onClick={() => setIsNoBall(false)}
                                            style={{ flex: 1, height: '42px', fontSize: '13px' }}
                                        >
                                            ⚾ Normal
                                        </TapButton>
                                        <TapButton
                                            isSelected={isNoBall}
                                            onClick={() => setIsNoBall(true)}
                                            style={{ flex: 1, height: '42px', fontSize: '13px' }}
                                            rippleColor="rgba(239, 68, 68, 0.2)"
                                        >
                                            🚫 No Ball
                                        </TapButton>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                <TapButton
                                    isSelected={false}
                                    onClick={() => { resetAll(); onClose(); }}
                                    style={{ flex: 1, height: '54px', borderRadius: '16px', fontWeight: '900', fontSize: '15px' }}
                                >
                                    Cancel
                                </TapButton>
                                <TapButton
                                    isSelected={true}
                                    disabled={!fielderName.trim()}
                                    onClick={handleConfirm}
                                    style={{ flex: 1, height: '54px', borderRadius: '16px', fontWeight: '900', fontSize: '15px' }}
                                >
                                    Drop
                                </TapButton>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default React.memo(CatchDropModal);
