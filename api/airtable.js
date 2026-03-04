import * as Sentry from '@sentry/node';
Sentry.init({ dsn: process.env.SENTRY_DSN_SERVER });

const PAT = process.env.AIRTABLE_PAT;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!PAT || !BASE_ID) {
        return res.status(500).json({ error: 'Server not configured — AIRTABLE_PAT and AIRTABLE_BASE_ID must be set' });
    }

    const { action, table, recordId, fields, listOptions = {} } = req.body;

    const tableEncoded = encodeURIComponent(table);
    const tableUrl = `https://api.airtable.com/v0/${BASE_ID}/${tableEncoded}`;
    const authHeader = { Authorization: `Bearer ${PAT}` };

    try {
        if (action === 'create') {
            const r = await fetch(tableUrl, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields }),
            });
            const data = await r.json();
            if (!r.ok) return res.status(r.status).json(data);
            return res.json({ id: data.id });

        } else if (action === 'update') {
            const r = await fetch(`${tableUrl}/${recordId}`, {
                method: 'PATCH',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields }),
            });
            const data = await r.json();
            if (!r.ok) return res.status(r.status).json(data);
            return res.json(data);

        } else if (action === 'delete') {
            const r = await fetch(`${tableUrl}/${recordId}`, {
                method: 'DELETE',
                headers: authHeader,
            });
            const data = await r.json();
            if (!r.ok) return res.status(r.status).json(data);
            return res.json(data);

        } else if (action === 'list') {
            const allRecords = [];
            let offset = null;

            do {
                const url = new URL(tableUrl);
                if (listOptions.fields) {
                    listOptions.fields.forEach(f => url.searchParams.append('fields[]', f));
                }
                if (listOptions.sort) {
                    listOptions.sort.forEach((s, i) => {
                        url.searchParams.append(`sort[${i}][field]`, s.field);
                        url.searchParams.append(`sort[${i}][direction]`, s.direction || 'asc');
                    });
                }
                if (listOptions.filterByFormula) {
                    url.searchParams.set('filterByFormula', listOptions.filterByFormula);
                }
                if (offset) url.searchParams.set('offset', offset);

                const r = await fetch(url.toString(), { headers: authHeader });
                const data = await r.json();
                if (!r.ok) return res.status(r.status).json(data);

                allRecords.push(...data.records);
                offset = data.offset || null;
            } while (offset);

            return res.json({ records: allRecords });

        } else {
            return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (err) {
        Sentry.captureException(err);
        return res.status(500).json({ error: err.message });
    }
}
