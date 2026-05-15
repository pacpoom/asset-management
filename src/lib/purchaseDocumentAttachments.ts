export const MAX_PURCHASE_DOCUMENT_ATTACHMENT_FILENAME_LENGTH = 50;

export function isPurchaseDocumentAttachmentFilenameTooLong(filename: string): boolean {
	return String(filename || '').length > MAX_PURCHASE_DOCUMENT_ATTACHMENT_FILENAME_LENGTH;
}

export function purchaseDocumentAttachmentFilenameTooLongMessage(locale: string): string {
	return locale === 'th'
		? 'ชื่อไฟล์ยาวเกินไป'
		: 'Filename is too long';
}

export function purchaseDocumentAttachmentFilenameTooLongDetail(locale: string): string {
	return locale === 'th'
		? `ชื่อไฟล์ต้องไม่เกิน ${MAX_PURCHASE_DOCUMENT_ATTACHMENT_FILENAME_LENGTH} ตัวอักษร`
		: `Filename must not exceed ${MAX_PURCHASE_DOCUMENT_ATTACHMENT_FILENAME_LENGTH} characters`;
}

/** Returns an error message when any upload has a filename that is too long. */
export function getPurchaseDocumentAttachmentUploadError(files: File[]): string | null {
	for (const file of files) {
		if (file instanceof File && file.size > 0 && isPurchaseDocumentAttachmentFilenameTooLong(file.name)) {
			return `ชื่อไฟล์ยาวเกินไป (สูงสุด ${MAX_PURCHASE_DOCUMENT_ATTACHMENT_FILENAME_LENGTH} ตัวอักษร)`;
		}
	}
	return null;
}
