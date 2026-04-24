<script lang="ts">
 import type { PageData } from './$types';

 const { data } = $props<{ data: PageData }>();
 let previewImageUrl = $state<string | null>(null);
 let previewImageTitle = $state<string>('');

 function formatDate(d: string | null | undefined) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', {
   year: 'numeric',
   month: 'short',
   day: 'numeric'
  });
 }

 function openImagePreview(url: string, title: string) {
  previewImageUrl = url;
  previewImageTitle = title;
 }

 function closeImagePreview() {
  previewImageUrl = null;
  previewImageTitle = '';
 }

 function getImages(item: any): Array<{ image_url: string }> {
  if (Array.isArray(item.images) && item.images.length > 0) return item.images;
  return item.image_url ? [{ image_url: item.image_url }] : [];
 }

 function getAttachments(item: any): Array<{ file_name: string; file_url: string }> {
  if (Array.isArray(item.attachments) && item.attachments.length > 0) return item.attachments;
  return item.attachment_url
   ? [{ file_name: item.attachment_name || 'Download', file_url: item.attachment_url }]
   : [];
 }
</script>

<svelte:head>
 <title>Dashboard - Core Business</title>
</svelte:head>

<div class="space-y-6">
 <div class="flex items-center justify-between">
  <div>
   <h1 class="text-2xl font-bold text-gray-800">ข่าวสารบริษัท</h1>
   <p class="text-sm text-gray-500">ประกาศและอัปเดตล่าสุดจากบริษัท V2</p>
  </div>
 </div>

 <div class="space-y-3">
  {#if data.announcements.length === 0}
   <div class="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
    ยังไม่มีประกาศข่าวสาร
   </div>
  {:else}
   {#each data.announcements as item}
    <article class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
     <div class="mb-2 flex items-center gap-2">
      {#if item.is_pinned}
       <span class="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PIN</span>
      {/if}
      <h2 class="text-base font-semibold text-gray-800">{item.title}</h2>
     </div>
     <p class="mb-2 whitespace-pre-wrap text-sm text-gray-700">{item.content}</p>
     {#if getImages(item).length > 0}
      <div class="mb-2 flex flex-wrap gap-2">
       {#each getImages(item) as img}
        <button
         type="button"
         class="block text-left"
         onclick={() => openImagePreview(img.image_url as string, item.title)}
         title="คลิกเพื่อดูภาพใหญ่"
        >
         <img
          src={img.image_url}
          alt={item.title}
          class="max-h-56 rounded-lg border border-gray-200 object-contain"
         />
        </button>
       {/each}
      </div>
     {/if}
     {#if getAttachments(item).length > 0}
      <div class="mb-2 space-y-1 text-xs">
       {#each getAttachments(item) as f}
        <p>
         <a class="text-blue-600 hover:underline" href={f.file_url} target="_blank">
          แนบไฟล์: {f.file_name}
         </a>
        </p>
       {/each}
      </div>
     {/if}
     <p class="text-xs text-gray-500">
      เผยแพร่: {formatDate(item.start_at || item.created_at)}{#if item.end_at && item.end_at !== '0000-00-00 00:00:00'} | หมดอายุ: {formatDate(item.end_at)}{/if}
     </p>
    </article>
   {/each}
  {/if}
 </div>
</div>

{#if previewImageUrl}
 <div
  class="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
  onclick={closeImagePreview}
  onkeydown={(e) => {
   if (e.key === 'Escape') closeImagePreview();
  }}
  role="presentation"
 >
  <div 
   class="relative max-h-[90vh] w-full max-w-5xl" 
   onclick={(e) => e.stopPropagation()}
   onkeydown={(e) => e.stopPropagation()}
   role="presentation"
  >
   <button
    type="button"
    class="absolute top-2 right-2 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white hover:bg-black/80"
    onclick={closeImagePreview}
   >
    Close
   </button>
   <img src={previewImageUrl} alt={previewImageTitle} class="max-h-[90vh] w-full rounded-lg object-contain" />
  </div>
 </div>
{/if}