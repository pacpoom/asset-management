// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Session } from '@auth/sveltekit';
declare global {
	namespace App {
		// Define the structure of the authenticated user
		interface User {
			id: number;
			email: string;
			// 🔽🔽🔽 [แก้ไข] เพิ่ม 2 บรรทัดนี้ 🔽🔽🔽
			full_name: string | null; // ชื่อเต็ม
			profile_image_url: string | null; // URL รูปโปรไฟล์
			role: string;
			/** All assigned role names (from `user_roles` and primary); use for multi-role checks. */
			roleNames: string[];
			permissions: string[];
			/** ISO section code (e.g. QM) for DAR Document Controller rule */
			iso_section?: string | null;
		}

		// interface Error {}
		// Locals interface for passing data between hooks, server routes, and pages
		interface Locals {
			user: User | null;
			auth: () => Promise<Session | null>;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
