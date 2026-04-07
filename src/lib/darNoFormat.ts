/** รูปแบบ: DAR No. GG/YYYY — แสดง GG เป็นอย่างน้อย 2 หลัก */
const DAR_NO_NEW_RE = /^DAR No\. (\d+)\/(\d{4})$/;

export function formatDarNoDisplay(darNo: string): string {
	const s = String(darNo ?? '');
	const m = s.match(DAR_NO_NEW_RE);
	if (!m) return s;
	return `DAR No. ${m[1].padStart(2, '0')}/${m[2]}`;
}
