import { fromFileUrl, join, parse } from "@std/path";
import { slugify } from "@std/text/unstable-slugify";
import { getRowPadding } from "@std/webgpu/row-padding";
import { encode } from "pngs";

function getMode(): "update" | "assert" {
	return Deno.args.some((arg) => arg === "--update" || arg === "-u") ? "update" : "assert";
}

const counter = new Map<string, number>();

function getSnapshotFilePath(t: Deno.TestContext, ext: string): string {
	const testFilePath = fromFileUrl(t.origin);
	const { dir, base } = parse(testFilePath);
	const name = slugify(t.name);
	const tmpName = join(dir, "__snapshots__", `${base}.${name}`);
	const count = counter.get(tmpName) ?? 0;
	counter.set(tmpName, count + 1);
	return join(dir, "__snapshots__", `${base}.${name}.${count}.${ext}`);
}

const textEncoder = new TextEncoder();

function bufferToPng(
	buffer: Uint8Array,
	dimensions: { width: number; height: number },
): Uint8Array {
	const { padded, unpadded } = getRowPadding(dimensions.width);
	const pngBuffer = new Uint8Array(unpadded * dimensions.height);

	for (let i = 0; i < dimensions.height; i++) {
		const slice = buffer
			.slice(i * padded, (i + 1) * padded)
			.slice(0, unpadded);

		pngBuffer.set(slice, i * unpadded);
	}

	const image = encode(
		pngBuffer,
		dimensions.width,
		dimensions.height,
		{
			stripAlpha: true,
			color: 2,
		},
	);

	return image;
}

export async function assertOutputBufferFromSnapshot(
	t: Deno.TestContext,
	outputBuffer: GPUBuffer,
	dimensions: { width: number; height: number },
): Promise<void> {
	await outputBuffer.mapAsync(GPUMapMode.READ);
	const outputArrayBuffer = new Uint8Array(outputBuffer.getMappedRange());
	outputBuffer.unmap();

	await assertSnapshot(t, bufferToPng(outputArrayBuffer, dimensions), { ext: "png" });
}

export async function assertSnapshot(t: Deno.TestContext, value: unknown, options?: { ext?: string }): Promise<void> {
	const snapshotFilePath = getSnapshotFilePath(t, options?.ext ?? "snap");
	const { dir } = parse(snapshotFilePath);
	const mode = getMode();

	await Deno.mkdirSync(dir, { recursive: true });

	let snapshotValue: Uint8Array;
	if (
		value instanceof ArrayBuffer || value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Int8Array ||
		value instanceof Uint16Array || value instanceof Int16Array || value instanceof Uint32Array || value instanceof Int32Array ||
		value instanceof Float32Array || value instanceof Float64Array
	) {
		snapshotValue = new Uint8Array(value);
	} else {
		snapshotValue = textEncoder.encode(JSON.stringify(value));
	}

	if (mode === "assert") {
		const existingSnapshotValue = await Deno.readFile(snapshotFilePath);
		if (existingSnapshotValue.length !== snapshotValue.length) {
			throw new Error(`Snapshot length mismatch: expected ${existingSnapshotValue.length}, got ${snapshotValue.length}`);
		}
		for (let i = 0; i < existingSnapshotValue.length; i++) {
			if (existingSnapshotValue[i] !== snapshotValue[i]) {
				throw new Error(`Snapshot content mismatch at byte ${i}: expected ${existingSnapshotValue[i]}, got ${snapshotValue[i]}`);
			}
		}
	} else {
		await Deno.writeFile(snapshotFilePath, snapshotValue);
	}
}
