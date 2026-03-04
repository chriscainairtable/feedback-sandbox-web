// ErrorBoundary.jsx — drop into src/components/ of any Vercel app
// Catches unhandled React errors and shows a readable message instead of a blank screen.
// Must be a class component — hooks can't catch render errors.
// Usage:
//   <ErrorBoundary>
//     <App />
//   </ErrorBoundary>

import React from 'react';

export default class ErrorBoundary extends React.Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Log for debugging — won't be visible on mobile but shows in Vercel logs if server-side
        console.error('ErrorBoundary caught:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{
                    minHeight: '100vh',
                    background: '#030712',
                    color: '#f9fafb',
                    padding: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{ maxWidth: '480px', width: '100%' }}>
                        <p style={{ color: '#9ca3af', fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
                            Something went wrong
                        </p>
                        <pre style={{
                            background: '#111827',
                            border: '1px solid #1f2937',
                            borderRadius: '0.5rem',
                            padding: '1rem',
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}>
                            {this.state.error.message}
                        </pre>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                marginTop: '1.5rem',
                                background: '#fff',
                                color: '#030712',
                                border: 'none',
                                borderRadius: '0.5rem',
                                padding: '0.6rem 1.25rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            Reload →
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
