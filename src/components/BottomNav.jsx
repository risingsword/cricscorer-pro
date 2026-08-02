import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { History, BarChart2, Home, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { triggerHaptic } from '../utils/haptics';

const TABS = [
    { to: '/home',      Icon: Home,      label: 'Matches'   },
    { to: '/players',   Icon: Users,     label: 'Players'   },
    { to: '/history',   Icon: History,   label: 'History'   },
    { to: '/analytics', Icon: BarChart2, label: 'Analytics' },
];

const BottomNav = () => {
    const location = useLocation();
    
    // Find active tab index
    const activeIndex = Math.max(0, TABS.findIndex(tab => location.pathname.startsWith(tab.to)));

    return (
        <div className="bottom-nav">
            {TABS.map(({ to, Icon, label }, index) => {
                const isActive = activeIndex === index;
                return (
                    <NavLink
                        key={to}
                        to={to}
                        onClick={() => {
                            triggerHaptic('light');
                            if (to !== '/history' || location.pathname !== '/history') {
                                sessionStorage.removeItem('historyScrollPos');
                            }
                        }}
                        className={`nav-item${isActive ? ' active' : ''}`}
                        style={{ position: 'relative', textDecoration: 'none', flex: 1, display: 'flex', justifyContent: 'center' }}
                    >
                        <motion.div
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', position: 'relative' }}
                            whileTap={{ scale: 0.88 }}
                            transition={{ type: "spring", stiffness: 450, damping: 25 }}
                        >
                            {/* Sliding active pill indicator background */}
                            {isActive && (
                                <motion.div
                                    layoutId="activeTabPill"
                                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                                    style={{
                                        position: 'absolute',
                                        top: '8px',
                                        width: '46px',
                                        height: '32px',
                                        borderRadius: '12px',
                                        background: 'rgba(67,56,202,0.1)',
                                        zIndex: 0,
                                    }}
                                />
                            )}

                            {/* Icon */}
                            <motion.span
                                animate={{ scale: isActive ? 1.15 : 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                                style={{
                                    position: 'relative',
                                    zIndex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    filter: isActive
                                        ? 'drop-shadow(0 2px 5px rgba(67,56,202,0.4))'
                                        : 'none',
                                }}
                            >
                                <Icon
                                    size={22}
                                    strokeWidth={isActive ? 2.5 : 1.8}
                                    color={isActive ? '#4338ca' : '#94a3b8'}
                                />
                            </motion.span>

                            {/* Label */}
                            <span style={{
                                fontSize: '9.5px',
                                fontWeight: isActive ? '900' : '700',
                                color: isActive ? '#4338ca' : '#94a3b8',
                                letterSpacing: '0.4px',
                                textTransform: 'uppercase',
                                position: 'relative',
                                zIndex: 1,
                                transition: 'color 0.22s ease, font-weight 0.22s ease',
                                marginTop: '1px',
                            }}>
                                {label}
                            </span>

                            {/* Active dot sliding smoothly under tab */}
                            {isActive && (
                                <motion.span
                                    layoutId="activeTabDot"
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    style={{
                                        position: 'absolute',
                                        bottom: '5px',
                                        width: '4px',
                                        height: '4px',
                                        borderRadius: '50%',
                                        background: '#4338ca',
                                        boxShadow: '0 0 6px rgba(67,56,202,0.6)',
                                        zIndex: 1,
                                    }}
                                />
                            )}
                        </motion.div>
                    </NavLink>
                );
            })}
        </div>
    );
};

export default BottomNav;
