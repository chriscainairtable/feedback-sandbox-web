// PasscodeGate.jsx — drop into src/components/ of any Vercel app
// No external dependencies beyond React.
// Usage:
//   <PasscodeGate appName="My App" passcode="airtable">
//     <App />
//   </PasscodeGate>

import { useState, useEffect, useRef } from 'react';

const SHAKE_KEYFRAME = `
@keyframes passcode-shake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-8px); }
    40%       { transform: translateX(8px); }
    60%       { transform: translateX(-5px); }
    80%       { transform: translateX(5px); }
}
.passcode-shaking {
    animation: passcode-shake 0.4s ease-in-out;
}
`;

export default function PasscodeGate({
    passcode = 'airtable',
    appName,
    logo,
    children,
}) {
    const [authenticated, setAuthenticated] = useState(false);
    const [value, setValue] = useState('');
    const [shaking, setShaking] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (sessionStorage.getItem('app_authenticated') === 'true') {
            setAuthenticated(true);
        }
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (value === passcode) {
            sessionStorage.setItem('app_authenticated', 'true');
            setAuthenticated(true);
        } else {
            setShaking(true);
            setValue('');
            setTimeout(() => setShaking(false), 400);
            inputRef.current?.focus();
        }
    };

    if (authenticated) return children;

    return (
        <>
            <style>{SHAKE_KEYFRAME}</style>
            <div style={{
                minHeight: '100vh',
                background: '#030712',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
            }}>
                <div style={{ maxWidth: '320px', width: '100%', textAlign: 'center' }}>
                    {logo && (
                        <div style={{ marginBottom: '1.5rem' }}>{logo}</div>
                    )}
                    {appName && (
                        <p style={{
                            color: '#6b7280',
                            fontSize: '0.75rem',
                            fontFamily: 'ui-monospace, monospace',
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                            margin: '0 0 2rem',
                        }}>
                            {appName}
                        </p>
                    )}
                    <form onSubmit={handleSubmit}>
                        <input
                            ref={inputRef}
                            type="password"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            placeholder="Passcode"
                            autoFocus
                            className={shaking ? 'passcode-shaking' : ''}
                            style={{
                                display: 'block',
                                width: '100%',
                                boxSizing: 'border-box',
                                background: '#111827',
                                border: `1px solid ${shaking ? '#ef4444' : '#1f2937'}`,
                                borderRadius: '0.5rem',
                                padding: '0.75rem 1rem',
                                color: '#f9fafb',
                                fontSize: '1rem',
                                outline: 'none',
                                textAlign: 'center',
                                letterSpacing: '0.25em',
                                marginBottom: '0.75rem',
                                fontFamily: 'inherit',
                                transition: 'border-color 0.15s',
                            }}
                        />
                        <button
                            type="submit"
                            style={{
                                display: 'block',
                                width: '100%',
                                background: '#ffffff',
                                color: '#030712',
                                border: 'none',
                                borderRadius: '0.5rem',
                                padding: '0.75rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                cursor: value ? 'pointer' : 'default',
                                opacity: value ? 1 : 0.4,
                                fontFamily: 'inherit',
                                transition: 'opacity 0.15s',
                            }}
                        >
                            Continue →
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
