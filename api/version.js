export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ v: process.env.VERCEL_DEPLOYMENT_ID || 'dev' });
}
