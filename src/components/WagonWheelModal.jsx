import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHaptic } from '../utils/haptics';
import { SPRING_PRESET } from '../utils/animationPresets';

const getSectorPath = (startAngle, endAngle) => {
    const radius = 140;
    const innerRadius = 30;
    const centerX = 150;
    const centerY = 150;

    const gap = 1;
    const s = startAngle + gap;
    const e = endAngle - gap;

    const radStart = (s * Math.PI) / 180;
    const radEnd = (e * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(radStart);
    const y1 = centerY + radius * Math.sin(radStart);
    const x2 = centerX + radius * Math.cos(radEnd);
    const y2 = centerY + radius * Math.sin(radEnd);

    const x3 = centerX + innerRadius * Math.cos(radEnd);
    const y3 = centerY + innerRadius * Math.sin(radEnd);
    const x4 = centerX + innerRadius * Math.cos(radStart);
    const y4 = centerY + innerRadius * Math.sin(radStart);

    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 0 0 ${x4} ${y4} Z`;
};

const slicesData = [
    { id: 'Point', label: 'Point', start: 0, end: 40 },
    { id: 'Third Man', label: 'Third Man', start: 40, end: 80 },
    { id: 'Behind Wicket', label: 'Behind', start: 80, end: 100 },
    { id: 'Fine Leg', label: 'Fine Leg', start: 100, end: 140 },
    { id: 'Square Leg', label: 'Square Leg', start: 140, end: 180 },
    { id: 'Mid Wicket', label: 'Mid Wicket', start: 180, end: 220 },
    { id: 'Long On', label: 'Long On', start: 220, end: 260 },
    { id: 'Straight', label: 'Straight', start: 260, end: 280 },
    { id: 'Long Off', label: 'Long Off', start: 280, end: 320 },
    { id: 'Cover', label: 'Cover', start: 320, end: 360 },
];

const WagonWheelModal = ({ show, onSelect, onSkip, pendingRuns = 0 }) => {
    const [rotationAngle, setRotationAngle] = React.useState(() => {
        const stored = localStorage.getItem('cricscorer_wagon_rotation');
        return stored ? parseInt(stored, 10) : 0;
    });

    const handleRotate = React.useCallback(() => {
        triggerHaptic('light');
        setRotationAngle(prev => {
            const next = (prev + 45) % 360;
            localStorage.setItem('cricscorer_wagon_rotation', next.toString());
            return next;
        });
    }, []);

    const slicePaths = useMemo(() => {
        return slicesData.map((slice) => {
            const path = getSectorPath(slice.start, slice.end);
            const labelAngle = slice.start + (slice.end - slice.start) / 2;
            const labelRad = (labelAngle * Math.PI) / 180;
            const labelRadius = 85;
            const lx = 150 + labelRadius * Math.cos(labelRad);
            const ly = 150 + labelRadius * Math.sin(labelRad);

            return { ...slice, path, lx, ly };
        });
    }, []);

    if (!show) return null;

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
                        style={{ padding: '24px', borderRadius: '28px 28px 0 0', maxWidth: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, textAlign: 'center' }}
                    >
                        <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#1e1b4b', marginBottom: '4px' }}>Where was the shot hit?</h3>
                        <p style={{ color: '#64748b', fontSize: '13px', fontWeight: '700', marginBottom: '16px' }}>Select shot region for {pendingRuns} {pendingRuns === 1 ? 'run' : 'runs'}</p>

                        <div style={{ position: 'relative', width: '280px', height: '280px', margin: '0 auto' }}>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={handleRotate}
                                title="Rotate Field"
                                style={{
                                    position: 'absolute', right: '-8px', top: '-8px', width: '34px', height: '34px', 
                                    borderRadius: '50%', padding: '0', display: 'flex', alignItems: 'center', 
                                    justifyContent: 'center', border: '1.5px solid #e2e8f0', backgroundColor: 'white',
                                    zIndex: 10, cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.08)', fontSize: '16px'
                                }}
                            >
                                🔄
                            </motion.button>
                            <svg 
                                viewBox="0 0 300 300" 
                                style={{ 
                                    width: '100%', height: '100%', overflow: 'visible',
                                    transform: `rotate(${rotationAngle}deg)`,
                                    transformOrigin: '150px 150px',
                                    transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                                }}
                            >
                                <circle cx="150" cy="150" r="145" fill="none" stroke="#e2e8f0" strokeWidth="2" />

                                {slicePaths.map((slice) => (
                                    <g key={slice.id} style={{ cursor: 'pointer' }} onClick={() => {
                                        triggerHaptic('medium');
                                        onSelect(slice.id);
                                    }}>
                                        <path d={slice.path} className="wagon-wheel-slice" />
                                        <text
                                            transform={`rotate(${-rotationAngle} ${slice.lx} ${slice.ly})`}
                                            x={slice.lx} y={slice.ly} fill="#166534" fontSize="11" fontWeight="bold"
                                            textAnchor="middle" style={{ pointerEvents: 'none', userSelect: 'none', transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                                        >
                                            <tspan x={slice.lx} dy="-2">{slice.label.split(' ')[0]}</tspan>
                                            {slice.label.split(' ')[1] && <tspan x={slice.lx} dy="12">{slice.label.split(' ')[1]}</tspan>}
                                        </text>
                                    </g>
                                ))}

                                <rect x="144" y="130" width="12" height="40" rx="1" fill="#8d6e63" stroke="#5d4037" strokeWidth="1" />
                            </svg>
                        </div>

                        <div style={{ marginTop: '24px' }}>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => { triggerHaptic('light'); onSkip(); }}
                                className="secondary"
                                style={{ width: '100%', height: '52px', borderRadius: '16px', fontWeight: '700', border: 'none', cursor: 'pointer' }}
                            >
                                I don't remember / Skip
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default React.memo(WagonWheelModal);
