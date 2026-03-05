import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createRecord, updateRecord, deleteRecord, listRecords } from './airtable.js';
import { getFieldValue, matchesRecordId } from './utils/airtable.js';

// ─── Config ────────────────────────────────────────────────────────────────────
const FEEDBACK_TABLE = 'Feedback';
const PLANS_TABLE = 'Feedback Plans';
const EXTENSION_TARGET = 'blkgD2vjIxtLs0cf4';
const POLL_INTERVAL = 4000;

// ─── Visual Constants ──────────────────────────────────────────────────────────
// All colors, sizes, and visual properties live here.
// Claude Code targets these constants when applying feedback — one change, instant visual verify.

const COLORS = {
    // Page background
    background: '#f1f5f9',

    // Landing card
    card: '#ffffff',
    divider: '#e5e7eb',

    // Company name
    companyName: '#111827',

    // Tagline
    tagline: '#6b7280',

    // Social proof
    socialProofText: '#374151',
    socialProofStars: '#f59e0b',

    // CTA buttons
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    primaryText: '#ffffff',
    secondary: '#ffffff',
    secondaryBorder: '#d1d5db',
    secondaryText: '#374151',

    // Left pane
    leftBg: '#ffffff',
    leftBorder: '#e5e7eb',
    sectionHeadingText: '#111827',
    sectionSubText: '#6b7280',

    // Form inputs
    inputBg: '#ffffff',
    inputBorder: '#d1d5db',
    inputBorderFocus: '#2563eb',
    inputText: '#111827',
    inputPlaceholder: '#9ca3af',

    // Submit / Bundle buttons
    submitBg: '#111827',
    submitText: '#ffffff',
    submitHover: '#374151',
    submitDisabledBg: '#e5e7eb',
    submitDisabledText: '#9ca3af',

    // Priority pills
    pillUnselectedBg: '#f9fafb',
    pillUnselectedBorder: '#d1d5db',
    pillUnselectedText: '#374151',
    pillLowBg: '#f0fdf4',
    pillLowBorder: '#4ade80',
    pillLowText: '#166534',
    pillMediumBg: '#fefce8',
    pillMediumBorder: '#facc15',
    pillMediumText: '#854d0e',
    pillHighBg: '#fef2f2',
    pillHighBorder: '#f87171',
    pillHighText: '#991b1b',

    // Feedback item rows
    itemBg: '#ffffff',
    itemBorder: '#f3f4f6',
    itemText: '#111827',

    // Push Plan button
    pushPlanBg: '#2563eb',
    pushPlanText: '#ffffff',
    pushPlanHover: '#1d4ed8',
    pushPlanDisabledBg: '#e5e7eb',
    pushPlanDisabledText: '#9ca3af',

    // Revert button
    revertBg: '#fff7ed',
    revertText: '#9a3412',
    revertBorder: '#fed7aa',
    revertHover: '#ffedd5',

    // Walmart Roadmap canvas
    walmartBlue: '#0071CE',
    walmartYellow: '#FFC220',
    roadmapBg: '#f8f9fa',
    roadmapHeaderBg: '#0071CE',
    roadmapBarGreen: '#16a34a',
    roadmapBarGrey: '#9ca3af',
    roadmapBarDefine: '#d97706',
    roadmapBarDiscover: '#0891b2',
    roadmapText: '#111827',
    roadmapMuted: '#6b7280',

    // Walmart Roadmap canvas — dark mode variants
    roadmapDarkBg: '#0f172a',
    roadmapDarkCard: '#1e293b',
    roadmapDarkBorder: '#334155',
    roadmapDarkText: '#f1f5f9',
    roadmapDarkSubText: '#94a3b8',
    roadmapDarkMuted: '#64748b',

};

const SIZES = {
    // Landing card
    cardMaxWidth: 480,
    cardPadding: 48,
    cardRadius: 12,

    // Company name
    companyNameSize: 28,

    // Tagline
    taglineSize: 15,

    // Social proof
    socialProofSize: 13,

    // CTA buttons
    buttonRadius: 8,
    buttonPaddingX: 24,
    buttonPaddingY: 12,
    buttonFontSize: 14,

    // Left pane layout
    leftPaneWidth: 320,
    leftPadding: 16,
    sectionHeaderGap: 8,

    // Form inputs
    inputFontSize: 14,
    inputRadius: 8,
    inputPaddingX: 12,
    inputPaddingY: 10,
    labelFontSize: 13,
    sectionLabelFontSize: 11,

    // Pills
    pillRadius: 999,

    // Walmart Roadmap canvas
    roadmapLeftColWidth: 300,
    roadmapRowHeight: 52,
    roadmapBarHeight: 28,
    roadmapBarRadius: 4,

};

// Expose to window so snip context extraction can embed current design tokens
window.__COLORS__ = COLORS;
window.__SIZES__ = SIZES;

const SESSION_ID = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const CANVAS_COMPONENT = 'WalmartRoadmapCard';

// ─── Animated Dots ─────────────────────────────────────────────────────────────

function AnimatedDots() {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setFrame(f => (f + 1) % 4), 420);
        return () => clearInterval(id);
    }, []);
    return <span style={{ display: 'inline-block', minWidth: 16, textAlign: 'left' }}>{['', '.', '..', '...'][frame]}</span>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_PILL_COLORS = {
    Low:    { bg: COLORS.pillLowBg,    border: COLORS.pillLowBorder,    text: COLORS.pillLowText },
    Medium: { bg: COLORS.pillMediumBg, border: COLORS.pillMediumBorder, text: COLORS.pillMediumText },
    High:   { bg: COLORS.pillHighBg,   border: COLORS.pillHighBorder,   text: COLORS.pillHighText },
};


// ─── Feedback Form ─────────────────────────────────────────────────────────────

function FeedbackForm({ onCreated }) {
    const [text, setText] = useState('');
    const [priority, setPriority] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [justSubmitted, setJustSubmitted] = useState(false);
    const [focused, setFocused] = useState(false);
    const [snipMode, setSnipMode] = useState(false);
    const [snipContext, setSnipContext] = useState(null);
    const [snipPreview, setSnipPreview] = useState(null);
    const [hoverInfo, setHoverInfo] = useState(null);
    const overlayRef = useRef(null);
    const snipTargetRef = useRef(null);
    const hoveredElement = useRef(null);

    const canSubmit = !submitting && text.trim().length > 0;

    useEffect(() => {
        if (!snipMode) return;

        function handleMouseMove(e) {
            const leftPane = document.querySelector('[data-feedback-panel]');
            if (leftPane && leftPane.contains(e.target)) {
                if (hoveredElement.current) {
                    hoveredElement.current.style.outline = '';
                    hoveredElement.current = null;
                }
                setHoverInfo(null);
                return;
            }
            if (e.target === overlayRef.current) return;

            if (hoveredElement.current && hoveredElement.current !== e.target) {
                hoveredElement.current.style.outline = '';
            }
            hoveredElement.current = e.target;
            e.target.style.outline = '2px solid #4B8BF5';
            e.target.style.outlineOffset = '1px';

            const crumbs = [];
            let el = e.target;
            while (el && el !== document.body) {
                let label = el.tagName.toLowerCase();
                if (el.id) label += `#${el.id}`;
                else if (el.className && typeof el.className === 'string') {
                    const first = el.className.trim().split(' ')[0];
                    if (first) label += `.${first}`;
                }
                crumbs.unshift(label);
                el = el.parentElement;
            }

            setHoverInfo({ crumbs, x: e.clientX, y: e.clientY });
        }

        function handleClick(e) {
            if (!hoveredElement.current) return;
            e.preventDefault();
            e.stopPropagation();

            const target = hoveredElement.current;
            target.style.outline = '';
            hoveredElement.current = null;
            setSnipMode(false);
            setHoverInfo(null);

            const br = target.getBoundingClientRect();
            snipTargetRef.current = target;
            const ctx = {
                tag: target.tagName.toLowerCase(),
                className: target.className,
                html: target.outerHTML.slice(0, 600),
                colors: window.__COLORS__,
                sizes: window.__SIZES__,
                boundingRect: { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height) },
            };
            setSnipContext(ctx);

            import('html2canvas').then(({ default: h2c }) => {
                return h2c(target, { scale: 0.5 });
            }).then(canvas => {
                setSnipPreview(canvas.toDataURL('image/png'));
            }).catch(() => {});
        }

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('click', handleClick, true);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('click', handleClick, true);
            if (hoveredElement.current) {
                hoveredElement.current.style.outline = '';
                hoveredElement.current = null;
            }
        };
    }, [snipMode]);

    function handleSnipToggle() {
        if (snipMode) {
            setSnipMode(false); setSnipContext(null); setSnipPreview(null);
            setHoverInfo(null);
        } else {
            setSnipMode(true);
        }
    }

    function clearSnip() { setSnipContext(null); setSnipPreview(null); }

    async function handleSubmit() {
        if (!canSubmit) return;
        setSubmitting(true);
        await createRecord(FEEDBACK_TABLE, {
            'Feedback Text': text.trim(),
            'Status': 'New',
            'Extension Target': EXTENSION_TARGET,
            'Canvas Component': CANVAS_COMPONENT,
            'Source': 'web',
            'Interface URL': window.location.href,
            'User Agent': navigator.userAgent,
            'Viewport': `${window.innerWidth}x${window.innerHeight}`,
            'Base ID': import.meta.env.VITE_BASE_ID || '',
            'Session ID': SESSION_ID,
            ...(priority ? { 'Priority': priority } : {}),
            ...(snipContext ? { 'Snip Context': JSON.stringify(snipContext) } : {}),
            ...(snipPreview ? { 'Snip Preview': snipPreview } : {}),
        });
        setText(''); setPriority(null); setSubmitting(false); setJustSubmitted(true);
        setSnipMode(false); setSnipContext(null); setSnipPreview(null); setHoverInfo(null);
        setTimeout(() => setJustSubmitted(false), 2000);
        if (onCreated) onCreated();
    }

    return (
        <>
            {snipMode && createPortal(
                <div
                    ref={overlayRef}
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'crosshair', pointerEvents: 'none' }}
                />,
                document.body
            )}
            {snipMode && hoverInfo && createPortal(
                <div style={{
                    position: 'fixed',
                    left: Math.min(hoverInfo.x + 12, window.innerWidth - 320),
                    top: hoverInfo.y + 16,
                    zIndex: 10001,
                    backgroundColor: '#111827',
                    color: '#e5e7eb',
                    borderRadius: 6,
                    padding: '5px 10px',
                    fontSize: 11,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                    maxWidth: 300,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    pointerEvents: 'none',
                }}>
                    {hoverInfo.crumbs.map((crumb, i) => (
                        <span key={i}>
                            {i > 0 && <span style={{ color: '#4B8BF5', margin: '0 4px' }}>›</span>}
                            <span style={{ color: i === hoverInfo.crumbs.length - 1 ? '#ffffff' : '#9ca3af' }}>
                                {crumb}
                            </span>
                        </span>
                    ))}
                </div>,
                document.body
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Textarea + snip button */}
                <textarea
                    id="feedback-text-input"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder="What should change?"
                    rows={3}
                    style={{
                        width: '100%', fontSize: SIZES.inputFontSize, color: COLORS.inputText,
                        backgroundColor: COLORS.inputBg,
                        border: `1.5px solid ${focused ? COLORS.inputBorderFocus : COLORS.inputBorder}`,
                        borderRadius: SIZES.inputRadius,
                        padding: `${SIZES.inputPaddingY}px ${SIZES.inputPaddingX}px`,
                        outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                        resize: 'none', lineHeight: 1.5, transition: 'border-color 0.15s',
                    }}
                />

                {/* Snip preview */}
                {snipContext && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        backgroundColor: '#f9fafb', border: '1px solid #e5e7eb',
                        borderRadius: 8, padding: '8px 10px', marginTop: snipMode ? 8 : 0,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                                {snipContext.tag}{snipContext.className ? `.${snipContext.className.trim().split(' ')[0]}` : ''}
                                <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>
                                    {snipContext.boundingRect.w}×{snipContext.boundingRect.h}px
                                </span>
                            </span>
                            <button onClick={clearSnip} style={{ background: 'none', border: 'none', padding: '0 2px', fontSize: 12, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                        </div>
                        {snipPreview && (
                            <img src={snipPreview} alt="Snip" style={{ maxWidth: '100%', height: 'auto', display: 'block', borderRadius: 4, border: '1px solid #e5e7eb', margin: '0 auto' }} />
                        )}
                        <textarea
                            value={snipContext.html || ''}
                            readOnly
                            rows={2}
                            style={{
                                width: '100%', fontSize: 10, color: '#6b7280', backgroundColor: '#ffffff',
                                border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 6px',
                                boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                                resize: 'none', lineHeight: 1.4, outline: 'none',
                            }}
                        />
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Row 1: Priority label + pills */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={{
                            fontSize: 10, fontWeight: 700, color: COLORS.sectionSubText,
                            letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>
                            Priority
                        </span>
                        <div style={{ display: 'flex', gap: 5 }}>
                            {['Low', 'Medium', 'High'].map(p => {
                                const selected = priority === p;
                                const sc = PRIORITY_PILL_COLORS[p];
                                return (
                                    <button
                                        key={p}
                                        id={`priority-pill-${p.toLowerCase()}`}
                                        onClick={() => setPriority(selected ? null : p)}
                                        style={{
                                            fontSize: 11, fontWeight: selected ? 600 : 500,
                                            color: selected ? sc.text : COLORS.pillUnselectedText,
                                            backgroundColor: selected ? sc.bg : COLORS.pillUnselectedBg,
                                            border: `1.5px solid ${selected ? sc.border : COLORS.pillUnselectedBorder}`,
                                            borderRadius: SIZES.pillRadius,
                                            padding: '4px 10px', cursor: 'pointer', transition: 'all 0.1s',
                                        }}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Row 2: ✂ Snip left, Add right */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                            onClick={handleSnipToggle}
                            title={snipMode ? 'Cancel snip' : 'Pick UI element'}
                            style={{
                                background: snipMode ? '#eff6ff' : 'transparent',
                                border: `1px solid ${snipMode ? '#4B8BF5' : '#d1d5db'}`,
                                borderRadius: 999, padding: '5px 12px', fontSize: 12,
                                color: snipMode ? '#2563eb' : '#374151',
                                cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                        >
                            ✂ Snip
                        </button>
                        <button
                            id="feedback-submit"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            style={{
                                backgroundColor: justSubmitted ? '#dcfce7' : canSubmit ? COLORS.submitBg : COLORS.submitDisabledBg,
                                color: justSubmitted ? '#166534' : canSubmit ? COLORS.submitText : COLORS.submitDisabledText,
                                border: 'none', borderRadius: SIZES.inputRadius,
                                padding: '7px 16px', fontSize: 13, fontWeight: 600,
                                cursor: canSubmit ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
                                transition: 'background-color 0.12s',
                            }}
                            onMouseEnter={e => { if (canSubmit && !justSubmitted) e.currentTarget.style.backgroundColor = COLORS.submitHover; }}
                            onMouseLeave={e => { if (canSubmit && !justSubmitted) e.currentTarget.style.backgroundColor = COLORS.submitBg; }}
                        >
                            {submitting ? '…' : justSubmitted ? '✓' : 'Add'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Snip Tooltip ──────────────────────────────────────────────────────────────

function SnipTooltip({ ctx, pos }) {
    try {
        const allHexColors = Object.entries(ctx.colors || {})
            .filter(([, v]) => typeof v === 'string' && v.startsWith('#'));
        const hexColors = ctx.tag === 'button'
            ? allHexColors.filter(([k]) => ['primary', 'secondary', 'button'].some(w => k.toLowerCase().includes(w)))
            : allHexColors.slice(0, 8);
        const allSizes = Object.entries(ctx.sizes || {}).filter(([, v]) => typeof v === 'number');
        const tagSizes = allSizes.filter(([k]) => k.toLowerCase().includes(ctx.tag.toLowerCase()));
        const numSizes = (tagSizes.length > 0 ? tagSizes : allSizes).slice(0, 5);
        const elementLabel = [ctx.tag, ctx.className].filter(Boolean).join('.');
        const htmlPreview = (ctx.html || '').slice(0, 80) + ((ctx.html || '').length > 80 ? '…' : '');
        return createPortal(
            <div style={{
                position: 'fixed', left: pos.x, top: pos.y, zIndex: 10000,
                backgroundColor: '#111827', color: '#e5e7eb',
                borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                maxWidth: 280, fontSize: 11, lineHeight: 1.6,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: 4,
                pointerEvents: 'none',
            }}>
                <div>📐 Element: <span style={{ fontWeight: 600 }}>{elementLabel || ctx.tag}</span></div>
                <div style={{ color: '#9ca3af' }}>Size: {ctx.boundingRect.w} × {ctx.boundingRect.h}px</div>
                {hexColors.length > 0 && (
                    <div style={{ borderTop: '1px solid #374151', paddingTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {hexColors.map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ minWidth: 85, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                                <span style={{ minWidth: 58 }}>{v}</span>
                                <div style={{ width: 12, height: 12, borderRadius: 2, flexShrink: 0, backgroundColor: v, border: '1px solid rgba(255,255,255,0.15)' }} />
                            </div>
                        ))}
                    </div>
                )}
                {numSizes.length > 0 && (
                    <div style={{ borderTop: '1px solid #374151', paddingTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {numSizes.map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', gap: 6 }}>
                                <span style={{ minWidth: 85, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                                <span>{v}px</span>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ borderTop: '1px solid #374151', paddingTop: 5, color: '#9ca3af', wordBreak: 'break-all' }}>
                    HTML: {htmlPreview}
                </div>
            </div>,
            document.body
        );
    // eslint-disable-next-line no-unused-vars
    } catch (_) { return null; }
}

// ─── Open Feedback List ────────────────────────────────────────────────────────

function OpenFeedbackList({ openFeedback, checkedIds, onToggle, onRefresh }) {
    const [hoveredId, setHoveredId] = useState(null);
    const [tooltipData, setTooltipData] = useState(null);
    const [editingRecord, setEditingRecord] = useState(null);
    const [editText, setEditText] = useState('');
    const [editPriority, setEditPriority] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    function openEdit(record) {
        setEditingRecord(record);
        setEditText(record.fields['Feedback Text'] || '');
        setEditPriority(record.fields['Priority'] || null);
        setDeleteConfirm(false);
    }

    async function handleSave() {
        if (!editingRecord) return;
        setSaving(true);
        await updateRecord(FEEDBACK_TABLE, editingRecord.id, {
            'Feedback Text': editText.trim(),
            'Priority': editPriority || null,
        });
        setSaving(false);
        setEditingRecord(null);
        if (onRefresh) onRefresh();
    }

    async function handleDelete() {
        if (!editingRecord) return;
        setSaving(true);
        await deleteRecord(FEEDBACK_TABLE, editingRecord.id);
        setSaving(false);
        setEditingRecord(null);
        setDeleteConfirm(false);
        if (onRefresh) onRefresh();
    }

    return (
        <>
            {/* Edit modal */}
            {editingRecord && createPortal(
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) setEditingRecord(null); }}
                >
                    <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 420, maxWidth: '92vw', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Edit Feedback</span>
                            <button onClick={() => setEditingRecord(null)} style={{ background: 'none', border: 'none', fontSize: 15, color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: 2 }}>✕</button>
                        </div>

                        {/* Text */}
                        <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={4}
                            autoFocus
                            style={{
                                width: '100%', fontSize: 13, color: '#111827', backgroundColor: '#f9fafb',
                                border: '1.5px solid #d1d5db', borderRadius: 8, padding: '10px 12px',
                                outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                            }}
                            onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                            onBlur={e => { e.target.style.borderColor = '#d1d5db'; }}
                        />

                        {/* Priority */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>Priority</span>
                            <div style={{ display: 'flex', gap: 5 }}>
                                {['Low', 'Medium', 'High'].map(p => {
                                    const selected = editPriority === p;
                                    const sc = PRIORITY_PILL_COLORS[p];
                                    return (
                                        <button key={p} onClick={() => setEditPriority(selected ? null : p)} style={{
                                            fontSize: 11, fontWeight: selected ? 600 : 500,
                                            color: selected ? sc.text : COLORS.pillUnselectedText,
                                            backgroundColor: selected ? sc.bg : COLORS.pillUnselectedBg,
                                            border: `1.5px solid ${selected ? sc.border : COLORS.pillUnselectedBorder}`,
                                            borderRadius: SIZES.pillRadius, padding: '3px 10px', cursor: 'pointer', transition: 'all 0.1s',
                                        }}>{p}</button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* UI context (if snip) */}
                        {(() => {
                            const snipRaw = editingRecord.fields['Snip Context'];
                            if (!snipRaw) return null;
                            try {
                                const ctx = JSON.parse(snipRaw);
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            UI Context · <span style={{ fontWeight: 400, textTransform: 'none', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                                                {ctx.tag}{ctx.className ? `.${ctx.className.trim().split(' ')[0]}` : ''} {ctx.boundingRect?.w}×{ctx.boundingRect?.h}px
                                            </span>
                                        </span>
                                        <textarea
                                            value={ctx.html || ''}
                                            readOnly
                                            rows={2}
                                            style={{
                                                width: '100%', fontSize: 10, color: '#6b7280', backgroundColor: '#f9fafb',
                                                border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 6px',
                                                boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                                                resize: 'none', lineHeight: 1.4, outline: 'none',
                                            }}
                                        />
                                    </div>
                                );
                            // eslint-disable-next-line no-unused-vars
                            } catch (_) { return null; }
                        })()}

                        {/* Footer */}
                        {deleteConfirm ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                                <span style={{ fontSize: 12, color: '#dc2626', flex: 1 }}>Delete this item?</span>
                                <button onClick={() => setDeleteConfirm(false)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                                    No
                                </button>
                                <button onClick={handleDelete} disabled={saving} style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                    {saving ? 'Deleting…' : 'Yes, delete'}
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                                <button onClick={() => setDeleteConfirm(true)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#9ca3af', cursor: 'pointer', marginRight: 'auto' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; }}
                                >
                                    Delete
                                </button>
                                <button onClick={() => setEditingRecord(null)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 14px', fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !editText.trim()}
                                    style={{
                                        backgroundColor: (saving || !editText.trim()) ? '#e5e7eb' : '#111827',
                                        color: (saving || !editText.trim()) ? '#9ca3af' : '#fff',
                                        border: 'none', borderRadius: 6, padding: '5px 14px',
                                        fontSize: 12, fontWeight: 600,
                                        cursor: (saving || !editText.trim()) ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Empty state */}
            {!openFeedback.length ? (
                <div style={{ fontSize: 13, color: COLORS.sectionSubText, padding: '8px 0' }}>No open feedback.</div>
            ) : (
                <>
                    {tooltipData && <SnipTooltip ctx={tooltipData.ctx} pos={tooltipData.pos} />}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {openFeedback.map(record => {
                            const checked = checkedIds.has(record.id);
                            const isHovered = hoveredId === record.id;
                            const feedbackText = record.fields['Feedback Text'] || '';
                            const priority = record.fields['Priority'] || null;
                            const pColors = priority ? PRIORITY_PILL_COLORS[priority] : null;
                            const snipCtxRaw = record.fields['Snip Context'] || '';
                            const hasSnip = !!snipCtxRaw;
                            let parsedSnipCtx = null;
                            // eslint-disable-next-line no-unused-vars
                            try { if (snipCtxRaw) parsedSnipCtx = JSON.parse(snipCtxRaw); } catch (_) { /* malformed JSON */ }

                            return (
                                <div
                                    key={record.id}
                                    onMouseEnter={e => {
                                        setHoveredId(record.id);
                                        if (parsedSnipCtx && checkedIds.size === 0) {
                                            const r = e.currentTarget.getBoundingClientRect();
                                            setTooltipData({ ctx: parsedSnipCtx, pos: { x: r.right + 8, y: r.top } });
                                        }
                                    }}
                                    onMouseLeave={() => { setHoveredId(null); setTooltipData(null); }}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 8,
                                        backgroundColor: checked ? '#eff6ff' : COLORS.itemBg,
                                        border: `1px solid ${checked ? '#bfdbfe' : isHovered ? '#d1d5db' : COLORS.itemBorder}`,
                                        borderRadius: 8, padding: '8px 10px',
                                        transition: 'all 0.12s',
                                    }}
                                >
                                    {/* Checkbox — toggles bundle selection */}
                                    <div
                                        onClick={() => onToggle(record.id)}
                                        style={{
                                            width: 15, height: 15, borderRadius: 3, flexShrink: 0, marginTop: 2,
                                            border: `2px solid ${checked ? '#2563eb' : '#d1d5db'}`,
                                            backgroundColor: checked ? '#2563eb' : '#ffffff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {checked && <span style={{ color: '#ffffff', fontSize: 9, lineHeight: 1 }}>✓</span>}
                                    </div>

                                    {/* Content — opens edit modal */}
                                    <div
                                        onClick={() => openEdit(record)}
                                        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                            <span style={{
                                                fontSize: 12, color: COLORS.itemText, lineHeight: 1.4, flex: 1,
                                                ...(isHovered ? {} : {
                                                    overflow: 'hidden', display: '-webkit-box',
                                                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                                }),
                                            }}>
                                                {feedbackText || '—'}
                                            </span>
                                            {hasSnip && (
                                                <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }} title="Has UI snip context">
                                                    <circle cx="6.5" cy="6.5" r="3.5" />
                                                    <line x1="6.5" y1="0" x2="6.5" y2="2.5" />
                                                    <line x1="6.5" y1="10.5" x2="6.5" y2="13" />
                                                    <line x1="0" y1="6.5" x2="2.5" y2="6.5" />
                                                    <line x1="10.5" y1="6.5" x2="13" y2="6.5" />
                                                </svg>
                                            )}
                                        </div>
                                        {priority && pColors && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 600, borderRadius: 999,
                                                backgroundColor: pColors.bg, color: pColors.text,
                                                border: `1px solid ${pColors.border}`, padding: '2px 6px',
                                                alignSelf: 'flex-start',
                                            }}>
                                                {priority}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </>
    );
}

// ─── Relative Time ─────────────────────────────────────────────────────────────

function relativeTime(isoString) {
    if (!isoString) return null;
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Versions List ─────────────────────────────────────────────────────────────

function VersionsList({ plans, allFeedback, reverting, revertedIds, onRevert }) {
    const [planTooltip, setPlanTooltip] = useState(null);

    // Include 'New' plans only if they have linked items (stuck/queued bundles)
    const versionPlans = plans.filter(p => {
        const s = p.fields['Plan Status'] || '';
        if (s === 'Executing' || s === 'Reverting' || s === 'Done' || s === 'Approved' || s === 'Failed' || s === 'Reverted') return true;
        if (s === 'New') {
            return allFeedback.some(r => matchesRecordId(r.fields['Version'], p.id));
        }
        return false;
    });

    if (!versionPlans.length) {
        return <div style={{ fontSize: 13, color: COLORS.sectionSubText, padding: '4px 0' }}>No versions yet.</div>;
    }

    // Only the most recent done/approved plan gets the revert button
    const revertablePlan = versionPlans.find(p => {
        const s = p.fields['Plan Status'] || '';
        return s === 'Done' || s === 'Approved';
    });

    return (
        <>
        {planTooltip && createPortal(
            <div style={{
                position: 'fixed', left: planTooltip.x, top: planTooltip.y, zIndex: 10000,
                backgroundColor: '#111827', color: '#e5e7eb',
                borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                maxWidth: 280, fontSize: 11, lineHeight: 1.6,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                padding: '10px 12px', pointerEvents: 'none',
            }}>
                {planTooltip.text}
                {planTooltip.execLog && (
                    <pre style={{
                        margin: 0, fontSize: 10, whiteSpace: 'pre-wrap',
                        color: '#9ca3af', marginTop: 6, maxHeight: 120, overflowY: 'auto',
                    }}>{planTooltip.execLog}</pre>
                )}
            </div>,
            document.body
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {versionPlans.map(plan => {
                const status = plan.fields['Plan Status'] || '';
                const planName = plan.fields['Plan Name'] || '';
                const actionType = plan.fields['Action Type'] || 'Code Change';
                const actionStatus = plan.fields['Action Status'] || '';
                const actionOutput = plan.fields['Action Output'] || '';
                const isNonCodeChange = actionType !== 'Code Change';
                const isRunning = isNonCodeChange && actionStatus === 'Running';
                const isActionDone = isNonCodeChange && actionStatus === 'Done';
                const isActionFailed = isNonCodeChange && actionStatus === 'Failed';
                const actionIcon = { 'Code Change': '⚡', 'Create Tasks': '✓', 'Generate Spec': '📄', 'Email Summary': '✉' }[actionType] || '⚡';
                const isExecuting = status === 'Executing';
                const isReverting = status === 'Reverting';
                const isDone = status === 'Done' || status === 'Approved';
                const isQueued = status === 'New';
                const isReverted = status === 'Reverted' || revertedIds.has(plan.id);
                const canRevert = !isReverted && !isReverting && !isNonCodeChange && (revertablePlan?.id === plan.id || isQueued);
                const runUrl = plan.fields['GitHub Run URL'] || null;
                const timeLabel = isExecuting
                    ? relativeTime(plan.fields['Executing At']) || relativeTime(plan.createdTime)
                    : (isDone || status === 'Failed')
                        ? relativeTime(plan.fields['Done At']) || relativeTime(plan.createdTime)
                        : relativeTime(plan.createdTime);

                const items = allFeedback.filter(r => matchesRecordId(r.fields['Version'], plan.id));
                const borderColor = isNonCodeChange
                    ? (isRunning ? '#fde68a' : isActionDone ? '#bbf7d0' : isActionFailed ? '#fecaca' : '#e5e7eb')
                    : (isExecuting || isReverting ? '#fde68a' : isReverted ? '#e5e7eb' : isDone ? '#bbf7d0' : isQueued ? '#e5e7eb' : '#fecaca');
                const headerBg = isNonCodeChange
                    ? (isRunning ? '#fffbeb' : isActionDone ? '#f0fdf4' : isActionFailed ? '#fef2f2' : '#f9fafb')
                    : (isExecuting || isReverting ? '#fffbeb' : isReverted ? '#f9fafb' : isDone ? '#f0fdf4' : isQueued ? '#f9fafb' : '#fef2f2');
                const badgeColor = isNonCodeChange
                    ? (isRunning ? '#92400e' : isActionDone ? '#166534' : isActionFailed ? '#991b1b' : '#6b7280')
                    : (isExecuting || isReverting ? '#92400e' : isReverted ? '#6b7280' : isDone ? '#166534' : isQueued ? '#6b7280' : '#991b1b');
                return (
                    <div key={plan.id} style={{ border: `1px solid ${borderColor}`, borderRadius: 8, overflow: 'hidden' }}>
                        {/* Plan header row */}
                        <div
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', backgroundColor: headerBg }}
                            onMouseEnter={e => {
                                const summary = getFieldValue(plan.fields['UI Change Summary']) || '';
                                const execLog = (isExecuting || isReverting) ? (plan.fields['Execution Log'] || '') : '';
                                if (!summary && !execLog) return;
                                const r = e.currentTarget.getBoundingClientRect();
                                setPlanTooltip({ text: summary, execLog, x: r.right + 8, y: r.top });
                            }}
                            onMouseLeave={() => setPlanTooltip(null)}
                        >
                            <span className={isQueued ? 'badge-queued' : undefined}
                                style={{ fontSize: 10, fontWeight: 700, color: badgeColor, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                                {isNonCodeChange
                                    ? (isRunning ? <>Running<AnimatedDots /></> : isActionDone ? '✓ Done' : isActionFailed ? '✗ Failed' : '● Pending')
                                    : (isExecuting ? <>Applying<AnimatedDots /></> : isReverting ? <>Reverting<AnimatedDots /></> : isReverted ? '↩ Reverted' : isDone ? '✓ Done' : isQueued ? '● Queued' : '✗ Failed')}
                            </span>
                            <span style={{
                                fontSize: 10, color: '#9ca3af',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #e5e7eb',
                                borderRadius: 999, padding: '1px 6px',
                                flexShrink: 0,
                            }}>
                                {actionIcon} {actionType}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 11, color: '#6b7280',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {planName}
                                </div>
                                {(timeLabel || runUrl) && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                                        {timeLabel && <span style={{ fontSize: 10, color: '#9ca3af' }}>{timeLabel}</span>}
                                        {runUrl && (
                                            <a href={runUrl} target="_blank" rel="noreferrer"
                                                style={{ fontSize: 10, color: '#9ca3af', textDecoration: 'none' }}
                                                onMouseEnter={e => { e.currentTarget.style.color = '#6b7280'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; }}
                                            >↗ Actions</a>
                                        )}
                                    </div>
                                )}
                            </div>
                            {reverting === plan.id || isReverting
                                ? <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                    Reverting<AnimatedDots />
                                  </span>
                                : canRevert && (
                                    <button
                                        onClick={() => onRevert(plan)}
                                        disabled={!!reverting}
                                        style={{
                                            background: 'none', border: 'none', padding: 0, margin: 0,
                                            fontSize: 11, color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = COLORS.revertText; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; }}
                                    >
                                        ↩ Revert
                                    </button>
                                )
                            }
                        </div>

                        {/* Items */}
                        {items.length > 0 && (
                            <div style={{ padding: '5px 10px 7px', display: 'flex', flexDirection: 'column', gap: 3, backgroundColor: '#ffffff' }}>
                                {items.map(item => {
                                    const priority = item.fields['Priority'] || null;
                                    const pColors = priority ? PRIORITY_PILL_COLORS[priority] : null;
                                    const parsedChange = getFieldValue(item.fields['Parsed Plan']) || '';
                                    const feedbackText = item.fields['Feedback Text'] || '';
                                    return (
                                        <div key={item.id}
                                            title={parsedChange || feedbackText}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280', cursor: 'default' }}>
                                            <span style={{ flexShrink: 0 }}>·</span>
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {feedbackText}
                                            </span>
                                            {priority && pColors && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 600, borderRadius: 999, flexShrink: 0,
                                                    backgroundColor: pColors.bg, color: pColors.text,
                                                    border: `1px solid ${pColors.border}`, padding: '1px 4px',
                                                }}>
                                                    {priority}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {/* Execution Log — live progress, only while executing */}
                        {isExecuting && !!(plan.fields['Execution Log']) && (
                            <div style={{ borderTop: '1px solid #fde68a', padding: '5px 10px 6px', backgroundColor: '#fffbeb' }}>
                                <pre style={{
                                    margin: 0, fontSize: 10, fontFamily: 'ui-monospace, monospace',
                                    color: '#78350f', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word', maxHeight: 80, overflowY: 'auto',
                                }}>{plan.fields['Execution Log']}</pre>
                            </div>
                        )}
                        {/* Action Output — for non-Code-Change plans */}
                        {isNonCodeChange && actionOutput && (
                            <div style={{
                                padding: '8px 10px',
                                borderTop: '1px solid #f3f4f6',
                                backgroundColor: '#fafafa',
                            }}>
                                <pre style={{
                                    margin: 0, fontSize: 10,
                                    color: '#6b7280',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                                    maxHeight: 120,
                                    overflowY: 'auto',
                                }}>
                                    {actionOutput}
                                </pre>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        </>
    );
}

// ─── Acme Landing Card ─────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
function AcmeLandingCard() {
    return (
        <div
            id="main-card"
            style={{
                backgroundColor: COLORS.card, borderRadius: SIZES.cardRadius,
                padding: SIZES.cardPadding, maxWidth: SIZES.cardMaxWidth, width: '100%',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07), 0 8px 32px rgba(0,0,0,0.09)',
                display: 'flex', flexDirection: 'column', gap: 20,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h1
                    id="main-title"
                    style={{ margin: 0, fontSize: SIZES.companyNameSize, fontWeight: 700, color: COLORS.companyName, lineHeight: 1.15 }}
                >
                    Acme App
                </h1>
                <p
                    id="subtitle"
                    style={{ margin: 0, fontSize: SIZES.taglineSize, color: COLORS.tagline, lineHeight: 1.5 }}
                >
                    The best way to manage your team.
                </p>
            </div>

            <div style={{ borderTop: `1px solid ${COLORS.divider}` }} />

            <div style={{ display: 'flex', gap: 12 }}>
                <button
                    id="primary-button"
                    style={{
                        flex: 1, backgroundColor: COLORS.primary, color: COLORS.primaryText,
                        border: 'none', borderRadius: SIZES.buttonRadius,
                        paddingTop: SIZES.buttonPaddingY, paddingBottom: SIZES.buttonPaddingY,
                        paddingLeft: SIZES.buttonPaddingX, paddingRight: SIZES.buttonPaddingX,
                        fontSize: SIZES.buttonFontSize, fontWeight: 600, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = COLORS.primaryHover; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = COLORS.primary; }}
                >
                    Get Started
                </button>
                <button
                    id="secondary-button"
                    style={{
                        flex: 1, backgroundColor: COLORS.secondary, color: COLORS.secondaryText,
                        border: `1.5px solid ${COLORS.secondaryBorder}`, borderRadius: SIZES.buttonRadius,
                        paddingTop: SIZES.buttonPaddingY, paddingBottom: SIZES.buttonPaddingY,
                        paddingLeft: SIZES.buttonPaddingX, paddingRight: SIZES.buttonPaddingX,
                        fontSize: SIZES.buttonFontSize, fontWeight: 600, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = COLORS.secondary; }}
                >
                    Learn More
                </button>
            </div>

            <p
                id="social-proof"
                style={{ margin: 0, fontSize: SIZES.socialProofSize, color: COLORS.socialProofText, textAlign: 'center' }}
            >
                <span style={{ color: COLORS.socialProofStars }}>★★★★★</span>
                {' '}Loved by 10,000 teams
            </p>
        </div>
    );
}

// ─── Walmart Spark SVG ─────────────────────────────────────────────────────────

function WalmartSpark() {
    return (
        <svg width="28" height="28" viewBox="0 0 532.262 600" xmlns="http://www.w3.org/2000/svg">
            <path fill="#FFC220" d="M375.663,273.363c12.505-2.575,123.146-53.269,133.021-58.97c22.547-13.017,30.271-41.847,17.254-64.393s-41.847-30.271-64.393-17.254c-9.876,5.702-109.099,76.172-117.581,85.715c-9.721,10.937-11.402,26.579-4.211,39.033C346.945,269.949,361.331,276.314,375.663,273.363z"/>
            <path fill="#FFC220" d="M508.685,385.607c-9.876-5.702-120.516-56.396-133.021-58.97c-14.332-2.951-28.719,3.415-35.909,15.87c-7.191,12.455-5.51,28.097,4.211,39.033c8.482,9.542,107.705,80.013,117.581,85.715c22.546,13.017,51.376,5.292,64.393-17.254S531.231,398.624,508.685,385.607z"/>
            <path fill="#FFC220" d="M266.131,385.012c-14.382,0-27.088,9.276-31.698,23.164c-4.023,12.117-15.441,133.282-15.441,144.685c0,26.034,21.105,47.139,47.139,47.139c26.034,0,47.139-21.105,47.139-47.139c0-11.403-11.418-132.568-15.441-144.685C293.219,394.288,280.513,385.012,266.131,385.012z"/>
            <path fill="#FFC220" d="M156.599,326.637c-12.505,2.575-123.146,53.269-133.021,58.97C1.031,398.624-6.694,427.454,6.323,450c13.017,22.546,41.847,30.271,64.393,17.254c9.876-5.702,109.098-76.172,117.58-85.715c9.722-10.937,11.402-26.579,4.211-39.033S170.931,323.686,156.599,326.637z"/>
            <path fill="#FFC220" d="M70.717,132.746C48.171,119.729,19.341,127.454,6.323,150c-13.017,22.546-5.292,51.376,17.254,64.393c9.876,5.702,120.517,56.396,133.021,58.97c14.332,2.951,28.719-3.415,35.91-15.87c7.191-12.455,5.51-28.096-4.211-39.033C179.815,208.918,80.592,138.447,70.717,132.746z"/>
            <path fill="#FFC220" d="M266.131,0c-26.035,0-47.139,21.105-47.139,47.139c0,11.403,11.418,132.568,15.441,144.685c4.611,13.888,17.317,23.164,31.698,23.164s27.088-9.276,31.698-23.164c4.023-12.117,15.441-133.282,15.441-144.685C313.27,21.105,292.165,0,266.131,0z"/>
        </svg>
    );
}

// ─── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ label, color }) {
    const colors = {
        green:  { bg: '#dcfce7', text: '#166534', border: '#86efac' },
        grey:   { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
        yellow: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
        blue:   { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
        teal:   { bg: '#cffafe', text: '#155e75', border: '#67e8f9' },
    };
    const c = colors[color] || colors.grey;
    return (
        <span style={{
            fontSize: 10, fontWeight: 700, borderRadius: 4,
            backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}`,
            padding: '2px 6px', whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
    );
}

// ─── Walmart Roadmap Card ───────────────────────────────────────────────────────

function WalmartRoadmapCard() {
    const [detailBar, setDetailBar] = useState(null);
    const [darkMode, setDarkMode] = useState(false);
    const quarters = ['FY27 Q1', 'FY27 Q2', 'FY27 Q3', 'FY27 Q4', 'FY28 Q1', 'FY28 Q2'];
    const qw = 100 / 6;
    const todayPct = qw * 1.35; // ~mid Q2

    const theme = darkMode ? {
        bg: COLORS.roadmapDarkBg,
        card: COLORS.roadmapDarkCard,
        border: COLORS.roadmapDarkBorder,
        text: COLORS.roadmapDarkText,
        subText: COLORS.roadmapDarkSubText,
        muted: COLORS.roadmapDarkMuted,
        rowGroupBg: COLORS.roadmapDarkBg,
        timelineHeaderBg: COLORS.roadmapDarkCard,
        gridLine: COLORS.roadmapDarkBorder,
    } : {
        bg: COLORS.roadmapBg,
        card: '#ffffff',
        border: '#e5e7eb',
        text: COLORS.roadmapText,
        subText: '#374151',
        muted: COLORS.roadmapMuted,
        rowGroupBg: '#f9fafb',
        timelineHeaderBg: '#f9fafb',
        gridLine: '#f3f4f6',
    };

    function TimelineRow({ id, left, width, color, dashed, badge, badgeColor, label, subLabel, onEnter }) {
        return (
            <div
                id={id}
                onMouseEnter={onEnter}
                onMouseLeave={() => setDetailBar(null)}
                style={{
                    position: 'absolute',
                    left: `${left}%`, width: `${width}%`,
                    top: '50%', transform: 'translateY(-50%)',
                    height: SIZES.roadmapBarHeight,
                    backgroundColor: dashed ? 'transparent' : color,
                    border: dashed ? `2px dashed ${COLORS.roadmapBarGrey}` : 'none',
                    borderRadius: SIZES.roadmapBarRadius,
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '0 8px', cursor: 'default', overflow: 'hidden', boxSizing: 'border-box',
                }}
            >
                {badge && <StatusBadge label={badge} color={badgeColor || 'grey'} />}
                <span style={{ fontSize: 12, fontWeight: 500, color: dashed ? theme.muted : '#ffffff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {subLabel && <span style={{ fontSize: 11, color: dashed ? theme.subText : 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', flexShrink: 0 }}>{subLabel}</span>}
            </div>
        );
    }

    function InitiativeRow({ leftContent, timelineContent }) {
        return (
            <div style={{ display: 'flex', borderBottom: `1px solid ${theme.gridLine}`, backgroundColor: theme.card, minHeight: SIZES.roadmapRowHeight }}>
                <div style={{ width: SIZES.roadmapLeftColWidth, flexShrink: 0, borderRight: `1px solid ${theme.border}` }}>{leftContent}</div>
                <div style={{ flex: 1, position: 'relative' }}>
                    {[1,2,3,4,5].map(i => (
                        <div key={i} style={{ position: 'absolute', left: `${qw * i}%`, top: 0, bottom: 0, width: 1, backgroundColor: theme.gridLine, pointerEvents: 'none' }} />
                    ))}
                    <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(0,113,206,0.25)', pointerEvents: 'none', zIndex: 1 }} />
                    {timelineContent}
                </div>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', backgroundColor: theme.bg, overflow: 'auto', fontFamily: 'ui-sans-serif, system-ui, sans-serif', minWidth: 900, paddingBottom: 80, boxSizing: 'border-box' }}>

            {/* Hover detail card */}
            {detailBar && createPortal(
                <div id="roadmap-detail-card" style={{
                    position: 'fixed', left: detailBar.x, top: detailBar.y + detailBar.h + 6,
                    zIndex: 10000, backgroundColor: theme.card, border: `1px solid ${theme.border}`,
                    borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                    padding: 16, width: 280, fontSize: 12, color: theme.subText, pointerEvents: 'none',
                }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: theme.text, marginBottom: 8 }}>Dynamic Routing ML Model</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div><span style={{ color: theme.muted }}>Primary Initiative: </span>Modernize Replenishment Planning, Order Management and Inventory systems</div>
                        <div><span style={{ color: theme.muted }}>Primary Product Owners: </span>Daniel Walsh, Priya Nair</div>
                        <div><span style={{ color: theme.muted }}>Dependencies: </span>ENB-0393</div>
                        <div><span style={{ color: theme.muted }}>Dependent Team Count: </span>3</div>
                    </div>
                    <div style={{ marginTop: 10 }}><StatusBadge label="Develop (Committed)" color="green" /></div>
                </div>,
                document.body
            )}

            {/* Header bar */}
            <div id="roadmap-header" style={{
                backgroundColor: COLORS.roadmapHeaderBg, height: 56, padding: '0 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <WalmartSpark />
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', marginLeft: 10 }}>Product Hub</span>
                    <div style={{ display: 'flex', gap: 4, marginLeft: 24 }}>
                        <button style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#ffffff', borderRadius: 6, padding: '5px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Home</button>
                        <button style={{ background: '#ffffff', border: 'none', color: COLORS.walmartBlue, borderRadius: 6, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Roadmap</button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {['All', 'Walmart US', "Sam's Club", 'International'].map((f, i) => (
                        <button key={f} style={{
                            backgroundColor: i === 0 ? COLORS.walmartYellow : 'transparent',
                            color: i === 0 ? '#000000' : '#ffffff',
                            border: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.4)',
                            borderRadius: 999, padding: '4px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>{f}</button>
                    ))}
                    <button
                        onClick={() => setDarkMode(d => !d)}
                        title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                        style={{
                            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)',
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 15, lineHeight: 1,
                            color: '#ffffff', marginLeft: 4,
                        }}
                    >{darkMode ? '\u2600\ufe0f' : '\ud83c\udf19'}</button>
                </div>
            </div>

            {/* Sub-header tabs */}
            <div id="roadmap-subheader" style={{
                backgroundColor: theme.card, borderBottom: `1px solid ${theme.border}`,
                padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', gap: 24 }}>
                    <button style={{ fontSize: 13, color: theme.muted, padding: '12px 0', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer' }}>Strategic</button>
                    <button style={{ fontSize: 13, fontWeight: 700, color: theme.text, padding: '12px 0', background: 'none', border: 'none', borderBottom: `2px solid ${COLORS.walmartBlue}`, cursor: 'pointer' }}>Execution</button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ fontSize: 12, border: `1px solid ${theme.border}`, borderRadius: 6, padding: '5px 12px', background: 'none', cursor: 'pointer', color: theme.subText }}>Products</button>
                    <button style={{ fontSize: 12, border: `1px solid ${theme.border}`, borderRadius: 6, padding: '5px 12px', background: 'none', cursor: 'pointer', color: theme.subText }}>Collapse All</button>
                </div>
            </div>

            {/* Filter bar */}
            <div id="roadmap-filters" style={{
                backgroundColor: theme.card, borderBottom: `1px solid ${theme.border}`,
                padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            }}>
                {['All goals', 'All product areas', 'All markets', 'All lifecycle stages', 'All statuses'].map(f => (
                    <button key={f} style={{
                        fontSize: 12, border: `1px solid ${theme.border}`, borderRadius: 6,
                        padding: '4px 10px', background: 'none', cursor: 'pointer', color: theme.subText,
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                        {f} <span style={{ fontSize: 10, color: theme.muted }}>▾</span>
                    </button>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: theme.subText, cursor: 'pointer', marginLeft: 'auto' }}>
                    <input type="checkbox" style={{ cursor: 'pointer' }} /> Show Epics
                </label>
                <button style={{ fontSize: 12, border: `1px solid ${theme.border}`, borderRadius: 6, padding: '4px 10px', background: 'none', cursor: 'pointer', color: theme.subText }}>Export</button>
            </div>

            {/* Timeline header */}
            <div id="roadmap-timeline-header" style={{ backgroundColor: theme.timelineHeaderBg, borderBottom: `2px solid ${theme.border}`, display: 'flex', position: 'sticky', top: 0, zIndex: 5 }}>
                <div style={{ width: SIZES.roadmapLeftColWidth, flexShrink: 0, padding: '8px 24px', fontSize: 11, fontWeight: 700, color: theme.muted, letterSpacing: '0.06em', borderRight: `1px solid ${theme.border}` }}>INITIATIVE</div>
                <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
                    {quarters.map((q, i) => (
                        <div key={q} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: theme.muted, fontWeight: 600, padding: '8px 0', borderLeft: i > 0 ? `1px solid ${theme.border}` : 'none' }}>{q}</div>
                    ))}
                    <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 2, backgroundColor: COLORS.walmartBlue, zIndex: 2 }} />
                    <div style={{ position: 'absolute', left: `${todayPct}%`, bottom: 0, transform: 'translateX(-50%)', backgroundColor: COLORS.walmartBlue, color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: '3px 3px 0 0', letterSpacing: '0.05em', zIndex: 3 }}>TODAY</div>
                </div>
            </div>

            {/* Initiative Group 1 */}
            <div id="initiative-row-1" style={{ borderBottom: `2px solid ${theme.border}` }}>
                <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.rowGroupBg }}>
                    <div style={{ width: SIZES.roadmapLeftColWidth, flexShrink: 0, padding: '10px 24px', fontSize: 13, fontWeight: 600, color: theme.text, borderRight: `1px solid ${theme.border}` }}>
                        ▼ Modernize Replenishment Planning, Order Management and Inventory systems
                    </div>
                    <div style={{ flex: 1 }} />
                </div>
                <InitiativeRow
                    leftContent={
                        <div style={{ padding: '6px 16px 6px 36px', fontSize: 12, color: theme.subText }}>
                            <div style={{ marginBottom: 2, fontWeight: 500 }}>ENB-0388: Enable inventory management modernizations with near-real-time inventory</div>
                            <div style={{ color: theme.muted, fontSize: 11 }}>1 capability</div>
                        </div>
                    }
                    timelineContent={
                        <TimelineRow
                            id="bar-dynamic-routing"
                            left={0} width={qw * 3}
                            color={COLORS.roadmapBarGreen}
                            badge="Develop (Committed)" badgeColor="green"
                            label="Dynamic Routing ML Model" subLabel="L - 3 Quarters"
                            onEnter={e => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setDetailBar({ x: r.left, y: r.top, h: r.height });
                            }}
                        />
                    }
                />
                <InitiativeRow
                    leftContent={
                        <div style={{ padding: '6px 16px 6px 36px', fontSize: 12, color: theme.subText }}>
                            <div style={{ marginBottom: 2, fontWeight: 500 }}>ENB-0393: PO Modernization through Order Central and SPIRE</div>
                            <div style={{ color: theme.muted, fontSize: 11 }}>1 capability</div>
                        </div>
                    }
                    timelineContent={
                        <TimelineRow
                            left={qw * 2} width={qw}
                            color={COLORS.roadmapBarGrey}
                            label="Perishable Market" subLabel="L - 12 wks"
                        />
                    }
                />
                <InitiativeRow
                    leftContent={
                        <div style={{ padding: '6px 16px 6px 36px', fontSize: 12, color: theme.subText }}>
                            <div style={{ marginBottom: 2, fontWeight: 500 }}>ENB-0401: Real-time shelf demand signal integration</div>
                            <div style={{ color: theme.muted, fontSize: 11 }}>2 capabilities</div>
                        </div>
                    }
                    timelineContent={
                        <TimelineRow
                            left={qw * 1} width={qw * 2}
                            color={COLORS.roadmapBarDiscover}
                            badge="Discover" badgeColor="teal"
                            label="Demand Signal Ingestion" subLabel="M - 2 Quarters"
                        />
                    }
                />
            </div>

            {/* Initiative Group 2 */}
            <div id="initiative-row-2" style={{ borderBottom: `2px solid ${theme.border}` }}>
                <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.rowGroupBg }}>
                    <div style={{ width: SIZES.roadmapLeftColWidth, flexShrink: 0, padding: '10px 24px', fontSize: 13, fontWeight: 600, color: theme.text, borderRight: `1px solid ${theme.border}` }}>
                        ▼ 1-Click automated setup of entire supplier catalogs
                    </div>
                    <div style={{ flex: 1 }} />
                </div>
                <InitiativeRow
                    leftContent={
                        <div style={{ padding: '6px 16px 6px 36px', fontSize: 12, color: theme.subText }}>
                            <div style={{ marginBottom: 2, fontWeight: 500 }}>ENB-0412: Supplier catalog ingestion pipeline</div>
                            <div style={{ color: theme.muted, fontSize: 11 }}>1 capability</div>
                        </div>
                    }
                    timelineContent={
                        <TimelineRow
                            id="bar-supplier-setup"
                            left={0} width={qw}
                            color="transparent" dashed
                            badge="Backlog" badgeColor="grey"
                            label="Solving all Transp…"
                        />
                    }
                />
                <InitiativeRow
                    leftContent={
                        <div style={{ padding: '6px 16px 6px 36px', fontSize: 12, color: theme.subText }}>
                            <div style={{ marginBottom: 2, fontWeight: 500 }}>ENB-0418: Supplier portal onboarding redesign</div>
                            <div style={{ color: theme.muted, fontSize: 11 }}>3 capabilities</div>
                        </div>
                    }
                    timelineContent={
                        <TimelineRow
                            left={qw * 3} width={qw * 2}
                            color={COLORS.roadmapBarDefine}
                            badge="Define" badgeColor="yellow"
                            label="Supplier Portal v2" subLabel="XL - 6 Quarters"
                        />
                    }
                />
            </div>

            {/* Initiative Group 3 */}
            <div id="initiative-row-3" style={{ borderBottom: `2px solid ${theme.border}` }}>
                <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.rowGroupBg }}>
                    <div style={{ width: SIZES.roadmapLeftColWidth, flexShrink: 0, padding: '10px 24px', fontSize: 13, fontWeight: 600, color: theme.text, borderRight: `1px solid ${theme.border}` }}>
                        ▼ Transform - Associate Intelligence
                    </div>
                    <div style={{ flex: 1 }} />
                </div>
                <InitiativeRow
                    leftContent={
                        <div style={{ padding: '6px 16px 6px 36px', fontSize: 12, color: theme.subText }}>
                            <div style={{ marginBottom: 2, fontWeight: 500 }}>ENB-0427: Associate task prioritization AI engine</div>
                            <div style={{ color: theme.muted, fontSize: 11 }}>2 capabilities</div>
                        </div>
                    }
                    timelineContent={
                        <TimelineRow
                            left={qw * 1} width={qw * 3}
                            color={COLORS.roadmapBarGreen}
                            badge="Develop (Committed)" badgeColor="green"
                            label="AI Task Scheduler" subLabel="L - 3 Quarters"
                        />
                    }
                />
                <InitiativeRow
                    leftContent={
                        <div style={{ padding: '6px 16px 6px 36px', fontSize: 12, color: theme.subText }}>
                            <div style={{ marginBottom: 2, fontWeight: 500 }}>ENB-0433: Workload balancing across store departments</div>
                            <div style={{ color: theme.muted, fontSize: 11 }}>1 capability</div>
                        </div>
                    }
                    timelineContent={
                        <TimelineRow
                            left={qw * 4} width={qw * 2}
                            color={COLORS.roadmapBarDiscover}
                            badge="Discover" badgeColor="teal"
                            label="Store Load Balancer" subLabel="M - 2 Quarters"
                        />
                    }
                />
            </div>

        </div>
    );
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
    const [allFeedback, setAllFeedback] = useState([]);
    const [allPlans, setAllPlans] = useState([]);
    const [checkedIds, setCheckedIds] = useState(new Set());
    const [pushing, setPushing] = useState(false);
    const [selectedAction, setSelectedAction] = useState('Code Change');
    const ACTION_COLORS = {
        'Code Change':   { bg: '#111827', hover: '#374151' },
        'Create Tasks':  { bg: '#0891b2', hover: '#0e7490' },
        'Generate Spec': { bg: '#7c3aed', hover: '#6d28d9' },
        'Email Summary': { bg: '#d97706', hover: '#b45309' },
    };
    const ACTION_TOOLTIPS = {
        'Code Change':   'Deploy visual changes to the canvas via Claude Code',
        'Create Tasks':  'Generate a numbered task list from the selected feedback',
        'Generate Spec': 'Write a product spec in markdown from the selected feedback',
        'Email Summary': 'Compose a stakeholder email summarizing the feedback',
    };
    const actionColor = ACTION_COLORS[selectedAction] || ACTION_COLORS['Code Change'];
    const [reverting, setReverting] = useState(null);
    const [revertedIds, setRevertedIds] = useState(() => {
        try {
            const raw = localStorage.getItem('fb-reverted-plans');
            return raw ? new Set(JSON.parse(raw)) : new Set();
        // eslint-disable-next-line no-unused-vars
        } catch (_) { return new Set(); }
    });
    const [fabOpen, setFabOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('capture');
    const fabRef = useRef(null);

    // Poll both tables on mount and every POLL_INTERVAL ms
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const [fb, plans] = await Promise.all([
                    listRecords(FEEDBACK_TABLE),
                    listRecords(PLANS_TABLE),
                ]);
                if (!cancelled) {
                    setAllFeedback(fb);
                    setAllPlans(plans);
                }
            } catch (err) {
                console.error('Poll error:', err);
            }
        }
        load();
        const id = setInterval(load, POLL_INTERVAL);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    // Auto-reload when Vercel deploys a new version
    useEffect(() => {
        let currentVersion = null;
        async function checkVersion() {
            try {
                const res = await fetch('/api/version');
                const { v } = await res.json();
                if (currentVersion === null) { currentVersion = v; return; }
                if (v !== currentVersion) setTimeout(() => window.location.reload(), 2000);
            } catch (_) {}
        }
        const id = setInterval(checkVersion, 5000);
        return () => clearInterval(id);
    }, []);

    // Click outside FAB panel to close
    useEffect(() => {
        if (!fabOpen) return;
        function handleClick(e) {
            if (fabRef.current && !fabRef.current.contains(e.target)) {
                setFabOpen(false);
            }
        }
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [fabOpen]);

    const sortedPlans = [...allPlans].sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    const executingPlan = sortedPlans.find(p => (p.fields['Plan Status'] || '') === 'Executing') || null;

    const openFeedback = allFeedback.filter(r => {
        const linked = r.fields['Version'];
        return !linked || linked.length === 0;
    });

    const executingItems = executingPlan
        ? allFeedback.filter(r => matchesRecordId(r.fields['Version'], executingPlan.id))
        : [];

    const allChecked = openFeedback.length > 0 && checkedIds.size === openFeedback.length;

    function toggleChecked(id) {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleAll() {
        if (openFeedback.length > 0 && checkedIds.size === openFeedback.length) {
            setCheckedIds(new Set());
        } else {
            setCheckedIds(new Set(openFeedback.map(r => r.id)));
        }
    }

    async function handlePushPlan() {
        if (checkedIds.size === 0 || pushing) return;
        setPushing(true);
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const planId = await createRecord(PLANS_TABLE, {
            'Plan Name': `Plan — ${dateStr}, ${timeStr}`,
            'Plan Status': 'New',
            'Action Type': selectedAction,
            'Action Status': 'Pending',
            'Canvas Component': CANVAS_COMPONENT,
            'Source Interface': 'web',
        });
        const updates = [...checkedIds].map(id => {
            const record = openFeedback.find(r => r.id === id);
            if (!record) return Promise.resolve();
            return updateRecord(FEEDBACK_TABLE, record.id, { 'Version': [planId] });
        });
        await Promise.all(updates);
        if (selectedAction === 'Code Change') {
            await updateRecord(PLANS_TABLE, planId, { 'Execute': true });
        } else {
            await updateRecord(PLANS_TABLE, planId, { 'Action Status': 'Running' });
        }
        setCheckedIds(new Set());
        setSelectedAction('Code Change');
        setPushing(false);
        handleRefresh();
        setActiveTab('log');
    }

    async function handleRevert(plan) {
        if (reverting) return;
        setReverting(plan.id);
        try {
            await updateRecord(PLANS_TABLE, plan.id, { 'Revert': true, 'Plan Status': 'Reverting' });
            setRevertedIds(prev => {
                const next = new Set([...prev, plan.id]);
                // eslint-disable-next-line no-unused-vars
                try { localStorage.setItem('fb-reverted-plans', JSON.stringify([...next])); } catch (e) { /* storage unavailable */ }
                return next;
            });
            await new Promise(r => setTimeout(r, 1500));
        } finally {
            setReverting(null);
        }
    }

    function handleRefresh() {
        listRecords(FEEDBACK_TABLE).then(fb => setAllFeedback(fb)).catch(() => {});
        listRecords(PLANS_TABLE).then(plans => setAllPlans(plans)).catch(() => {});
    }

    return (
        <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            {/* Full-viewport demo canvas */}
            <div
                id="page-background"
                style={{
                    width: '100%', height: '100%',
                    overflow: 'auto',
                }}
            >
                <WalmartRoadmapCard />
            </div>

            {/* ── Floating Action Bar ── */}
            <div
                data-feedback-panel="true"
                ref={fabRef}
                style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 1000 }}
            >
                {/* Panel — opens upward */}
                {fabOpen && (
                    <div style={{
                        position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                        width: 300, maxHeight: 480,
                        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        backgroundColor: '#ffffff',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}>
                        {/* Tab bar */}
                        <div style={{ display: 'flex', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                            {[
                                { id: 'capture', label: 'Capture', badge: null },
                                { id: 'queue', label: 'Queue', badge: openFeedback.length || null },
                                { id: 'log', label: 'Log', badge: null },
                            ].map(({ id, label, badge }) => (
                                <button key={id} onClick={() => setActiveTab(id)} style={{
                                    flex: 1, padding: '9px 4px', fontSize: 12,
                                    fontWeight: activeTab === id ? 700 : 500,
                                    color: activeTab === id ? '#111827' : '#6b7280',
                                    background: 'none', border: 'none',
                                    borderBottom: `2px solid ${activeTab === id ? '#111827' : 'transparent'}`,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                }}>
                                    {label}
                                    {badge != null && badge > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 600,
                                            backgroundColor: activeTab === id ? '#111827' : '#e5e7eb',
                                            color: activeTab === id ? '#fff' : '#374151',
                                            borderRadius: 999, padding: '1px 5px', lineHeight: '14px',
                                        }}>
                                            {badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Capture tab */}
                        {activeTab === 'capture' && (
                            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                                <FeedbackForm onCreated={() => setActiveTab('queue')} />
                            </div>
                        )}

                        {/* Queue tab */}
                        {activeTab === 'queue' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                {/* Select all */}
                                {openFeedback.length > 0 && (
                                    <div
                                        onClick={toggleAll}
                                        style={{
                                            padding: '7px 12px', borderBottom: '1px solid #f3f4f6',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div style={{
                                            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                            border: `2px solid ${allChecked ? '#2563eb' : '#d1d5db'}`,
                                            backgroundColor: allChecked ? '#2563eb' : '#ffffff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {allChecked && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1 }}>✓</span>}
                                        </div>
                                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                                            {checkedIds.size} of {openFeedback.length} selected
                                        </span>
                                    </div>
                                )}
                                {/* List */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                                    <OpenFeedbackList
                                        openFeedback={openFeedback}
                                        checkedIds={checkedIds}
                                        onToggle={toggleChecked}
                                        onRefresh={handleRefresh}
                                    />
                                </div>
                                {/* Footer */}
                                <div style={{
                                    padding: '8px 12px',
                                    borderTop: checkedIds.size > 0 ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                    flexShrink: 0,
                                }}>
                                    {executingPlan ? (
                                        <span style={{ fontSize: 12, color: '#d97706', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 2 }}>
                                            Applying {executingItems.length} change{executingItems.length !== 1 ? 's' : ''}<AnimatedDots />
                                        </span>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                                            {/* Action type pills */}
                                            {checkedIds.size > 0 && (
                                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                                    {['Code Change', 'Create Tasks', 'Generate Spec', 'Email Summary'].map(action => {
                                                        const active = selectedAction === action;
                                                        return (
                                                            <button
                                                                key={action}
                                                                onClick={() => setSelectedAction(action)}
                                                                title={ACTION_TOOLTIPS[action]}
                                                                style={{
                                                                    fontSize: 11, fontWeight: active ? 600 : 500,
                                                                    backgroundColor: active ? '#111827' : '#f9fafb',
                                                                    color: active ? '#ffffff' : '#374151',
                                                                    border: `1px solid ${active ? '#111827' : '#d1d5db'}`,
                                                                    borderRadius: 999, padding: '3px 10px',
                                                                    cursor: 'pointer', transition: 'all 0.1s', whiteSpace: 'nowrap',
                                                                }}
                                                            >
                                                                {action === 'Code Change' ? '⚡ ' : action === 'Create Tasks' ? '+ ' : action === 'Generate Spec' ? '📄 ' : '✉ '}
                                                                {action}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {/* Push button */}
                                            <button
                                                id="push-plan-button"
                                                onClick={handlePushPlan}
                                                disabled={checkedIds.size === 0 || pushing}
                                                style={{
                                                    backgroundColor: (checkedIds.size > 0 && !pushing) ? actionColor.bg : COLORS.pushPlanDisabledBg,
                                                    color: (checkedIds.size > 0 && !pushing) ? COLORS.pushPlanText : COLORS.pushPlanDisabledText,
                                                    border: 'none', borderRadius: SIZES.inputRadius,
                                                    padding: '8px 14px', fontSize: 13, fontWeight: 600,
                                                    cursor: (checkedIds.size > 0 && !pushing) ? 'pointer' : 'not-allowed',
                                                    whiteSpace: 'nowrap', transition: 'background-color 0.12s', width: '100%',
                                                }}
                                                onMouseEnter={e => { if (checkedIds.size > 0 && !pushing) e.currentTarget.style.backgroundColor = actionColor.hover; }}
                                                onMouseLeave={e => { if (checkedIds.size > 0 && !pushing) e.currentTarget.style.backgroundColor = actionColor.bg; }}
                                            >
                                                {pushing ? 'Pushing…' : `Push — ${selectedAction}`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Log tab */}
                        {activeTab === 'log' && (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                                <VersionsList
                                    plans={sortedPlans}
                                    allFeedback={allFeedback}
                                    reverting={reverting}
                                    revertedIds={revertedIds}
                                    onRevert={handleRevert}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* FAB pill button */}
                <button
                    onClick={() => setFabOpen(o => !o)}
                    style={{
                        backgroundColor: '#111827', color: '#ffffff',
                        border: 'none', borderRadius: 999,
                        padding: '9px 16px', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', userSelect: 'none',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
                        display: 'flex', alignItems: 'center', gap: 6,
                        transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.25)'; }}
                >
                    <span>✦</span>
                    <span>Feedback</span>
                    {executingPlan && (
                        <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center' }}>
                            · Applying<AnimatedDots />
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}
