import { getRowPadding } from "@std/webgpu/row-padding";
import { encode } from "pngs";

export async function writeBufferToPNG(buffer: Uint8Array, path: string, dimensions: { width: number; height: number }): Promise<void> {
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
	await Deno.writeFile(path, image);
}

export function createBufferWithContents(
	device: GPUDevice,
	descriptor: GPUBufferDescriptor & { contents: ArrayBuffer | ArrayBufferView },
): GPUBuffer {
	const contents = new Uint8Array(descriptor.contents instanceof ArrayBuffer ? descriptor.contents : descriptor.contents.buffer);
	const alignMask = 4 - 1;
	const paddedSize = Math.max(
		(contents.byteLength + alignMask) & ~alignMask,
		4,
	);
	const buffer = device.createBuffer({
		label: descriptor.label,
		usage: descriptor.usage,
		mappedAtCreation: true,
		size: paddedSize,
	});
	const data = new Uint8Array(buffer.getMappedRange());
	data.set(contents);
	buffer.unmap();
	return buffer;
}
