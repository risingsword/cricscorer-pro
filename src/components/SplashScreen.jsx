/* eslint-disable react/no-unknown-property */
import React, { useState, useEffect, useRef } from 'react';

const SplashScreen = () => {
    const [showText, setRevealText] = useState(false);
    const [revealSubtitle, setRevealSubtitle] = useState(false);

    const ballRef = useRef(null);
    const shadowRef = useRef(null);

    useEffect(() => {
        const ball = ballRef.current;
        const shadow = shadowRef.current;
        if (!ball) return;

        let y = -(window.innerHeight * 0.15 + 80); // starting position safely above screen
        let vy = 0;           // vertical velocity
        const gravity = 1.25;  // gravity constant
        const groundY = window.innerHeight * 0.52; // ground position
        const damping = 0.38; // bounce damping
        let rotation = 0;
        let settled = false;
        let frameId;

        const loop = () => {
            vy += gravity;
            y += vy;
            rotation += Math.abs(vy) * 0.6;

            if (y >= groundY) {
                y = groundY;
                
                if (Math.abs(vy) < 3.5) {
                    settled = true;
                    ball.style.transform = `translateY(${y}px) translateX(-50%) rotate(${rotation}deg)`;
                    
                    setTimeout(() => {
                        setRevealText(true);
                        setTimeout(() => setRevealSubtitle(true), 400);
                    }, 200);
                    
                    cancelAnimationFrame(frameId);
                    return;
                }
                
                vy = -Math.abs(vy) * damping;
            }

            ball.style.transform = `translateY(${y}px) translateX(-50%) rotate(${rotation}deg)`;
            
            if (shadow) {
                const distance = groundY - y;
                const ratio = Math.max(0, 1 - (distance / 400)); // normalized proximity
                const shadowWidth = 20 + ratio * 40; 
                const shadowOpacity = 0.1 + ratio * 0.4;
                
                shadow.style.width = `${shadowWidth}px`;
                shadow.style.opacity = `${shadowOpacity}`;
            }

            frameId = requestAnimationFrame(loop);
        };

        const startTimer = setTimeout(() => {
            frameId = requestAnimationFrame(loop);
        }, 400);

        return () => {
            clearTimeout(startTimer);
            cancelAnimationFrame(frameId);
        };
    }, []);

    return (
        <div className="splash-wrap">
            <style>{`
                .splash-wrap {
                    position: fixed;
                    inset: 0;
                    background: radial-gradient(ellipse 100% 55% at 50% 100%, #0d3d0d 0%, #0a2d0a 40%, #071f07 60%, #1a1a2e 75%, #1a1a2e 100%);
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    animation: fade-out 0.5s cubic-bezier(0.55, 0.085, 0.68, 0.53) forwards 2.8s;
                }
                
                @keyframes fade-out {
                    to { opacity: 0; transform: scale(1.03); visibility: hidden; }
                }

                .pitch {
                    position: absolute;
                    width: 70px;
                    height: 180px;
                    background: linear-gradient(#8B7355 0%, #A0835A 50%, #8B7355 100%);
                    opacity: 0.25;
                    border-radius: 4px;
                    left: 50%;
                    transform: translateX(-50%);
                    bottom: 22%;
                }

                .boundary-rope {
                    position: absolute;
                    width: 110%;
                    height: 240px;
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 50%;
                    bottom: 110px;
                    left: 50%;
                    transform: translateX(-50%);
                }

                .particle {
                    position: absolute;
                    width: 3px;
                    height: 3px;
                    border-radius: 50%;
                    background-color: rgba(233, 69, 96, 0.4);
                    animation: float-around 3s ease-in-out infinite;
                }
                @keyframes float-around {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }

                .ball-shadow {
                    position: absolute;
                    height: 8px;
                    background: radial-gradient(ellipse, rgba(0,0,0,0.5), transparent);
                    border-radius: 50%;
                    left: 50%;
                    transform: translateX(-50%);
                    bottom: 46%; 
                    pointer-events: none;
                    transition: width 100ms ease-out, opacity 100ms ease-out;
                    opacity: 0;
                }

                .cricket-ball {
                    position: absolute;
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: radial-gradient(circle at 35% 30%, #ff5555 0%, #cc1111 45%, #7a0000 100%);
                    box-shadow: inset -10px -8px 20px rgba(0,0,0,0.7), 
                                inset 4px 4px 10px rgba(255,150,150,0.2), 
                                0 0 20px rgba(180,0,0,0.25), 
                                0 6px 15px rgba(0,0,0,0.35);
                    top: 0;
                    left: 50%;
                    transform: translateX(-50%);
                }

                .seam-line {
                    position: absolute;
                    width: 100%;
                    height: 80px;
                    top: 6px;
                    border-top: 1.5px solid rgba(255,255,255,0.35);
                    border-radius: 50%;
                    transform: rotate(15deg);
                }

                .text-container {
                    position: absolute;
                    bottom: 23%;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    opacity: 0;
                    transform: translateY(30px);
                    transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
                }

                .text-container.show {
                    opacity: 1;
                    transform: translateY(0);
                }

                .char-row {
                    font-size: 24px;
                    font-weight: 900;
                    letter-spacing: 2px;
                }

                .char.white { color: white; }
                .char.red { color: #e94560; }

                .subtitle {
                    margin-top: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    color: rgba(255,255,255,0.6);
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    opacity: 0;
                    transition: opacity 0.4s ease-out;
                }

                .subtitle.show {
                    opacity: 1;
                }
            `}</style>
            
            <div className="pitch"></div>
            <div className="boundary-rope"></div>

            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="particle" style={{
                    top: `${23 + i * 11}%`,
                    left: `${15 + (i * 19) % 70}%`,
                    animationDelay: `${i * 0.4}s`,
                }}></div>
            ))}

            <div ref={shadowRef} className="ball-shadow" />

            <div ref={ballRef} className="cricket-ball">
                <div className="seam-line"></div>
            </div>

            <div className={`text-container ${showText ? 'show' : ''}`}>
                <div className="char-row">
                    <span className="char white">CRIC</span>
                    <span className="char red">SCORER PRO</span>
                </div>
                <div className={`subtitle ${revealSubtitle ? 'show' : ''}`}>Live Cricket Scoring</div>
            </div>
        </div>
    );
};

export default SplashScreen;
