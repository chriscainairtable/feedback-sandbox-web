// All Airtable API calls go through /api/airtable — PAT never touches the browser.

async function callProxy(body) {
    const res = await fetch('/api/airtable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Airtable proxy error (${res.status}): ${text}`);
    }
    return res.json();
}

// Create a record. Returns the new record's ID.
export async function createRecord(table, fields) {
    const data = await callProxy({ action: 'create', table, fields });
    return data.id;
}

// Update a record. Returns the updated record.
export async function updateRecord(table, recordId, fields) {
    return callProxy({ action: 'update', table, recordId, fields });
}

// Delete a record.
export async function deleteRecord(table, recordId) {
    return callProxy({ action: 'delete', table, recordId });
}

// List all records (pagination handled server-side). Returns array of { id, fields }.
export async function listRecords(table, options = {}) {
    const data = await callProxy({ action: 'list', table, listOptions: options });
    return data.records;
}
