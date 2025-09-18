import { assertOutputBufferFromSnapshot } from "./utils.test.ts";
import { createCapture } from "./utils.ts";

Deno.test("clear", async (t) => {
	const adapter = await navigator.gpu.requestAdapter();
	const device = await adapter?.requestDevice()!;

	const dimensions = {
		width: 32,
		height: 32,
	};

	const { texture, outputBuffer, bytesPerRow } = createCapture(device, dimensions.width, dimensions.height);

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
			bytesPerRow,
		},
		dimensions,
	);

	device.queue.submit([commandEncoder.finish()]);

	await assertOutputBufferFromSnapshot(t, outputBuffer, dimensions);

	device.destroy();
});
