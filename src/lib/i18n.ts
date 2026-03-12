import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

const initialLocale = browser ? window.localStorage.getItem('locale') || 'th' : 'th';
export const locale = writable<string>(initialLocale);

locale.subscribe((value) => {
	if (browser) {
		window.localStorage.setItem('locale', value);
	}
});

export const dictionary = writable<Record<string, Record<string, string>>>({
	en: {},
	th: {}
});

export async function loadTranslations() {
	if (!browser) return;
	try {
		const response = await fetch('/api/translations');
		if (!response.ok) throw new Error('Failed to fetch translations');

		const data = await response.json();

		const en: Record<string, string> = {};
		const th: Record<string, string> = {};

		data.forEach((item: any) => {
			en[item.translation_key] = item.en_text;
			th[item.translation_key] = item.th_text;
		});

		dictionary.set({ en, th });
	} catch (e) {
		console.error('Failed to load translations:', e);
	}
}

export const t = derived([locale, dictionary], ([$locale, $dictionary]) => {
	return (key: string) => {
		return $dictionary[$locale]?.[key] || key;
	};
});
