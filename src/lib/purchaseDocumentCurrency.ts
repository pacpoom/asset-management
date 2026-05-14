export type PurchaseDocumentCurrency = 'THB' | 'USD' | 'CNY';

const ALLOWED = new Set<string>(['THB', 'USD', 'CNY']);

export function normalizePurchaseDocumentCurrency(
	v: string | null | undefined
): PurchaseDocumentCurrency {
	const c = String(v ?? 'THB')
		.trim()
		.toUpperCase();
	if (ALLOWED.has(c)) return c as PurchaseDocumentCurrency;
	return 'THB';
}

/** Intl formatting for purchase UI / PDF numeric columns */
export function formatPurchaseDocumentCurrency(
	amount: number,
	currency: PurchaseDocumentCurrency,
	locale: string
): string {
	const n = Number(amount);
	if (!Number.isFinite(n)) {
		return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(0);
	}
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(n);
}

/** Thai baht / satang (same rules as legacy purchase PDF). */
function bahttext(input: number | string): string {
	let num = parseFloat(String(input));
	if (isNaN(num)) {
		num = 0;
	}
	const THAI_NUMBERS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
	const THAI_UNITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
	const THAI_MILLION = 'ล้าน';

	const numberStr = num.toFixed(2);
	const [integerPart, decimalPart] = numberStr.split('.');

	function convertInteger(numStr: string): string {
		let result = '';
		const len = numStr.length;
		if (len > 7) {
			const millionsPart = numStr.substring(0, len - 6);
			const restPart = numStr.substring(len - 6);
			result = convertInteger(millionsPart) + THAI_MILLION + convertInteger(restPart);
		} else {
			for (let i = 0; i < len; i++) {
				const digit = parseInt(numStr[i]!);
				const unitIndex = len - 1 - i;
				if (digit === 0) continue;
				if (digit === 1) {
					if (unitIndex === 1) result += 'สิบ';
					else if (unitIndex === 0 && len > 1) result += 'เอ็ด';
					else result += THAI_NUMBERS[digit] + THAI_UNITS[unitIndex];
				} else if (digit === 2 && unitIndex === 1) {
					result += 'ยี่สิบ';
				} else {
					result += THAI_NUMBERS[digit] + THAI_UNITS[unitIndex];
				}
			}
		}
		return result;
	}

	function convertDecimal(numStr: string): string {
		if (numStr === '00') return '';
		let result = '';
		let ns = numStr;
		if (ns.length === 1) ns += '0';
		if (ns[0] === '1') result += ns.length > 1 && ns[1] !== '0' ? 'สิบ' : 'สิบ';
		else if (ns[0] === '2') result += 'ยี่สิบ';
		else if (ns[0] !== '0') result += THAI_NUMBERS[parseInt(ns[0]!)] + 'สิบ';

		if (ns[1] === '1' && ns[0] !== '0' && ns[0] !== '1') result += 'เอ็ด';
		else if (ns[1] !== '0') result += THAI_NUMBERS[parseInt(ns[1]!)];

		return result;
	}

	const integerText = convertInteger(integerPart) || 'ศูนย์';
	const decimalText = convertDecimal(decimalPart);
	return decimalText ? `${integerText}บาท${decimalText}สตางค์` : `${integerText}บาทถ้วน`;
}

const EN_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const EN_TEENS = [
	'Ten',
	'Eleven',
	'Twelve',
	'Thirteen',
	'Fourteen',
	'Fifteen',
	'Sixteen',
	'Seventeen',
	'Eighteen',
	'Nineteen'
];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function under100English(n: number): string {
	if (n < 10) return EN_ONES[n]!;
	if (n < 20) return EN_TEENS[n - 10]!;
	const t = Math.floor(n / 10);
	const o = n % 10;
	return EN_TENS[t]! + (o ? ' ' + EN_ONES[o] : '');
}

function under1000English(n: number): string {
	const h = Math.floor(n / 100);
	const r = n % 100;
	const parts: string[] = [];
	if (h) parts.push(`${EN_ONES[h]} Hundred`);
	if (r) parts.push(under100English(r));
	return parts.join(' ');
}

/** Integer 0 .. 999_999_999_999 */
function integerToEnglishWords(n: number): string {
	if (!Number.isFinite(n) || n < 0) return 'Zero';
	const int = Math.floor(n);
	if (int === 0) return 'Zero';
	if (int >= 1e12) return String(int);

	const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
	let x = int;
	let scale = 0;
	const parts: string[] = [];

	while (x > 0) {
		const chunk = x % 1000;
		if (chunk) {
			const words = under1000English(chunk);
			const sc = scales[scale]!;
			parts.push(sc ? `${words} ${sc}`.trim() : words);
		}
		x = Math.floor(x / 1000);
		scale++;
	}

	return parts.reverse().join(' ');
}

function englishMajorMinor(
	amount: number,
	majorSingular: string,
	majorPlural: string,
	minorSingular: string,
	minorPlural: string
): string {
	const rounded = Math.round(Number(amount) * 100) / 100;
	const major = Math.floor(rounded + 1e-9);
	const minor = Math.round((rounded - major) * 100);
	const majorLabel = major === 1 ? majorSingular : majorPlural;
	const majorWords = integerToEnglishWords(major);
	if (minor <= 0) {
		return `${majorWords} ${majorLabel} Only`;
	}
	const minorLabel = minor === 1 ? minorSingular : minorPlural;
	const minorWords = integerToEnglishWords(minor);
	return `${majorWords} ${majorLabel} and ${minorWords} ${minorLabel} Only`;
}

/**
 * Amount in words for purchase PDF / UI.
 * THB: Thai (บาท/สตางค์). USD/CNY: English (Dollars/Cents, Yuan/Fen).
 */
export function purchaseAmountInWords(
	amount: number,
	currency: PurchaseDocumentCurrency
): string {
	const c = normalizePurchaseDocumentCurrency(currency);
	if (c === 'THB') return bahttext(amount);
	if (c === 'USD') return englishMajorMinor(amount, 'US Dollar', 'US Dollars', 'Cent', 'Cents');
	return englishMajorMinor(amount, 'Yuan', 'Yuan', 'Fen', 'Fen');
}
