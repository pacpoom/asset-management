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

const THAI_NUMBERS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_UNITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
const THAI_MILLION = 'ล้าน';

/** Integer part only (digits string), Thai wording; empty string if value is zero. */
function thaiConvertInteger(numStr: string): string {
	let result = '';
	const len = numStr.length;
	if (len > 7) {
		const millionsPart = numStr.substring(0, len - 6);
		const restPart = numStr.substring(len - 6);
		result = thaiConvertInteger(millionsPart) + THAI_MILLION + thaiConvertInteger(restPart);
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

/** Two-digit fractional part (00–99), Thai wording; empty if 00. */
function thaiConvertTwoDigits(numStr: string): string {
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

/** Thai baht / satang (same rules as legacy purchase PDF). */
function bahttext(input: number | string): string {
	let num = parseFloat(String(input));
	if (isNaN(num)) {
		num = 0;
	}

	const numberStr = num.toFixed(2);
	const [integerPart, decimalPart] = numberStr.split('.');

	const integerText = thaiConvertInteger(integerPart) || 'ศูนย์';
	const decimalText = thaiConvertTwoDigits(decimalPart);
	return decimalText ? `${integerText}บาท${decimalText}สตางค์` : `${integerText}บาทถ้วน`;
}

/** USD / CNY amount in Thai words (e.g. ห้าพันหนึ่งร้อยดอลลาร์สหรัฐถ้วน). */
function thaiUsdCnyInWords(amount: number, currency: 'USD' | 'CNY'): string {
	let num = parseFloat(String(amount));
	if (isNaN(num)) num = 0;
	const numberStr = num.toFixed(2);
	const [integerPart, decimalPart] = numberStr.split('.') as [string, string];
	const integerText = thaiConvertInteger(integerPart) || 'ศูนย์';
	const minorText = thaiConvertTwoDigits(decimalPart);
	if (currency === 'USD') {
		return minorText
			? `${integerText}ดอลลาร์สหรัฐ${minorText}เซ็นต์`
			: `${integerText}ดอลลาร์สหรัฐถ้วน`;
	}
	return minorText ? `${integerText}หยวนจีน${minorText}เฟิน` : `${integerText}หยวนจีนถ้วน`;
}

/**
 * Amount in words for purchase PDF / UI.
 * THB: Thai (บาท/สตางค์). USD/CNY: Thai wording (ดอลลาร์สหรัฐ/เซ็นต์, หยวนจีน/เฟิน).
 */
export function purchaseAmountInWords(
	amount: number,
	currency: PurchaseDocumentCurrency
): string {
	const c = normalizePurchaseDocumentCurrency(currency);
	if (c === 'THB') return bahttext(amount);
	if (c === 'USD') return thaiUsdCnyInWords(amount, 'USD');
	return thaiUsdCnyInWords(amount, 'CNY');
}
