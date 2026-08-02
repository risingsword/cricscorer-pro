import React from 'react';

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  
  componentDidCatch(error, info) {
    // Log the full error + React component stack to console.
    // On Android this is visible in Logcat (adb logcat | grep -i chrom).
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', info?.componentStack);

    // Persist a richer debug snapshot to localStorage for post-crash inspection.
    try {
      localStorage.setItem('cricscorer_last_error', JSON.stringify({
        message: error?.message || String(error),
        stack: error?.stack || '',
        componentStack: info?.componentStack || '',
        time: Date.now(),
        route: window?.location?.pathname || ''
      }));
    } catch (_) { /* localStorage full — ignore */ }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#1a1a2e', color: 'white',
          padding: '20px', textAlign: 'center'
        }}>
          <h2 style={{ fontSize: '28px', fontWeight: '900', marginBottom: '16px', letterSpacing: '-0.5px' }}>⚠️ Something went wrong!</h2>
          <p style={{ opacity: 0.8, fontSize: '16px', fontWeight: '500', marginBottom: '32px', maxWidth: '300px', lineHeight: '1.6' }}>
            We encountered an unexpected error. Don't worry, your match data is likely safe.
          </p>
          <button 
            onClick={() => {
              this.setState({ hasError: false })
              window.location.reload()
            }}
            style={{
              background: 'linear-gradient(135deg, #e94560 0%, #c62828 100%)', 
              color: 'white',
              border: 'none', padding: '18px 36px',
              borderRadius: '18px', fontSize: '16px',
              fontWeight: '800',
              cursor: 'pointer', marginBottom: '16px',
              boxShadow: '0 10px 25px rgba(233, 69, 96, 0.4)',
              width: '100%', maxWidth: '280px'
            }}
          >
            Restart App
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('cricscorer_live_match')
              this.setState({ hasError: false })
              window.location.href = '/'
            }}
            style={{
              background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)', padding: '12px 24px',
              borderRadius: '14px', fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              width: '100%', maxWidth: '280px'
            }}
          >
            Go to Home Screen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary;
