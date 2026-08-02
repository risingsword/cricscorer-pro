import React, { useState, useEffect, useRef, useMemo } from 'react';

const WagonWheelVisuals = ({ shots = [], showStats = false }) => {
    const containerRef = useRef(null);
    const [visibleCount, setVisibleCount] = useState(0);
    const [counts, setCounts] = useState({ offRuns: 0, legRuns: 0 });
    const [wagonSide, setWagonSide] = useState('All'); // 'All', 'Off', 'Leg'

    const zoneAngles = {
        'Third Man': 60, 'Point': 20, 'Cover': 340, 'Long Off': 300,
        'Straight': 270, 'Long On': 240, 'Mid Wicket': 200, 
        'Square Leg': 160, 'Fine Leg': 120, 'Behind Wicket': 90
    };

    const runColors = { 0: '#9ca3af', 1: '#ffffff', 2: '#3b82f6', 3: '#db2777', 4: '#eab308', 6: '#ef4444' };
    const offSideZones = ['Third Man', 'Point', 'Cover', 'Long Off', 'Straight'];
    const legSideZones = ['Fine Leg', 'Square Leg', 'Mid Wicket', 'Long On', 'Behind Wicket'];

    // 1. Calculate stats percentages and totals
    const { offRuns, legRuns, offPct, legPct } = useMemo(() => {
        let off = 0, leg = 0;
        shots.forEach(s => {
            if (offSideZones.includes(s.z || s.zone)) off += (s.r || s.runs || 0);
            else if (legSideZones.includes(s.z || s.zone)) leg += (s.r || s.runs || 0);
        });
        const total = off + leg;
        return {
            offRuns: off,
            legRuns: leg,
            offPct: total > 0 ? Math.round((off / total) * 100) : 0,
            legPct: total > 0 ? Math.round((leg / total) * 100) : 0
        };
    }, [shots]);

    // 2. Animate Numbers counting up
    useEffect(() => {
        let start = 0;
        const duration = 1000;
        const stepTime = 20;
        const steps = duration / stepTime;
        const offInc = offRuns / steps;
        const legInc = legRuns / steps;

        const timer = setInterval(() => {
            start++;
            setCounts({
                offRuns: Math.min(Math.round(offInc * start), offRuns),
                legRuns: Math.min(Math.round(legInc * start), legRuns)
            });
            if (start >= steps) clearInterval(timer);
        }, stepTime);

        return () => clearInterval(timer);
    }, [offRuns, legRuns]);

    // 3. One-by-one line display animation logic
    useEffect(() => {
        setVisibleCount(0);
        if (!shots.length) return;
        let i = 0;
        const interval = setInterval(() => {
            if (i <= shots.length) {
                setVisibleCount(i);
                i++;
            } else {
                clearInterval(interval);
            }
        }, 120); // 100ms delay + 20ms slack
        return () => clearInterval(interval);
    }, [shots]);



    // Calculate line vector endpoints
    return (
        <div style={{ position: 'relative' }}>

            <style>{`
                @keyframes burst {
                    0% { transform: scale(0); opacity: 1; }
                    80% { transform: scale(3); opacity: 0.5; }
                    100% { transform: scale(1); opacity: 0; }
                }
                .burst-circle {
                    animation: burst 0.4s ease-out forwards;
                }
                .svg-ball-line {
                    stroke-dasharray: 200;
                    stroke-dashoffset: 200;
                    animation: drawPath 0.3s ease-out forwards;
                }
                .svg-ball-line-6 {
                    stroke-dasharray: 250;
                    stroke-dashoffset: 250;
                    animation: drawCurve 0.6s ease-out forwards;
                }
                @keyframes drawPath { to { stroke-dashoffset: 0; } }
                @keyframes drawCurve { to { stroke-dashoffset: 0; } }
            `}</style>

            <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                {/* Wagon Wheel */}
                <div 
                    ref={containerRef}
                    style={{
                        position: 'relative',
                        width: '260px',
                        height: '260px'
                    }}
                >
                    <div style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative'
                    }}>
                        <svg viewBox="0 0 300 300" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                            <defs>
                                <radialGradient id="grass" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#2d7a2d" />
                                    <stop offset="70%" stopColor="#1a5c1a" />
                                </radialGradient>
                                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                    <stop offset="0%" stopColor="#ef4444" />
                                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f59e0b" />
                                </filter>
                            </defs>

                            {/* Outer Boundary */}
                            <circle cx="150" cy="150" r="145" fill="url(#grass)" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeDasharray="4 2" />
                            {/* Inner 30 yard circle */}
                            <circle cx="150" cy="150" r="100" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="3 3" />
                            <circle cx="150" cy="150" r="50" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />

                            {/* Pitch */}
                            <rect x="143" y="125" width="14" height="50" rx="2" fill="#d4a373" opacity="0.9" />

                            {/* Segment Divisions */}
                            {[0, 40, 80, 100, 140, 180, 220, 260, 280, 320].map(angle => (
                                <line 
                                    key={angle} 
                                    x1="150" y1="150" 
                                    x2={150 + 145 * Math.cos(angle * Math.PI / 180)} 
                                    y2={150 + 145 * Math.sin(angle * Math.PI / 180)} 
                                    stroke="rgba(255,255,255,0.12)" strokeWidth="1" 
                                />
                            ))}

                            {/* Labels */}
                            {Object.entries(zoneAngles).map(([name, angle]) => (
                                <text
                                    key={name}
                                    transform={`translate(${150 + 130 * Math.cos(angle * Math.PI / 180)}, ${150 + 130 * Math.sin(angle * Math.PI / 180)})`}
                                    textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="6" fontWeight="bold" y="2"
                                >
                                    {name.toUpperCase()}
                                </text>
                            ))}

                            {/* Shot Paths Render */}
                            {shots.slice(0, visibleCount).map((shot, i) => {
                                const runs = shot.runs !== undefined ? shot.runs : (shot.r || 0);
                                if (runs === 0) return null;

                                const zName = shot.zone || shot.z;
                                const baseAngle = zoneAngles[zName] || 0;
                                const isOff = offSideZones.includes(zName);
                                
                                if (wagonSide === 'Off' && !isOff) return null;
                                if (wagonSide === 'Leg' && isOff) return null;

                                // Base endpoint
                                const jitter = (Math.sin(i * 123.45) * 12);
                                const rad = ((baseAngle + jitter) * Math.PI) / 180;
                                const len = Math.min(145, 50 + (runs * 15) + (Math.cos(i * 67.89) * 10)); // Landing line lengths
                                const endX = 150 + len * Math.cos(rad);
                                const endY = 150 + len * Math.sin(rad);

                                // 6s Curved path
                                if (runs === 6) {
                                    const midX = 150 + (len / 2) * Math.cos(rad);
                                    const midY = 150 + (len / 2) * Math.sin(rad);
                                    const ctrlX = midX;
                                    const ctrlY = midY - 60; // Curved upwards on Y scalar height

                                    return (
                                        <g key={i}>
                                            <path 
                                                id={`curve-${i}`}
                                                d={`M 150 150 Q ${ctrlX} ${ctrlY} ${endX} ${endY}`}
                                                fill="none" stroke={runColors[6]} strokeWidth="3"
                                                strokeLinecap="round" filter="url(#glow)"
                                                className="svg-ball-line-6"
                                            />
                                            <circle r="2.5" fill="#f59e0b">
                                                <animateMotion dur="0.6s" repeatCount="1" fill="freeze">
                                                    <mpath href={`#curve-${i}`} />
                                                </animateMotion>
                                            </circle>
                                            <circle cx={endX} cy={endY} r="3" fill="#ffffff" />
                                        </g>
                                    );
                                }

                                // 4s with burst
                                const isFour = runs === 4;
                                return (
                                    <g key={i}>
                                        <line
                                            x1="150" y1="150" x2={endX} y2={endY}
                                            stroke={runColors[runs] || 'white'}
                                            strokeWidth={isFour ? "2.5" : "1.5"}
                                            strokeOpacity="0.85" strokeLinecap="round"
                                            className="svg-ball-line"
                                        />
                                        {isFour && (
                                            <circle cx={endX} cy={endY} r="1.5" fill="#eab308">
                                                <animate attributeName="r" from="1.5" to="6" dur="0.4s" begin="0.25s" fill="freeze" />
                                                <animate attributeName="opacity" from="1" to="0" dur="0.4s" begin="0.25s" fill="freeze" />
                                            </circle>
                                        )}
                                        <circle cx={endX} cy={endY} r="1.5" fill={runColors[runs]} />
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>

                {/* Optional Profile Stats Panel Integration */}
                {showStats && (
                    <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div
                            onClick={() => setWagonSide(wagonSide === 'Off' ? 'All' : 'Off')}
                            style={{
                                padding: '16px', borderRadius: '20px', cursor: 'pointer',
                                backgroundColor: wagonSide === 'Off' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                                border: `1.5px solid ${wagonSide === 'Off' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.08)'}`,
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                color: 'white'
                            }}
                        >
                            <div style={{ fontSize: '11px', color: wagonSide === 'Off' ? '#60a5fa' : '#94a3b8', fontWeight: '800' }}>{offPct}% OFF SIDE</div>
                            <div style={{ fontSize: '24px', fontWeight: '900' }}>{counts.offRuns} <span style={{ fontSize: '13px', color: '#64748b' }}>Runs</span></div>
                        </div>

                        <div
                            onClick={() => setWagonSide(wagonSide === 'Leg' ? 'All' : 'Leg')}
                            style={{
                                padding: '16px', borderRadius: '20px', cursor: 'pointer',
                                backgroundColor: wagonSide === 'Leg' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.03)',
                                border: `1.5px solid ${wagonSide === 'Leg' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.08)'}`,
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                color: 'white'
                            }}
                        >
                            <div style={{ fontSize: '11px', color: wagonSide === 'Leg' ? '#f87171' : '#94a3b8', fontWeight: '800' }}>{legPct}% LEG SIDE</div>
                            <div style={{ fontSize: '24px', fontWeight: '900' }}>{counts.legRuns} <span style={{ fontSize: '13px', color: '#64748b' }}>Runs</span></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WagonWheelVisuals;
