// Airtable AI field utilities
// AI fields return {state, value, isStale} instead of plain strings.
// Direct access causes React error #31. ALWAYS use these helpers.

export const getFieldValue = (field) => {
    if (!field) return null;
    if (typeof field === 'object' && 'value' in field) return field.value || null;
    return field;
};

export const isFieldReady = (field) => {
    if (!field) return false;
    if (typeof field === 'object') return field.state === 'generated' && !!field.value;
    return !!field;
};

export const isFieldGenerating = (field) => {
    if (!field) return false;
    if (typeof field === 'object') return field.state === 'loading' || (field.state !== 'generated' && !field.value);
    return false;
};

// Linked record filter helper
// REST API returns linked fields as plain string arrays ['recXXX'], not [{id, name}] objects.
// Use this instead of .some(s => s.id === id) which always returns false against strings.
export const matchesRecordId = (linkedField, recordId) => {
    if (!linkedField || !Array.isArray(linkedField)) return false;
    return linkedField.some(s => (typeof s === 'string' ? s : s.id) === recordId);
};
