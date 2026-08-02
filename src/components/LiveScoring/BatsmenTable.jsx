import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const StatCell = ({ value, isBold = false, align = 'center', fontSize = '12px', color = '#94a3b8' }) => {
    return (
        <td style={{ textAlign: align, fontSize, fontWeight: isBold ? '900' : '600', color, position: 'relative' }}>
            <AnimatePresence mode="popLayout">
                <motion.span
                    key={value}
                    initial={{ opacity: 0.4, scale: 1.25, color: '#4338ca' }}
                    animate={{ opacity: 1, scale: 1, color }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    style={{ display: 'inline-block' }}
                >
                    {value}
                </motion.span>
            </AnimatePresence>
        </td>
    );
};

const BatsmenTable = ({ striker, nonStriker, onNameClick }) => {
    return (
        <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '8px', borderRadius: '16px', border: '1.5px solid #f1f5f9' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <th style={{ textAlign: 'left', fontSize: '10px', fontWeight: '800', padding: '6px 12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Batsman</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 4px', color: '#94a3b8', textTransform: 'uppercase' }}>R</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 4px', color: '#94a3b8', textTransform: 'uppercase' }}>B</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 4px', color: '#94a3b8', textTransform: 'uppercase' }}>4s</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 4px', color: '#94a3b8', textTransform: 'uppercase' }}>6s</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 12px', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'right' }}>SR</th>
                    </tr>
                </thead>
                <tbody>
                    {[striker, nonStriker].map((bat, idx) => bat && (
                        <tr key={idx} style={{
                            backgroundColor: bat.isStriker ? 'rgba(30, 27, 75, 0.02)' : 'transparent',
                            borderBottom: idx === 0 ? '1px solid #f1f5f9' : 'none'
                        }}>
                            <td style={{ padding: '8px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {bat.isStriker && <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>}
                                    <span 
                                        onClick={() => onNameClick && onNameClick(bat.name, 'batsman')}
                                        style={{ fontSize: '13px', fontWeight: bat.isStriker ? '900' : '600', color: bat.isStriker ? '#1e1b4b' : '#475569', cursor: 'pointer' }}
                                    >
                                        {bat.name}
                                    </span>
                                </div>
                            </td>
                            <StatCell value={bat.runs} isBold={true} fontSize="14px" color="#1e1b4b" />
                            <StatCell value={bat.balls} color="#94a3b8" />
                            <StatCell value={bat.fours} color="#94a3b8" />
                            <StatCell value={bat.sixes} color="#94a3b8" />
                            <StatCell value={bat.balls > 0 ? (((bat.runs || 0) / (bat.balls || 1)) * 100).toFixed(1) : '0.0'} align="right" isBold={true} color="#64748b" />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default React.memo(BatsmenTable);
