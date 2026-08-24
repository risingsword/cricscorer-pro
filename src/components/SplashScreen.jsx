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
        /* Retimed for a ~950ms launch (was 1.25, which made the bounce alone
           run ~1.1s and the whole sequence ~2.7s). The full bounce still plays
           out — same fall, same four damped rebounds — just faster, which
           reads as snappy rather than languid.
           At 812px tall: 12 frames to first impact, then rebounds of ~9.1,
           ~3.5 and ~1.3 frames before |vy| drops under the 3.5 settle
           threshold — ~27 frames, ~450ms. Leaves room for the title reveal
           and fade-out to finish before App.jsx unmounts us. */
        const gravity = 8.0;
        const groundY = window.innerHeight * 0.52; // ground position
        const damping = 0.38; // bounce damping
        let rotation = 0;
        let frameId;

        const loop = () => {
            vy += gravity;
            y += vy;
            rotation += Math.abs(vy) * 0.6;

            if (y >= groundY) {
                y = groundY;

                /* Settle when the rebound is too small to lift the ball clear
                   of the ground for even one frame. Deriving it from gravity
                   matters: the old test was a hardcoded `Math.abs(vy) < 3.5`,
                   but at rest the ground-check velocity converges to
                   gravity / (1 + damping), so any gravity above ~4.8 made that
                   test unsatisfiable — the ball jittered on the ground forever
                   and the title reveal it gates never fired. */
                const rebound = Math.abs(vy) * damping;

                if (rebound < gravity) {
                    ball.style.transform = `translateY(${y}px) translateX(-50%) rotate(${rotation}deg)`;

                    setTimeout(() => {
                        setRevealText(true);
                        setTimeout(() => setRevealSubtitle(true), 50);
                    }, 20);

                    cancelAnimationFrame(frameId);
                    return;
                }

                vy = -rebound;
            }

            ball.style.transform = `translateY(${y}px) translateX(-50%) rotate(${rotation}deg)`;

            if (shadow) {
                const distance = groundY - y;
                const ratio = Math.max(0, 1 - (distance / 400)); // normalized proximity
                const shadowWidth = 20 + ratio * 40;
                const shadowOpacity = 0.1 + ratio * 0.4;

                /* scaleX off a fixed 60px base rather than writing `width`.
                   Setting width here forced a layout on every frame of the
                   launch animation — the one moment the main thread is already
                   busy booting the app. transform is compositor-only. */
                shadow.style.transform = `translateX(-50%) scaleX(${shadowWidth / 60})`;
                shadow.style.opacity = `${shadowOpacity}`;
            }

            frameId = requestAnimationFrame(loop);
        };

        /* One frame, not 400ms. The old delay was dead time at the single
           moment the user is already waiting on the app to boot. */
        const startTimer = setTimeout(() => {
            frameId = requestAnimationFrame(loop);
        }, 16);

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
                    /* Measured, not guessed: the ball settles ~520ms after
                       mount and the title finishes revealing ~740ms, so the
                       fade waits until 820ms to give the brand ~100ms at full
                       opacity, then runs 180ms. Previously this was delayed
                       2.8s — tuned to the old 3.3s timer — so once the splash
                       was shortened the fade never fired at all and the splash
                       vanished in a hard cut. App.jsx unmounts at 1010ms. */
                    animation: fade-out 0.18s cubic-bezier(0.4, 0, 1, 1) forwards 0.82s;
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
                    /* Fixed base width; the rAF loop scales it with scaleX.
                       No transition here on purpose — the loop writes transform
                       and opacity every frame, so a CSS transition would just
                       fight it with a fresh 100ms interpolation each frame. */
                    width: 60px;
                    background: radial-gradient(ellipse, rgba(0,0,0,0.5), transparent);
                    border-radius: 50%;
                    left: 50%;
                    transform: translateX(-50%) scaleX(0.333);
                    bottom: 46%;
                    pointer-events: none;
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
                    transform: translate3d(0, 24px, 0);
                    transition: opacity 0.22s cubic-bezier(0.32, 0.72, 0, 1),
                                transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
                }

                .text-container.show {
                    opacity: 1;
                    transform: translate3d(0, 0, 0);
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
                    transition: opacity 0.16s ease-out;
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
