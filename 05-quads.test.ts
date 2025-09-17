import { createCapture } from "@std/webgpu/create-capture";
import { getRowPadding } from "@std/webgpu/row-padding";
import { assertSnapshot } from "@std/testing/snapshot";
import { createBufferWithContents } from "./utils.ts";

Deno.test("instancing quads", async (t) => {
	const adapter = await navigator.gpu.requestAdapter();
	const device = await adapter?.requestDevice()!;

	const dimensions = {
		width: 32,
		height: 32,
	};

	// vec2(center), vec2(size), rotation
	const quadsBuffer = createBufferWithContents(device, {
		size: 10 * 10 * 8 * Float32Array.BYTES_PER_ELEMENT,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		// deno-fmt-ignore
		contents: new Float32Array([
			-0.5, 0.5, 0.5, 0.5, 0.0,
			0.5, 0.5, -0.5, 0.5, 0.0,
			-0.5, -0.5, 0.5, -0.5, 0.0,
			0.5, -0.5, -0.5, -0.5, 0.0,
			0.0, 0.0, 0.5, 0.5, Math.PI / 10,
		]),
	});

	const shaderModule = device.createShaderModule({
		code: `
			struct VertexInput {
				@builtin(vertex_index) Index: u32,
				@builtin(instance_index) Instance: u32,
			};

			struct InstanceInput {
				@location(5) Center: vec2<f32>,
				@location(6) Size: vec2<f32>,
				@location(7) Rotation: f32,
			};

			struct VertexOutput {
				@builtin(position) Position: vec4<f32>,
				@location(0) UV: vec2<f32>,
			};

			@vertex
			fn vs_main(vert: VertexInput, inst: InstanceInput) -> VertexOutput {
				var p = vec2<f32>(
					f32(vert.Index & 1u),
					f32(vert.Index < 2u)
				);
				var v = vec4<f32>(
					mix(-1.0, 1.0, p.x),
					mix(1.0, -1.0, p.y),
					0.0,
					1.0,
				);
				var t = mat4x4<f32>(
					cos(inst.Rotation) * inst.Size.x, sin(inst.Rotation), 0.0, inst.Center.x,
					-sin(inst.Rotation), cos(inst.Rotation) * inst.Size.y, 0.0, inst.Center.y,
					0.0, 0.0, 1.0, 0.0,
					0.0, 0.0, 0.0, 1.0,
				);
				var out: VertexOutput;
				out.Position = v * t;
				out.UV = vec2<f32>(
					mix(0.0, 1.0, p.x),
					1. - mix(1.0, 0.0, p.y)
				);
				return out;
			}
			
			@fragment
			fn fs_main(frag: VertexOutput) -> @location(0) vec4<f32> {
				return vec4<f32>(frag.UV.xy, 0.0, 1.0);
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
					arrayStride: 5 * Float32Array.BYTES_PER_ELEMENT,
					stepMode: "instance",
					attributes: [
						{
							offset: 0 * Float32Array.BYTES_PER_ELEMENT,
							shaderLocation: 5,
							format: "float32x2",
						},
						{
							offset: 2 * Float32Array.BYTES_PER_ELEMENT,
							shaderLocation: 6,
							format: "float32x2",
						},
						{
							offset: 4 * Float32Array.BYTES_PER_ELEMENT,
							shaderLocation: 7,
							format: "float32",
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
			topology: "triangle-strip",
			// cullMode: "back",
		},
	});

	const { texture, outputBuffer } = createCapture(device, dimensions.width, dimensions.height);

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
	renderPass.setVertexBuffer(0, quadsBuffer);
	renderPass.draw(4, 5, 0, 0);
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
