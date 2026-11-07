import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';

export class OcrError extends Error {
	constructor(readonly key: 'ocr_failed') {
		super(key);
	}
}

// Created once per process. Credentials come from the default AWS chain.
let client: TextractClient | undefined;

/** Reads the text lines in a PNG or JPEG, top to bottom. */
export async function detectLines(bytes: Uint8Array): Promise<string[]> {
	client ??= new TextractClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
	try {
		const out = await client.send(new DetectDocumentTextCommand({ Document: { Bytes: bytes } }));
		return (out.Blocks ?? [])
			.filter((b) => b.BlockType === 'LINE' && b.Text)
			.sort((a, b) => (a.Geometry?.BoundingBox?.Top ?? 0) - (b.Geometry?.BoundingBox?.Top ?? 0))
			.map((b) => b.Text as string);
	} catch {
		throw new OcrError('ocr_failed');
	}
}
