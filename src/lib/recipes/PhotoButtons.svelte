<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { readClipboardImage, type PhotoErrorKey } from './photos.js';

	/**
	 * The three ways to add a photo: the camera, the photo library, and the clipboard. Files
	 * are passed to onfiles; a failure to read the clipboard is passed to onerror.
	 */
	let {
		disabled = false,
		onfiles,
		onerror
	}: {
		disabled?: boolean;
		onfiles: (files: File[]) => void;
		onerror: (key: PhotoErrorKey) => void;
	} = $props();

	function picked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (files.length > 0) onfiles(files);
	}

	async function fromClipboard() {
		const result = await readClipboardImage();
		if (typeof result === 'string') onerror(result);
		else onfiles([result]);
	}
</script>

<div class="image-actions">
	<label class="file-button" class:busy={disabled}>
		{m.photo_take()}
		<!-- capture opens the camera on a phone; the size and type are checked on pick. -->
		<input type="file" accept="image/*" capture="environment" {disabled} onchange={picked} />
	</label>
	<label class="file-button" class:busy={disabled}>
		{m.photo_library()}
		<input type="file" accept="image/png,image/jpeg" multiple {disabled} onchange={picked} />
	</label>
	<button type="button" class="file-button" onclick={fromClipboard} {disabled}>
		{m.clipboard_button()}
	</button>
</div>
