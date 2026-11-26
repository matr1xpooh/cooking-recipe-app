const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** True for an id that is safe in a URL path or a storage key: letters, digits and dashes. */
export function isSafeId(id: string): boolean {
	return SAFE_ID.test(id);
}
