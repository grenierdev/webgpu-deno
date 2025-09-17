import { createCapture } from "@std/webgpu/create-capture";
import { getRowPadding } from "@std/webgpu/row-padding";
import { assertSnapshot } from "@std/testing/snapshot";

Deno.test("clear", async (t) => {
	const adapter = await navigator.gpu.requestAdapter();
	const device = await adapter?.requestDevice()!;

	const dimensions = {
		width: 32,
		height: 32,
	};

	const { texture, outputBuffer } = createCapture(device, dimensions.width, dimensions.height);

	const commandEncoder = device.createCommandEncoder();
	const renderPass = commandEncoder.beginRenderPass({
		colorAttachments: [
			{
				view: texture.createView(),
				storeOp: "store",
				loadOp: "clear",
				clearValue: [1, 0, 0, 1],
			},
		],
	});
	renderPass.end();

	commandEncoder.copyTextureToBuffer(
		{
			texture,
		},
		{
			buffer: outputBuffer,
			bytesPerRow: getRowPadding(dimensions.width).padded,
		},
		dimensions,
	);

	device.queue.submit([commandEncoder.finish()]);

	await outputBuffer.mapAsync(GPUMapMode.READ);
	const outputArrayBuffer = new Uint8Array(outputBuffer.getMappedRange());
	outputBuffer.unmap();

	await assertSnapshot(t, outputArrayBuffer);
});
