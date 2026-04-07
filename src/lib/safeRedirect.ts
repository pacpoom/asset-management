/**
 * Same-origin path+search only — safe target after login (blocks //evil, javascript:, etc.).
 */
export function safeInternalRedirect(raw: string | null | undefined): string | null {
	if (raw == null || typeof raw !== 'string') return null;
	const s = raw.trim();
	if (!s.startsWith('/') || s.startsWith('//')) return null;
	if (s.includes('\n') || s.includes('\r')) return null;
	if (s === '/login' || s.startsWith('/login?')) return null;
	if (s.length > 2048) return null;
	return s;
}
