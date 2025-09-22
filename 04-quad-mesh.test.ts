import { createBufferWithContents, createCapture } from "./utils.ts";
import { assertOutputBufferFromSnapshot } from "./utils.test.ts";

Deno.test("triangle mesh", async (t) => {
	const adapter = await navigator.gpu.requestAdapter();
	const device = await adapter?.requestDevice()!;

	const dimensions = {
		width: 32,
		height: 32,
	};

	// vec2(position), vec2(uv)
	const vertexBuffer = createBufferWithContents(device, {
		size: 10 * 10 * 8 * Float32Array.BYTES_PER_ELEMENT,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		// deno-fmt-ignore
		contents: new Float32Array([
			-1, -1, 0, 0,
			1, -1, 1, 0,
			-1, 1, 0, 1,
			1, 1, 1, 1,
		]),
	});
	const indexBuffer = createBufferWithContents(device, {
		size: 6 * Uint16Array.BYTES_PER_ELEMENT,
		usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		// deno-fmt-ignore
		contents: new Uint16Array([
			0, 1, 2,
			2, 1, 3,
		]),
	});

	const shaderModule = device.createShaderModule({
		code: `
			struct VertexInput {
				@location(0) Position: vec2<f32>,
				@location(1) TexCoord: vec2<f32>,
			};

			struct VertexOutput {
				@builtin(position) Position: vec4<f32>,
				@location(0) Color: vec4<f32>,
			};

			@vertex
			fn vs_main(vert: VertexInput) -> VertexOutput {
				var out: VertexOutput;
				out.Position = vec4<f32>(vert.Position.xy, 0.0, 1.0);
				out.Color = vec4<f32>(vert.TexCoord.xy, 0.0, 1.0);
				return out;
			}

			@fragment
			fn fs_main(frag: VertexOutput) -> @location(0) vec4<f32> {
				return frag.Color;
			}
		`,
	});

	const pipelineLayout = device.createPipelineLayout({
		bindGroupLayouts: [],
	});

	const renderPipeline = device.createRenderPipeline({
		layout: pipelineLayout,
		vertex: {
			module: shaderModule,
			// entryPoint: "vs_main",
			buffers: [
				{
					arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
					stepMode: "vertex",
					attributes: [
						{
							format: "float32x2",
							offset: 0,
							shaderLocation: 0,
						},
						{
							format: "float32x2",
							offset: 2 * Float32Array.BYTES_PER_ELEMENT,
							shaderLocation: 1,
						},
					],
				},
			],
		},
		fragment: {
			module: shaderModule,
			// entryPoint: "fs_main",
			targets: [
				{
					format: "rgba8unorm-srgb",
				},
			],
		},
		primitive: {
			cullMode: "back",
		},
	});

	const { texture, outputBuffer, bytesPerRow } = createCapture(device, dimensions.width, dimensions.height);

	const commandEncoder = device.createCommandEncoder();
	const renderPass = commandEncoder.beginRenderPass({
		colorAttachments: [
			{
				view: texture.createView(),
				storeOp: "store",
				loadOp: "clear",
				clearValue: [0, 0, 0, 1],
			},
		],
	});
	renderPass.setPipeline(renderPipeline);
	renderPass.setIndexBuffer(indexBuffer, "uint16");
	renderPass.setVertexBuffer(0, vertexBuffer);
	renderPass.drawIndexed(6, 1, 0, 0, 0);
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
