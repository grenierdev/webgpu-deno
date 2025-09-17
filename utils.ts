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
