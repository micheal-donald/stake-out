// pages/LandingPage.jsx
// Public landing page - no login required
// Showcases the crash game and drives conversions

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const LandingPage = () => {
    // Animated demo multiplier state
    const [demoMultiplier, setDemoMultiplier] = useState(1.00);
    const [demoState, setDemoState] = useState('rising'); // 'rising' | 'crashed' | 'waiting'
    const [demoRound, setDemoRound] = useState(1);
    const animationRef = useRef(null);
    const crashPointRef = useRef(null);

    // Simulated live stats
    const [liveStats, setLiveStats] = useState({
        playersOnline: 2847,
        totalPaidOut: 45000000,
        lastBigWin: { user: 'Luck***r', amount: 52400, multiplier: 12.4 }
    });

    // Demo multiplier animation
    useEffect(() => {
        if (demoState === 'rising') {
            // Generate random crash point between 1.2 and 15
            if (!crashPointRef.current) {
                crashPointRef.current = 1.2 + Math.random() * 13.8;
            }

            const animate = () => {
                setDemoMultiplier(prev => {
                    const growth = 0.02 + (prev * 0.01); // Exponential-ish growth
                    const next = prev + growth;

                    if (next >= crashPointRef.current) {
                        setDemoState('crashed');
                        return crashPointRef.current;
                    }
                    return next;
                });
                animationRef.current = requestAnimationFrame(animate);
            };

            animationRef.current = requestAnimationFrame(animate);
        } else if (demoState === 'crashed') {
            // Wait 2s then restart
            const timeout = setTimeout(() => {
                setDemoMultiplier(1.00);
                crashPointRef.current = null;
                setDemoRound(r => r + 1);
                setDemoState('waiting');
            }, 2000);
            return () => clearTimeout(timeout);
        } else if (demoState === 'waiting') {
            // Wait 1.5s then start rising again
            const timeout = setTimeout(() => {
                setDemoState('rising');
            }, 1500);
            return () => clearTimeout(timeout);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [demoState]);

    // Get multiplier intensity class
    const getMultiplierClass = () => {
        if (demoState === 'crashed') return 'crashed';
        if (demoMultiplier >= 10) return 'extreme';
        if (demoMultiplier >= 5) return 'high';
        if (demoMultiplier >= 2) return 'medium';
        return '';
    };

    return (
        <div className="landing-page">
            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">
                    <h1 className="hero-title">
                        <span className="brand-icon">🚀</span>
                        Battle Arena
                    </h1>
                    <p className="hero-tagline">
                        Watch the multiplier. Cash out before it crashes.
                    </p>

                    {/* Animated Demo Multiplier */}
                    <div className={`demo-multiplier-container ${getMultiplierClass()}`}>
                        <div className={`demo-multiplier ${getMultiplierClass()}`}>
                            {demoMultiplier.toFixed(2)}x
                        </div>
                        {demoState === 'waiting' && (
                            <div className="demo-status waiting">Starting round {demoRound + 1}...</div>
                        )}
                        {demoState === 'rising' && (
                            <div className="demo-status rising">🚀 RISING</div>
                        )}
                        {demoState === 'crashed' && (
                            <div className="demo-status crashed">💥 CRASHED @ {demoMultiplier.toFixed(2)}x</div>
                        )}
                    </div>

                    {/* CTAs */}
                    <div className="hero-ctas">
                        <Link to="/register" className="cta-primary">
                            🎮 Play Now
                        </Link>
                        <Link to="/login" className="cta-secondary">
                            Sign In
                        </Link>
                    </div>

                    {/* Trust Signals */}
                    <div className="trust-signals">
                        <div className="trust-item">
                            <span className="trust-icon">🔒</span>
                            <span className="trust-text">Provably Fair</span>
                        </div>
                        <div className="trust-item">
                            <span className="trust-icon">⚡</span>
                            <span className="trust-text">Instant Payouts</span>
                        </div>
                        <div className="trust-item">
                            <span className="trust-icon">📱</span>
                            <span className="trust-text">Mobile Ready</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Live Stats Section */}
            <section className="stats-section">
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-value">{liveStats.playersOnline.toLocaleString()}</div>
                        <div className="stat-label">Players Online</div>
                        <div className="live-dot"></div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">KES {(liveStats.totalPaidOut / 1000000).toFixed(1)}M+</div>
                        <div className="stat-label">Total Paid Out</div>
                    </div>
                    <div className="stat-card highlight">
                        <div className="stat-value">{liveStats.lastBigWin.multiplier}x</div>
                        <div className="stat-label">
                            🎉 {liveStats.lastBigWin.user} won {liveStats.lastBigWin.amount.toLocaleString()} KES
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="how-it-works">
                <h2>How It Works</h2>
                <div className="steps-grid">
                    <div className="step">
                        <div className="step-number">1</div>
                        <div className="step-icon">💰</div>
                        <h3>Place Your Bet</h3>
                        <p>Choose your amount before the round starts</p>
                    </div>
                    <div className="step">
                        <div className="step-number">2</div>
                        <div className="step-icon">📈</div>
                        <h3>Watch It Rise</h3>
                        <p>The multiplier grows from 1.00x upward</p>
                    </div>
                    <div className="step">
                        <div className="step-number">3</div>
                        <div className="step-icon">🎯</div>
                        <h3>Cash Out In Time</h3>
                        <p>Hit cash out before it crashes to win!</p>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="final-cta">
                <h2>Ready to test your nerve?</h2>
                <p>Join thousands of players in the arena</p>
                <Link to="/register" className="cta-primary large">
                    Create Account
                </Link>
                <p className="login-link">
                    Already have an account? <Link to="/login">Sign In</Link>
                </p>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="footer-content">
                    <div className="footer-links">
                        <Link to="/terms">Terms of Service</Link>
                        <Link to="/privacy">Privacy Policy</Link>
                        <Link to="/responsible-gambling">Responsible Gambling</Link>
                    </div>
                    <p className="copyright">
                        © {new Date().getFullYear()} Akiba Software Holdings. All rights reserved.
                    </p>
                    <p className="gambling-warning">
                        ⚠️ 18+ Only. Gambling involves risk. Play responsibly.
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
