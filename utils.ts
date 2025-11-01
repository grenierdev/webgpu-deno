import { getRowPadding } from "@std/webgpu/row-padding";

export interface CreateCapture {
	/**
	 * Texture to be used as view to render to.
	 */
	texture: GPUTexture;

	/**
	 * Represents the output buffer of the rendered texture.
	 * Can then be used to access and retrieve raw image data.
	 */
	outputBuffer: GPUBuffer;

	bytesPerRow: number;
}

export function createCapture(
	device: GPUDevice,
	width: number,
	height: number,
	options?: {
		format?: GPUTextureFormat;
		label?: string;
		padding?: number;
	},
): CreateCapture {
	const padded = options?.padding ?? getRowPadding(width).padded;
	const outputBuffer = device.createBuffer({
		label: options?.label ?? "Capture",
		size: padded * height,
		usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
	});
	const texture = device.createTexture({
		label: options?.label ?? "Capture",
		size: {
			width,
			height,
		},
		format: options?.format ?? "rgba8unorm-srgb",
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
	});

	return { texture, outputBuffer, bytesPerRow: padded };
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

export function resliceBufferWithPadding(
	buffer: Uint8Array,
	width: number,
	height: number,
): Uint8Array {
	const { padded, unpadded } = getRowPadding(width);
	const outputBuffer = new Uint8Array(unpadded * height);

	for (let i = 0; i < height; i++) {
		const slice = buffer
			.subarray(i * padded, (i + 1) * padded)
			.subarray(0, unpadded);

		outputBuffer.set(slice, i * unpadded);
	}

	return outputBuffer;
}
