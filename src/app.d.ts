// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// Define the structure of the authenticated user
		interface User {
			id: number;
			email: string;
			// FIX: Changed role type from 'admin' | 'user' to string
			// to allow for custom role names like 'ANJI_AF' from the database.
			role: string;
			permissions: string[]; // Permissions associated with the user's role
		}

		// interface Error {}
		// Locals interface for passing data between hooks, server routes, and pages
		interface Locals {
			user: User | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};