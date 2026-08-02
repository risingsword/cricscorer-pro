import React from 'react';

const OverTimeline = ({ thisOver }) => {
    return (
        <div style={{ padding: '0 4px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {thisOver.map((ball, idx) => {
                    let bg = '#ffffff';
                    let color = '#1e293b';
                    let border = '1.5px solid #f1f5f9';

                    if (ball.isWicket) {
                        bg = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
                        color = 'white';
                        border = 'none';
                    } else if (ball.runs === 4) {
                        bg = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                        color = 'white';
                        border = 'none';
                    } else if (ball.runs === 6) {
                        bg = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                        color = 'white';
                        border = 'none';
                    }

                    return (
                        <div key={idx} style={{
                            flexShrink: 0,
                            minWidth: '42px',
                            height: '42px',
                            borderRadius: '14px',
                            border,
                            background: bg,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '15px',
                            fontWeight: '900',
                            color,
                            boxShadow: ball.isWicket || ball.runs === 4 || ball.runs === 6 ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.02)'
                        }}>
                            {ball.isWicket ? 'W' : (ball.isWide ? `Wd` : (ball.isNoBall ? `Nb` : ball.runs))}
                            {(ball.isWide || ball.isNoBall) && ball.runs > 0 && <span style={{ fontSize: '9px', marginTop: '-2px' }}>+{ball.runs}</span>}
                        </div>
                    );
                })}
                {thisOver.length === 0 && <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', padding: '10px 0' }}>Over starting...</div>}
            </div>
        </div>
    );
};

export default React.memo(OverTimeline);
