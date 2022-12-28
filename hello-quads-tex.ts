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
import JPEG from "https://deno.land/x/jpeg@v1.0.1/mod.ts";

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter!.requestDevice({
	requiredFeatures: ["timestamp-query"]
});

const dimensions = {
	width: 512,
	height: 512,
}

const img = JPEG.decode(await Deno.readFile("./uv_grid_opengl.jpg"), { formatAsRGBA: true });
const textureData = new Uint8Array(img.data);
const gpuTexture = device.createTexture({
	size: {
		width: img.width,
		height: img.height,
	},
	format: "rgba8unorm-srgb",
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
});
device.queue.writeTexture(
	{
		texture: gpuTexture,
	},
	textureData,
	{
		offset: 0,
		bytesPerRow: Uint8Array.BYTES_PER_ELEMENT * 4 * img.width,
		rowsPerImage: img.height
	},
	{
		width: img.width,
		height: img.height
	}
);

const outputBuffer = device.createBuffer({
	size: dimensions.width * dimensions.height * Float32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});
const outputTexture = device.createTexture({
	size: dimensions,
	format: "rgba8unorm-srgb",
	usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
});
const quadsBuffer = device.createBuffer({
	size: 10 * 10 * 8 * Float32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	mappedAtCreation: true
});
const quadsArrayBuffer = await quadsBuffer.getMappedRange();
new Float32Array(quadsArrayBuffer).set([
	//
	-1, 1, 0, 0,
	0, 0, 1, 1,
	// 
	0, 1, 0, 0,
	1, 0, 1, 1,
	//
	-1, 0, 0, 0,
	0, -1, 1, 1,
	// 
	0, 0, 0, 0,
	1, -1, 1, 1,
]);
quadsBuffer.unmap();

const textureSampler = device.createSampler({
	addressModeU: "clamp-to-edge",
	addressModeV: "clamp-to-edge",
	addressModeW: "clamp-to-edge",
	magFilter: "linear",
	minFilter: "linear",
	mipmapFilter: "linear"
});

const shaderModule = device.createShaderModule({
	code: `
		struct VertexInput {
			@builtin(vertex_index) Index: u32,
			@builtin(instance_index) Instance: u32,
		};

		struct InstanceInput {
			@location(5) TopLeftPosition: vec2<f32>,
			@location(6) TopLeftTexCoord: vec2<f32>,
			@location(7) BottomRightPosition: vec2<f32>,
			@location(8) BottomRightTexCoord: vec2<f32>,
		};

		struct VertexOutput {
			@builtin(position) Position: vec4<f32>,
			@location(0) TexCoord: vec2<f32>,
		};

		@group(0) @binding(0) var Texture: texture_2d<f32>;
		@group(0) @binding(1) var Sampler: sampler;

		@vertex
		fn vs_main(vert: VertexInput, inst: InstanceInput) -> VertexOutput {
			var out: VertexOutput;
			out.Position = vec4<f32>(
				mix(inst.TopLeftPosition.x, inst.BottomRightPosition.x, f32(vert.Index & 1u)),
				mix(inst.TopLeftPosition.y, inst.BottomRightPosition.y, f32(vert.Index < 2u)),
				0.0,
				1.0,
			);
			out.TexCoord = vec2<f32>(
				mix(inst.TopLeftTexCoord.x, inst.BottomRightTexCoord.x, f32(vert.Index & 1u)),
				mix(inst.TopLeftTexCoord.y, inst.BottomRightTexCoord.y, f32(vert.Index < 2u))
			);
			return out;
		}
		
		@fragment
		fn fs_main(frag: VertexOutput) -> @location(0) vec4<f32> {
			// return vec4<f32>(frag.TexCoord.xy, 0.5, 1.0);
			return textureSample(Texture, Sampler, frag.TexCoord);
		}
	`
});

const textureBindGroupLayout = device.createBindGroupLayout({
	entries: [
		{
			binding: 0,
			visibility: GPUShaderStage.FRAGMENT,
			texture: {
				multisampled: false,
				viewDimension: "2d",
				sampleType: "float"
			}
		},
		{
			binding: 1,
			visibility: GPUShaderStage.FRAGMENT,
			sampler: {
				type: "filtering"
			}
		}
	]
});

const textureBindGroup = device.createBindGroup({
	layout: textureBindGroupLayout,
	entries: [
		{
			binding: 0,
			resource: gpuTexture.createView()
		},
		{
			binding: 1,
			resource: textureSampler
		}
	]
});

const pipelineLayout = device.createPipelineLayout({
	bindGroupLayouts: [textureBindGroupLayout],
});

// Define the render operation
const renderPipeline = await device.createRenderPipelineAsync({
	layout: pipelineLayout,
	vertex: {
		entryPoint: "vs_main",
		module: shaderModule,
		buffers: [
			{
				arrayStride: 8 * Float32Array.BYTES_PER_ELEMENT,
				stepMode: "instance",
				attributes: [
					{
						offset: 0 * Float32Array.BYTES_PER_ELEMENT,
						shaderLocation: 5,
						format: "float32x2"
					},
					{
						offset: 2 * Float32Array.BYTES_PER_ELEMENT,
						shaderLocation: 6,
						format: "float32x2"
					},
					{
						offset: 4 * Float32Array.BYTES_PER_ELEMENT,
						shaderLocation: 7,
						format: "float32x2"
					},
					{
						offset: 6 * Float32Array.BYTES_PER_ELEMENT,
						shaderLocation: 8,
						format: "float32x2"
					},
				]
			}
		]
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
		cullMode: "back"
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
	passEncoder.setBindGroup(0, textureBindGroup);
	passEncoder.setVertexBuffer(0, quadsBuffer);
	passEncoder.draw(4, 4, 0, 0);
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
await Deno.writeFile("./hello-quads-tex.png", image);