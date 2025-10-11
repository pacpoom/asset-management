// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// Define the structure of the authenticated user
		interface User {
			id: number;
			email: string;
			// เพิ่ม role เพื่อใช้ในการตรวจสอบสิทธิ์
			role: 'admin' | 'user'; 
		}

		// interface Error {}
		// ประกาศ Locals เพื่อให้ข้อมูลผู้ใช้ (User) สามารถเข้าถึงได้ทั่วทั้งแอปฯ
		interface Locals {
			user: User | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};