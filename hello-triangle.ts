// Source: https://web.dev/gpu-compute/

/**
 * Takeaways
 * 
 * PipelineLayout can be infered from program.
 * 
 * BindGroup can use Pipeline to retrieve BindGroupLayout by
 * it's index.
 * 
 */

import { encode } from "https://deno.land/x/pngs@0.1.1/mod.ts";

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter!.requestDevice();

const dimensions = {
	width: 512,
	height: 512,
}
const outputBuffer = device.createBuffer({
	size: dimensions.width * dimensions.height * Float32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});
const outputTexture = device.createTexture({
	size: dimensions,
	format: "rgba8unorm-srgb",
	usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
});

const shaderModule = device.createShaderModule({
	code: `
		struct VertexInput {
			@builtin(vertex_index) Index: u32,
		};

		struct VertexOutput {
			@builtin(position) Position: vec4<f32>,
			@location(0) TexCoord: vec2<f32>,
		};

		@group(0) @binding(0) var Texture: texture_2d<f32>;
		@group(0) @binding(1) var Sampler: sampler;

		@vertex
		fn vs_main(in: VertexInput) -> VertexOutput {
			var out: VertexOutput;
			out.Position = vec4<f32>(
				f32(-1i + i32(in.Index & 1u) * 2i),
				f32(-1i + i32(in.Index < 2u) * 2i),
				0.0,
				1.0
			);
			out.TexCoord = vec2<f32>(
				f32(in.Index & 1u),
				1.0 - f32(in.Index < 2u)
			);
			return out;
		}
		
		@fragment
		fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
			return vec4<f32>(in.TexCoord.xy, 0.5, 1.0);
		}
	`
});

const pipelineLayout = device.createPipelineLayout({
	bindGroupLayouts: [],
});

// Define the render operation
const renderPipeline = await device.createRenderPipelineAsync({
	layout: pipelineLayout,
	vertex: {
		entryPoint: "vs_main",
		module: shaderModule,
	},
	fragment: {
		entryPoint: "fs_main",
		module: shaderModule,
		targets: [
			{
				format: "rgba8unorm-srgb",
			},
		],
	},
	primitive: {
		topology: "triangle-strip",
		cullMode: "front"
	}
});

// Batch commands
const encoder = device.createCommandEncoder();

// Render pass
{
	const passEncoder = encoder.beginRenderPass({
		colorAttachments: [
			{
				view: outputTexture.createView(),
				storeOp: "store",
				loadOp: "clear",
				clearValue: [0, 0, 0, 0],
			},
		],
	});
	passEncoder.setPipeline(renderPipeline);
	passEncoder.draw(4, 1);
	passEncoder.end();
}

// Copy result
encoder.copyTextureToBuffer(
	{
		texture: outputTexture,
	},
	{
		buffer: outputBuffer,
		bytesPerRow: dimensions.width * Float32Array.BYTES_PER_ELEMENT,
		rowsPerImage: 0,
	},
	dimensions,
);

device.queue.submit([encoder.finish()]);

// Wait for the buffer to be is allocated/mapped
await outputBuffer.mapAsync(GPUMapMode.READ);

const outputArrayBuffer = new Uint8Array(outputBuffer.getMappedRange());

const image = encode(
	outputArrayBuffer,
	dimensions.width,
	dimensions.height,
	{
		stripAlpha: true,
		color: 2,
	},
);
Deno.writeFileSync("./hello-triangle.png", image);

// const arrayBufferD = gpuBufferD.getMappedRange();
// console.log(new Float32Array(arrayBufferD));
// gpuBufferD.unmap();