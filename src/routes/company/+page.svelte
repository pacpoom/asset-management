<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageServerLoad } from './$types'; // Use correct type
	import { slide, fade } from 'svelte/transition';
    import { invalidateAll } from '$app/navigation';

    // --- Type for Company Data ---
    // Match the interface in +page.server.ts
	type CompanyData = Partial<Extract<PageServerLoad, () => Promise<{ company: any }>>['prototype']['company']>;

	// --- Props & State (Svelte 5 Runes) ---
	const { data, form } = $props<{ data: { company: CompanyData }; form: ActionData }>();

    // Initialize company state from loaded data or defaults
	let company = $state<CompanyData>(data.company || { id: 1, name: '' });
    let isSaving = $state(false);
    let message = $state<{ text: string, type: 'success' | 'error' } | null>(null);
    let messageTimeout: NodeJS.Timeout;

    // Logo handling state
    let logoPreviewUrl = $state<string | null>(company.logo_path || null);
    let logoFile = $state<File | null>(null);
    let removeLogoFlag = $state(false); // Flag to signal logo removal

	// --- Functions ---
    function showTemporaryMessage(text: string, type: 'success' | 'error', duration = 5000) {
        clearTimeout(messageTimeout);
        message = { text, type };
        messageTimeout = setTimeout(() => { message = null; }, duration);
    }

    function onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        removeLogoFlag = false; // Reset remove flag if new file is selected
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            // Basic type validation
            if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type)) {
                showTemporaryMessage('Invalid file type. Please select an image (JPG, PNG, GIF, WEBP, SVG).', 'error');
                logoFile = null;
                input.value = ''; // Clear input
                logoPreviewUrl = company.logo_path || null; // Revert preview
                return;
            }
            logoFile = file;
            // Create object URL for preview
            const reader = new FileReader();
            reader.onload = (e) => {
                logoPreviewUrl = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        } else {
            // No file selected
            logoFile = null;
            logoPreviewUrl = company.logo_path || null; // Revert to original or null
        }
    }

    function flagToRemoveLogo() {
        removeLogoFlag = true;
        logoFile = null; // Clear any selected file
        logoPreviewUrl = null; // Clear preview
        const fileInput = document.getElementById('logo') as HTMLInputElement;
        if (fileInput) fileInput.value = ''; // Clear the file input visually
    }

	// --- Reactive Effects ---
	$effect.pre(() => {
        // Handle form submission result
		if (form) {
            if (form.success) {
                showTemporaryMessage(form.message as string, 'success');
                // Update local state with potentially new logo path from server
                company.logo_path = form.logoPath || null;
                logoPreviewUrl = company.logo_path;
                removeLogoFlag = false; // Reset flags after successful save
                logoFile = null;
                const fileInput = document.getElementById('logo') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
                // No need for invalidateAll() here unless other parts of the app need the updated company info immediately.
            } else if (form.message) {
                showTemporaryMessage(form.message as string, 'error');
            }
            // Clear the form prop after handling to prevent re-triggering
            // REMOVED: (form as any) = null;
		}
	});

    // Clean up object URL
    $effect(() => {
        let currentPreview = logoPreviewUrl;
        return () => {
             if (currentPreview && currentPreview.startsWith('blob:')) {
                URL.revokeObjectURL(currentPreview);
             }
        };
	});

</script>

<svelte:head>
	<title>Company Settings</title>
</svelte:head>

<div class="p-6 bg-gray-50 min-h-screen">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold text-gray-800">Company Settings</h1>
		<p class="mt-1 text-sm text-gray-500">จัดการข้อมูลหลักและโลโก้ของบริษัท</p>
	</div>

    <!-- Message Area -->
	{#if message}
		<div
			transition:fade
			class="mb-6 rounded-lg p-4 text-sm font-semibold {message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
		>
			{message.text}
		</div>
	{/if}

	<!-- Company Details Form -->
	<form
        method="POST"
        action="?/save"
        enctype="multipart/form-data"
        use:enhance={({ formData }) => {
            isSaving = true;
            // Add the remove_logo flag if set
            if (removeLogoFlag) {
                formData.set('remove_logo', 'true');
            }
            // Add the existing logo path for server reference
            if (company.logo_path) {
                formData.set('existing_logo_path', company.logo_path);
            }
            // The actual file is already handled by the browser form submission

            return async ({ update }) => {
                await update({ reset: false }); // Don't reset form on error
                isSaving = false;
                // Form result handling is in $effect
            };
        }}
        class="bg-white p-6 rounded-lg shadow-md border border-gray-200"
    >
        <!-- Use ID 1 implicitly -->
        <input type="hidden" name="id" value={1} />

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Left Column: Logo -->
            <div class="md:col-span-1 space-y-4">
                 <h2 class="text-lg font-semibold text-gray-700 mb-2 border-b pb-2">Company Logo</h2>
                 <div class="aspect-square w-full max-w-[200px] mx-auto rounded-lg border bg-gray-100 flex items-center justify-center overflow-hidden">
                     {#if logoPreviewUrl}
                        <img src={logoPreviewUrl} alt="Company logo preview" class="h-full w-full object-contain" />
                    {:else}
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" />
                        </svg>
                    {/if}
                 </div>
                 <div>
                    <label for="logo" class="sr-only">Choose logo file</label>
                    <input
                        type="file"
                        name="logo"
                        id="logo"
                        accept="image/png, image/jpeg, image/gif, image/webp, image/svg+xml"
                        onchange={onFileSelected}
                        class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                    />
                 </div>
                 {#if company.logo_path && !removeLogoFlag}
                    <button type="button" onclick={flagToRemoveLogo} class="w-full text-xs text-red-600 hover:underline text-center">
                        Remove current logo
                    </button>
                 {/if}
                 {#if removeLogoFlag}
                     <p class="text-xs text-orange-600 text-center">Current logo will be removed upon saving.</p>
                 {/if}
            </div>

            <!-- Right Column: Details -->
            <div class="md:col-span-2 space-y-4">
                 <h2 class="text-lg font-semibold text-gray-700 mb-2 border-b pb-2">Company Information</h2>
                 <div>
                    <label for="name" class="block text-sm font-medium text-gray-600 mb-1">Company Name *</label>
                    <input type="text" id="name" name="name" bind:value={company.name} required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label for="email" class="block text-sm font-medium text-gray-600 mb-1">Email</label>
                        <input type="email" id="email" name="email" bind:value={company.email} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                    <div>
                        <label for="phone" class="block text-sm font-medium text-gray-600 mb-1">Phone</label>
                        <input type="tel" id="phone" name="phone" bind:value={company.phone} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                </div>

                <div>
                    <label for="website" class="block text-sm font-medium text-gray-600 mb-1">Website</label>
                    <input type="url" id="website" name="website" bind:value={company.website} placeholder="https://..." class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                </div>
                <div>
                    <label for="tax_id" class="block text-sm font-medium text-gray-600 mb-1">Tax ID</label>
                    <input type="text" id="tax_id" name="tax_id" bind:value={company.tax_id} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                </div>

                 <h3 class="text-md font-semibold text-gray-700 pt-4 border-t">Address</h3>
                 <div>
                    <label for="address_line_1" class="block text-sm font-medium text-gray-600 mb-1">Address Line 1</label>
                    <input type="text" id="address_line_1" name="address_line_1" bind:value={company.address_line_1} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                </div>
                 <div>
                    <label for="address_line_2" class="block text-sm font-medium text-gray-600 mb-1">Address Line 2</label>
                    <input type="text" id="address_line_2" name="address_line_2" bind:value={company.address_line_2} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label for="city" class="block text-sm font-medium text-gray-600 mb-1">City / District</label>
                        <input type="text" id="city" name="city" bind:value={company.city} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                     <div>
                        <label for="state_province" class="block text-sm font-medium text-gray-600 mb-1">State / Province</label>
                        <input type="text" id="state_province" name="state_province" bind:value={company.state_province} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                </div>
                 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label for="postal_code" class="block text-sm font-medium text-gray-600 mb-1">Postal Code</label>
                        <input type="text" id="postal_code" name="postal_code" bind:value={company.postal_code} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                     <div>
                        <label for="country" class="block text-sm font-medium text-gray-600 mb-1">Country</label>
                        <input type="text" id="country" name="country" bind:value={company.country} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                </div>
            </div>
        </div>

		<!-- Form Actions -->
		<div class="flex justify-end pt-6 mt-6 border-t border-gray-200">
			<button
                type="submit"
                disabled={isSaving}
                class="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-300 disabled:opacity-50"
            >
                {#if isSaving}
                     <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Saving...
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a1 1 0 011 1v3a1 1 0 11-2 0V8h-3v3.586L12.293 10.293zM3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm-.707 6.293a1 1 0 000 1.414L6 15.414V19a1 1 0 102 0v-3.586L3.707 10.707a1 1 0 00-1.414-.414z" /></svg>
                    Save Changes
                {/if}
			</button>
		</div>
	</form>
</div>