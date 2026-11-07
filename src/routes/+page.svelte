<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
</script>

<h1>{m.recipes_title()}</h1>
<p><a href={resolve('/recipes')}>{m.recipes_title()}</a></p>
