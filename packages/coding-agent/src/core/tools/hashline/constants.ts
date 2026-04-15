export const HASHLINE_NIBBLE_ALPHABET = "ZPMQVRWSNKTXJBYH";

export const HASHLINE_DICT = Array.from({ length: 256 }, (_, i) => {
	const high = i >>> 4;
	const low = i & 0x0f;
	return `${HASHLINE_NIBBLE_ALPHABET[high]}${HASHLINE_NIBBLE_ALPHABET[low]}`;
});

export const HASHLINE_REF_RE = /^([0-9]+)#([ZPMQVRWSNKTXJBYH]{2})$/;
export const HASHLINE_OUTPUT_RE = /^([0-9]+)#([ZPMQVRWSNKTXJBYH]{2})[:|](.*)$/;
