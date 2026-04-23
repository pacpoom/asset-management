import fs from 'fs/promises';
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';

const BRAND_TEXT = 'ANJI-NYK';
const FOOTER_TEXT = 'UNCONTROLLED WHEN PRINTED, CHECK VALIDITY BEFORE USE';
const STAMP_SCALE = 0.54; // reduce by additional 10% from 0.6
const STAMP_DIAGONAL_SHIFT_PT = (2 * 72) / Math.sqrt(2); // 2 inches at 45 degrees

function getPrimaryStampRect(width: number, height: number) {
	const boxWidth = Math.min(320 * STAMP_SCALE, width * 0.43 * STAMP_SCALE);
	const boxHeight = Math.min(185 * STAMP_SCALE, height * 0.2 * STAMP_SCALE);
	const margin = Math.max(20, width * 0.03);
	const baseX = Math.min(width - boxWidth - margin, Math.max(margin, width * 0.37));
	const baseY = Math.max(42, height * 0.18);
	const x = Math.max(margin, Math.min(width - boxWidth - margin, baseX + STAMP_DIAGONAL_SHIFT_PT));
	const y = Math.max(margin, Math.min(height - boxHeight - margin, baseY + STAMP_DIAGONAL_SHIFT_PT));
	return { x, y, boxWidth, boxHeight };
}

function isPdfByName(fileName: string): boolean {
	return fileName.toLowerCase().endsWith('.pdf');
}

function fitSize(font: PDFFont, text: string, maxWidth: number, base: number, min: number): number {
	let size = base;
	while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) {
		size -= 1;
	}
	return size;
}

function drawCenteredText(
	page: PDFPage,
	font: PDFFont,
	text: string,
	size: number,
	y: number,
	boxX: number,
	boxWidth: number
) {
	const textWidth = font.widthOfTextAtSize(text, size);
	const x = boxX + (boxWidth - textWidth) / 2;
	page.drawText(text, { x, y, size, font, color: rgb(0.93, 0.08, 0.1) });
}

function drawRoundedRectBorder(
	page: PDFPage,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
) {
	const r = Math.max(0, Math.min(radius, width / 2, height / 2));
	const stroke = rgb(0.93, 0.08, 0.1);
	const steps = 8;
	const points: Array<{ x: number; y: number }> = [];
	const x2 = x + width;
	const y2 = y + height;

	const addArc = (
		cx: number,
		cy: number,
		startRad: number,
		endRad: number,
		includeStart = false
	) => {
		for (let i = includeStart ? 0 : 1; i <= steps; i++) {
			const t = i / steps;
			const a = startRad + (endRad - startRad) * t;
			points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
		}
	};

	points.push({ x: x + r, y });
	points.push({ x: x2 - r, y });
	addArc(x2 - r, y + r, -Math.PI / 2, 0);
	points.push({ x: x2, y: y2 - r });
	addArc(x2 - r, y2 - r, 0, Math.PI / 2);
	points.push({ x: x + r, y: y2 });
	addArc(x + r, y2 - r, Math.PI / 2, Math.PI);
	points.push({ x, y: y + r });
	addArc(x + r, y + r, Math.PI, (Math.PI * 3) / 2);

	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		page.drawLine({
			start: { x: a.x, y: a.y },
			end: { x: b.x, y: b.y },
			color: stroke,
			thickness: 1.8
		});
	}
}

function drawControlledBox(
	page: PDFPage,
	font: PDFFont,
	mainText: string,
	subText: string | null,
	options: {
		x: number;
		y: number;
		width: number;
		height: number;
		opacity?: number;
		secondLineText?: string;
	}
) {
	const { x, y, width, height } = options;
	const red = rgb(0.93, 0.08, 0.1);
	const secondLineText = options.secondLineText || 'CONTROLLED';
	const pad = Math.max(8, width * 0.04);
	const outerRadius = Math.max(7, Math.min(width, height) * 0.09);
	// Keep transparent background: no fill rectangle.
	drawRoundedRectBorder(page, x, y, width, height, outerRadius);

	const brandSize = fitSize(font, BRAND_TEXT, width * 0.45, height * 0.1, 9);
	drawCenteredText(page, font, BRAND_TEXT, brandSize, y + height - pad - brandSize, x, width);

	const mainSize = fitSize(font, mainText, width - pad * 2, height * 0.22, 13);
	const ctrlSize = fitSize(font, secondLineText, width - pad * 2, height * 0.22, 13);
	const mainY = y + height * 0.5 - mainSize / 2;
	const ctrlY = y + height * 0.22;
	drawCenteredText(page, font, mainText, mainSize, mainY, x, width);
	drawCenteredText(page, font, secondLineText, ctrlSize, ctrlY, x, width);

	if (subText) {
		const subSize = fitSize(font, subText, width - pad * 2, height * 0.09, 7);
		drawCenteredText(page, font, subText, subSize, y + Math.max(6, pad * 0.3), x, width);
	}
}

async function loadPdf(inputPath: string): Promise<PDFDocument | null> {
	if (!isPdfByName(inputPath)) return null;
	const input = await fs.readFile(inputPath);
	return await PDFDocument.load(input);
}

export async function buildOriginalControlledPdf(inputPath: string): Promise<Buffer> {
	const pdf = await loadPdf(inputPath);
	if (!pdf) return await fs.readFile(inputPath);
	const pages = pdf.getPages();
	if (pages.length === 0) return Buffer.from(await pdf.save());
	const font = await pdf.embedFont(StandardFonts.HelveticaBold);

	const first = pages[0];
	const { width, height } = first.getSize();
	const { x, y, boxWidth, boxHeight } = getPrimaryStampRect(width, height);
	drawControlledBox(first, font, 'ORIGINAL', null, {
		x,
		y,
		width: boxWidth,
		height: boxHeight,
		opacity: 0.7
	});

	return Buffer.from(await pdf.save());
}

export async function buildDistributionControlledPdf(inputPath: string): Promise<Buffer> {
	if (!isPdfByName(inputPath)) {
		return await fs.readFile(inputPath);
	}

	const input = await fs.readFile(inputPath);
	const pdf = await PDFDocument.load(input);
	const pages = pdf.getPages();
	if (pages.length === 0) return Buffer.from(await pdf.save());

	const font = await pdf.embedFont(StandardFonts.HelveticaBold);
	const footerFont = await pdf.embedFont(StandardFonts.Helvetica);
	const first = pages[0];
	const firstSize = first.getSize();
	const { x, y, boxWidth, boxHeight } = getPrimaryStampRect(firstSize.width, firstSize.height);
	drawControlledBox(first, font, 'DISTRIBUTION', 'COPY _____/_____  For Dept.____________', {
		x,
		y,
		width: boxWidth,
		height: boxHeight,
		opacity: 0.62
	});

	for (const p of pages) {
		const { width } = p.getSize();
		const size = 11;
		const textWidth = footerFont.widthOfTextAtSize(FOOTER_TEXT, size);
		p.drawText(FOOTER_TEXT, {
			x: Math.max(20, (width - textWidth) / 2),
			y: 10,
			size,
			font: footerFont,
			color: rgb(0.93, 0.08, 0.1)
		});
	}

	return Buffer.from(await pdf.save());
}

export async function buildCanceledDocumentPdf(inputPath: string): Promise<Buffer> {
	const pdf = await loadPdf(inputPath);
	if (!pdf) return await fs.readFile(inputPath);
	const pages = pdf.getPages();
	if (pages.length === 0) return Buffer.from(await pdf.save());
	const font = await pdf.embedFont(StandardFonts.HelveticaBold);

	const first = pages[0];
	const { width, height } = first.getSize();
	const { x, y, boxWidth, boxHeight } = getPrimaryStampRect(width, height);
	drawControlledBox(first, font, 'CANCELED', null, {
		x,
		y,
		width: boxWidth,
		height: boxHeight,
		opacity: 0.7,
		secondLineText: 'DOCUMENT'
	});

	return Buffer.from(await pdf.save());
}
