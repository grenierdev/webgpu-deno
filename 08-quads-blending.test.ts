import { assertOutputBufferFromSnapshot } from "./utils.test.ts";
import { createBufferWithContents, createCapture } from "./utils.ts";
import { createTextureWithData } from "@std/webgpu/texture-with-data";
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
	const srcTexture = createTextureWithData(
		device,
		{
			label: "Src",
			size: {
				width: srcImage.width,
				height: srcImage.height,
			},
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
		},
		srcImage.image as Uint8Array<ArrayBuffer>,
	);

	const dstImageData = await Deno.readFile("./dst.png");
	const dstImage = decode(dstImageData);
	const dstTexture = createTextureWithData(
		device,
		{
			label: "Dst",
			size: {
				width: dstImage.width,
				height: dstImage.height,
			},
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
		},
		dstImage.image as Uint8Array<ArrayBuffer>,
	);

	// vec2(position), vec2(uv)
	const vertexBuffer = createBufferWithContents(device, {
		size: 10 * 10 * 8 * Float32Array.BYTES_PER_ELEMENT,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		// deno-fmt-ignore
		contents: new Float32Array([
			-1, -1, 0, 1,
			1, -1, 1, 1,
			-1, 1, 0, 0,
			1, 1, 1, 0,
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
				@location(0) UV: vec2<f32>,
			};

            @group(0) @binding(0) var ourTexture: texture_2d<f32>;
			@group(0) @binding(1) var ourSampler: sampler;

			@vertex
			fn vs_main(vert: VertexInput) -> VertexOutput {
				var out: VertexOutput;
				out.Position = vec4<f32>(vert.Position.xy, 0.0, 1.0);
				out.UV = vert.TexCoord;
				return out;
			}

			@fragment
			fn fs_main(frag: VertexOutput) -> @location(0) vec4<f32> {
				return textureSample(ourTexture, ourSampler, frag.UV);
			}
		`,
	});

	const pipelineLayout = device.createPipelineLayout({
		bindGroupLayouts: [
			device.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.FRAGMENT,
						texture: {},
					},
					{
						binding: 1,
						visibility: GPUShaderStage.FRAGMENT,
						sampler: {},
					},
				],
			}),
		],
	});

	const sampler = device.createSampler({
		minFilter: "nearest",
	});

	const renderPipeline1 = device.createRenderPipeline({
		label: "Pipeline1",
		layout: pipelineLayout,
		// layout: "auto",
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
					format: "rgba8unorm",
					blend: {
						color: {
							operation: "add",
							srcFactor: "one",
							dstFactor: "zero",
						},
						alpha: {
							operation: "add",
							srcFactor: "one",
							dstFactor: "zero",
						},
					},
				},
			],
		},
		primitive: {
			cullMode: "back",
		},
	});
	const renderPipeline2 = device.createRenderPipeline({
		label: "Pipeline2",
		layout: pipelineLayout,
		// layout: "auto",
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
					format: "rgba8unorm",
					// https://ssp.impulsetrain.com/porterduff.html
					blend: {
						color: {
							operation: "add",
							srcFactor: "one",
							dstFactor: "zero",
						},
						alpha: {
							operation: "add",
							srcFactor: "one",
							dstFactor: "zero",
						},
					},
				},
			],
		},
		primitive: {
			cullMode: "back",
		},
	});

	const bindGroup1 = device.createBindGroup({
		layout: renderPipeline1.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: srcTexture.createView() },
			{ binding: 1, resource: sampler },
		],
	});
	const bindGroup2 = device.createBindGroup({
		layout: renderPipeline1.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: dstTexture.createView() },
			{ binding: 1, resource: sampler },
		],
	});

	const { texture, outputBuffer, bytesPerRow } = createCapture(device, dimensions.width, dimensions.height, { format: "rgba8unorm" });

	const commandEncoder = device.createCommandEncoder();
	const renderPass1 = commandEncoder.beginRenderPass({
		colorAttachments: [
			{
				view: texture.createView(),
				storeOp: "store",
				loadOp: "clear",
				clearValue: [0, 0, 0, 1],
			},
		],
	});
	renderPass1.setPipeline(renderPipeline1);
	renderPass1.setBindGroup(0, bindGroup1);
	renderPass1.setIndexBuffer(indexBuffer, "uint16");
	renderPass1.setVertexBuffer(0, vertexBuffer);
	renderPass1.drawIndexed(6, 1, 0, 0, 0);
	renderPass1.end();
	const renderPass2 = commandEncoder.beginRenderPass({
		colorAttachments: [
			{
				view: texture.createView(),
				storeOp: "store",
				loadOp: "clear",
				clearValue: [0, 0, 0, 1],
			},
		],
	});
	renderPass2.setPipeline(renderPipeline2);
	renderPass2.setBindGroup(0, bindGroup2);
	renderPass2.setIndexBuffer(indexBuffer, "uint16");
	renderPass2.setVertexBuffer(0, vertexBuffer);
	renderPass2.drawIndexed(6, 1, 0, 0, 0);
	renderPass2.end();

	commandEncoder.copyTextureToBuffer(
		{ texture },
		{ buffer: outputBuffer, bytesPerRow },
		dimensions,
	);

	device.queue.submit([commandEncoder.finish()]);

	await assertOutputBufferFromSnapshot(t, outputBuffer, dimensions);

	device.destroy();
});
