import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const StatCell = ({ value, isBold = false, align = 'center', fontSize = '12px', color = '#64748b' }) => {
    return (
        <td style={{ textAlign: align, fontSize, fontWeight: isBold ? '900' : '600', color, position: 'relative' }}>
            <AnimatePresence mode="popLayout">
                <motion.span
                    key={value}
                    initial={{ opacity: 0.4, scale: 1.25, color: '#ef4444' }}
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

const BowlerTable = ({ currentBowler, onNameClick }) => {
    const er = currentBowler && currentBowler.overs > 0 
        ? ((currentBowler.runs || 0) / (Math.floor(currentBowler.overs) + ((currentBowler.overs % 1 * 10) / 6) || 1)).toFixed(2) 
        : '0.00';

    return (
        <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '8px', borderRadius: '16px', border: '1.5px solid #f1f5f9' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <th style={{ textAlign: 'left', fontSize: '10px', fontWeight: '800', padding: '6px 12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bowler</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 4px', color: '#94a3b8', textTransform: 'uppercase' }}>O</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 4px', color: '#94a3b8', textTransform: 'uppercase' }}>M</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 4px', color: '#94a3b8', textTransform: 'uppercase' }}>R</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 4px', color: '#94a3b8', textTransform: 'uppercase' }}>W</th>
                        <th style={{ fontSize: '10px', fontWeight: '800', padding: '6px 12px', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'right' }}>ER</th>
                    </tr>
                </thead>
                <tbody>
                    {currentBowler && (
                        <tr>
                            <td style={{ padding: '8px 12px' }}>
                                <div 
                                    onClick={() => onNameClick && onNameClick(currentBowler.name, 'bowler')}
                                    style={{ fontSize: '13px', fontWeight: '900', color: '#ef4444', cursor: 'pointer' }}
                                >
                                    {currentBowler.name}
                                </div>
                            </td>
                            <StatCell value={currentBowler.overs} isBold={true} fontSize="14px" color="#1e1b4b" />
                            <StatCell value={currentBowler.maidens} color="#64748b" />
                            <StatCell value={currentBowler.runs} color="#64748b" />
                            <StatCell value={currentBowler.wickets} isBold={true} fontSize="14px" color="#1e1b4b" />
                            <StatCell value={er} align="right" isBold={true} color="#64748b" />
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default React.memo(BowlerTable);
