import { json } from '@sveltejs/kit';

export async function GET({ url }) {
	const ip = url.searchParams.get('ip');
	if (!ip) return json({ online: false });

	try {
		const ZKLib = (await import('node-zklib')).default;
		const zkInstance = new ZKLib(ip, 4370, 2000, 4000);

		await zkInstance.createSocket();
		await zkInstance.disconnect();

		return json({ online: true });
	} catch (err) {
		return json({ online: false });
	}
}
