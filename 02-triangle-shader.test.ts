import { createCapture } from "@std/webgpu/create-capture";
import { getRowPadding } from "@std/webgpu/row-padding";
import { assertSnapshot } from "@std/testing/snapshot";

Deno.test("triangle in shader", async (t) => {
	const adapter = await navigator.gpu.requestAdapter();
	const device = await adapter?.requestDevice()!;

	const dimensions = {
		width: 32,
		height: 32,
	};

	const shaderModule = device.createShaderModule({
		code: `
			@vertex
			fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> @builtin(position) vec4<f32> {
				let x = f32(i32(in_vertex_index) - 1);
				let y = f32(i32(in_vertex_index & 1u) * 2 - 1);
				return vec4<f32>(x, y, 0.0, 1.0);
			}

			@fragment
			fn fs_main() -> @location(0) vec4<f32> {
				return vec4<f32>(1.0, 0.0, 0.0, 1.0);
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
	renderPass.draw(3, 1, 0, 0);
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
