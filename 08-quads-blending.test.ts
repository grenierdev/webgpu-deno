import { assertOutputBufferFromSnapshot } from "./utils.test.ts";
import { createBufferWithContents, createCapture } from "./utils.ts";
import { decode } from "pngs";

Deno.test("quads blending", async (t) => {
	const adapter = await navigator.gpu.requestAdapter();
	const device = await adapter?.requestDevice()!;

	const dimensions = {
		width: 32,
		height: 32,
	};

	const srcImageData = await Deno.readFile("./src.png");
	const srcImage = decode(srcImageData);
	const srcTexture = device.createTexture({
		label: "Src",
		size: {
			width: srcImage.width,
			height: srcImage.height,
		},
		format: "rgba8uint",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
	});
	await device.queue.writeTexture(
		{ texture: srcTexture },
		srcImage.image as Uint8Array<ArrayBuffer>,
		{},
		[srcImage.width, srcImage.height],
	);

	// vec2(center), vec2(size), rotation
	const quadsBuffer = createBufferWithContents(device, {
		size: 10 * 10 * 8 * Float32Array.BYTES_PER_ELEMENT,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		// deno-fmt-ignore
		contents: new Float32Array([
			0.0, 0.0, 1.0, 1.0, 0.0,
			0.0, 0.0, 1.0, 1.0, 0.0,
		]),
	});

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
