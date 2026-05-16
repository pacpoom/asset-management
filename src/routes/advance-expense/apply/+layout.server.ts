import type { LayoutServerLoad } from './$types';

// Public layout — bypass auth redirect for QR-scanned forms
export const load: LayoutServerLoad = async () => {
	return {};
};
