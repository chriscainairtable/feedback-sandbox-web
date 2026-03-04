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
    primary: 'red',
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

};

// Expose to window so snip context extraction can embed current design tokens
window.__COLORS__ = COLORS;
window.__SIZES__ = SIZES;

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

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
                fontSize: SIZES.sectionLabelFontSize, fontWeight: 700,
                color: COLORS.sectionHeadingText, letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
                {label}
            </span>
            {count != null && (
                <span style={{
                    fontSize: 11, fontWeight: 600,
                    backgroundColor: '#e5e7eb', color: '#374151',
                    borderRadius: 999, padding: '1px 7px',
                }}>
                    {count}
                </span>
            )}
        </div>
    );
}

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

    const canSubmit = !submitting && text.trim().length > 0 && priority !== null;

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
            ...(priority ? { 'Priority': priority } : {}),
            ...(snipContext ? { 'Snip Context': JSON.stringify(snipContext) } : {}),
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
                            fontSize: 10, fontWeight: 700, color: priority ? COLORS.sectionSubText : '#ef4444',
                            letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>
                            Priority *
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
            </div>,
            document.body
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {versionPlans.map(plan => {
                const status = plan.fields['Plan Status'] || '';
                const planName = plan.fields['Plan Name'] || '';
                const isExecuting = status === 'Executing';
                const isReverting = status === 'Reverting';
                const isDone = status === 'Done' || status === 'Approved';
                const isQueued = status === 'New';
                const isReverted = status === 'Reverted' || revertedIds.has(plan.id);
                const canRevert = !isReverted && !isReverting && (revertablePlan?.id === plan.id || isQueued);

                const items = allFeedback.filter(r => matchesRecordId(r.fields['Version'], plan.id));
                const borderColor = isExecuting || isReverting ? '#fde68a' : isReverted ? '#e5e7eb' : isDone ? '#bbf7d0' : isQueued ? '#e5e7eb' : '#fecaca';
                const headerBg   = isExecuting || isReverting ? '#fffbeb' : isReverted ? '#f9fafb' : isDone ? '#f0fdf4' : isQueued ? '#f9fafb' : '#fef2f2';
                const badgeColor = isExecuting || isReverting ? '#92400e' : isReverted ? '#6b7280' : isDone ? '#166534' : isQueued ? '#6b7280' : '#991b1b';
                return (
                    <div key={plan.id} style={{ border: `1px solid ${borderColor}`, borderRadius: 8, overflow: 'hidden' }}>
                        {/* Plan header row */}
                        <div
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', backgroundColor: headerBg }}
                            onMouseEnter={e => {
                                const summary = getFieldValue(plan.fields['UI Change Summary']) || '';
                                if (!summary) return;
                                const r = e.currentTarget.getBoundingClientRect();
                                setPlanTooltip({ text: summary, x: r.right + 8, y: r.top });
                            }}
                            onMouseLeave={() => setPlanTooltip(null)}
                        >
                            <span className={isQueued ? 'badge-queued' : undefined}
                                style={{ fontSize: 10, fontWeight: 700, color: badgeColor, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                                {isExecuting ? <>Applying<AnimatedDots /></> : isReverting ? <>Reverting<AnimatedDots /></> : isReverted ? '↩ Reverted' : isDone ? '✓ Done' : isQueued ? '● Queued' : '✗ Failed'}
                            </span>
                            <span style={{
                                fontSize: 11, color: '#6b7280', flex: 1, minWidth: 0,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {planName}
                            </span>
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
                    </div>
                );
            })}
        </div>
        </>
    );
}

// ─── Acme Landing Card ─────────────────────────────────────────────────────────

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

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
    const [allFeedback, setAllFeedback] = useState([]);
    const [allPlans, setAllPlans] = useState([]);
    const [checkedIds, setCheckedIds] = useState(new Set());
    const [pushing, setPushing] = useState(false);
    const [reverting, setReverting] = useState(null);
    const [revertedIds, setRevertedIds] = useState(() => {
        try {
            const raw = localStorage.getItem('fb-reverted-plans');
            return raw ? new Set(JSON.parse(raw)) : new Set();
        // eslint-disable-next-line no-unused-vars
        } catch (_) { return new Set(); }
    });

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

    const sortedPlans = [...allPlans].sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    const executingPlan = sortedPlans.find(p => (p.fields['Plan Status'] || '') === 'Executing') || null;

    // Only show items that haven't been linked to a plan yet
    const openFeedback = allFeedback.filter(r => {
        const linked = r.fields['Version'];
        return !linked || linked.length === 0;
    });

    const executingItems = executingPlan
        ? allFeedback.filter(r => matchesRecordId(r.fields['Version'], executingPlan.id))
        : [];

    function toggleChecked(id) {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handlePushPlan() {
        if (checkedIds.size === 0 || pushing) return;
        setPushing(true);

        // Always create a new plan record for each push
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const planId = await createRecord(PLANS_TABLE, {
            'Plan Name': `Plan — ${dateStr}, ${timeStr}`,
            'Plan Status': 'New',
        });

        // Bundle checked feedback items to the plan
        const updates = [...checkedIds].map(id => {
            const record = openFeedback.find(r => r.id === id);
            if (!record) return Promise.resolve();
            return updateRecord(FEEDBACK_TABLE, record.id, { 'Version': [planId] });
        });
        await Promise.all(updates);

        // Execute the plan
        await updateRecord(PLANS_TABLE, planId, { 'Execute': true });
        setCheckedIds(new Set());
        setPushing(false);
    }

    async function handleRevert(plan) {
        if (reverting) return;
        setReverting(plan.id);
        try {
            await updateRecord(PLANS_TABLE, plan.id, { 'Revert': true });
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

    // Trigger an immediate re-poll after a create/edit/delete
    function handleRefresh() {
        listRecords(FEEDBACK_TABLE).then(fb => setAllFeedback(fb)).catch(() => {});
        listRecords(PLANS_TABLE).then(plans => setAllPlans(plans)).catch(() => {});
    }

    return (
        <div style={{
            display: 'flex', height: '100vh', overflow: 'hidden',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}>
            {/* ── Left pane ── */}
            <div data-feedback-panel="true" style={{
                width: SIZES.leftPaneWidth, flexShrink: 0,
                backgroundColor: COLORS.leftBg,
                borderRight: `1px solid ${COLORS.leftBorder}`,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                {/* Add Feedback */}
                <div style={{ padding: SIZES.leftPadding, borderBottom: `1px solid ${COLORS.leftBorder}`, flexShrink: 0 }}>
                    <div style={{ marginBottom: SIZES.sectionHeaderGap }}>
                        <SectionHeader label="Add Feedback" />
                    </div>
                    <FeedbackForm onCreated={handleRefresh} />
                </div>

                {/* Open Feedback + Versions — scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: SIZES.leftPadding, borderBottom: `1px solid ${COLORS.leftBorder}` }}>
                        <div style={{ marginBottom: SIZES.sectionHeaderGap }}>
                            <SectionHeader label="Open Feedback" count={openFeedback.length} />
                        </div>
                        <OpenFeedbackList
                            openFeedback={openFeedback}
                            checkedIds={checkedIds}
                            onToggle={toggleChecked}
                            onRefresh={handleRefresh}
                        />
                    </div>
                    <div style={{ padding: SIZES.leftPadding }}>
                        <div style={{ marginBottom: SIZES.sectionHeaderGap }}>
                            <SectionHeader label="Versions" />
                        </div>
                        <VersionsList
                            plans={sortedPlans}
                            allFeedback={allFeedback}
                            reverting={reverting}
                            revertedIds={revertedIds}
                            onRevert={handleRevert}
                        />
                    </div>
                </div>

                {/* Footer — sticky bottom */}
                <div style={{
                    padding: `10px ${SIZES.leftPadding}px`, borderTop: checkedIds.size > 0 ? '2px solid #2563eb' : `1px solid ${COLORS.leftBorder}`,
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    minHeight: 44,
                }}>
                    {executingPlan ? (
                        <span style={{ fontSize: 12, color: '#d97706', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 2 }}>
                            Applying {executingItems.length} change{executingItems.length !== 1 ? 's' : ''}<AnimatedDots />
                        </span>
                    ) : (
                        <>
                            <span style={{ fontSize: 12, color: checkedIds.size > 0 ? COLORS.sectionSubText : '#9ca3af', whiteSpace: 'nowrap' }}>
                                {checkedIds.size > 0 ? `${checkedIds.size} of ${openFeedback.length} selected` : 'Select items to push'}
                            </span>
                            <button
                                id="push-plan-button"
                                onClick={handlePushPlan}
                                disabled={checkedIds.size === 0 || pushing}
                                style={{
                                    backgroundColor: (checkedIds.size > 0 && !pushing) ? COLORS.pushPlanBg : COLORS.pushPlanDisabledBg,
                                    color: (checkedIds.size > 0 && !pushing) ? COLORS.pushPlanText : COLORS.pushPlanDisabledText,
                                    border: 'none', borderRadius: SIZES.inputRadius,
                                    padding: '7px 14px', fontSize: 13, fontWeight: 600,
                                    cursor: (checkedIds.size > 0 && !pushing) ? 'pointer' : 'not-allowed',
                                    whiteSpace: 'nowrap', transition: 'background-color 0.12s',
                                }}
                                onMouseEnter={e => { if (checkedIds.size > 0 && !pushing) e.currentTarget.style.backgroundColor = COLORS.pushPlanHover; }}
                                onMouseLeave={e => { if (checkedIds.size > 0 && !pushing) e.currentTarget.style.backgroundColor = COLORS.pushPlanBg; }}
                            >
                                {pushing ? 'Pushing…' : 'Push Changes'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Right pane ── */}
            <div
                id="page-background"
                style={{
                    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    backgroundColor: COLORS.background,
                }}
            >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'auto', minHeight: 0 }}>
                    <AcmeLandingCard />
                </div>
            </div>
        </div>
    );
}
