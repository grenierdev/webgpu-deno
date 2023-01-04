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
};

const outputBuffer = device.createBuffer({
	size: dimensions.width * dimensions.height * Float32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});
const outputTexture = device.createTexture({
	size: dimensions,
	format: "rgba8unorm",
	usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
});

const img = JPEG.decode(await Deno.readFile("./uv_grid_opengl.jpg"), { formatAsRGBA: true });
const atlasBitmapData = new Uint8Array(img.data);
const atlasTexture = device.createTexture({
	size: {
		width: img.width,
		height: img.height,
	},
	format: "rgba8unorm",
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
});
device.queue.writeTexture(
	{
		texture: atlasTexture,
	},
	atlasBitmapData,
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
const atlasSampler = device.createSampler({
	addressModeU: "clamp-to-edge",
	addressModeV: "clamp-to-edge",
	addressModeW: "clamp-to-edge",
	magFilter: "linear",
	minFilter: "linear"
});

const tileMapData = new Uint32Array(new Array(10 * 10).fill(0).map((_, i) => (i + 1) % 3 ? i : 0));
const tileMapTexture = device.createTexture({
	size: {
		width: 10,
		height: 10
	},
	format: "r32uint",
	usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
});
device.queue.writeTexture(
	{
		texture: tileMapTexture
	},
	tileMapData,
	{
		offset: 0,
		bytesPerRow: Uint32Array.BYTES_PER_ELEMENT * 1 * 10,
		rowsPerImage: 10
	},
	{
		width: 10,
		height: 10
	}
);
const tileMapSampler = device.createSampler({
	addressModeU: "clamp-to-edge",
	addressModeV: "clamp-to-edge",
	addressModeW: "clamp-to-edge",
	magFilter: "nearest",
	minFilter: "nearest"
});

const quadsBuffer = device.createBuffer({
	size: 10 * 10 * 8 * Float32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	mappedAtCreation: true
});
new Float32Array(quadsBuffer.getMappedRange()).set([
	-1, 1,
	1, -1,
]);
quadsBuffer.unmap();

const tileMapUniform = new Uint32Array([
	img.width, img.height,
	10, 10
]);
const tileMapUniformBuffer = device.createBuffer({
	size: tileMapUniform.byteLength,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	mappedAtCreation: true
});
new Uint32Array(tileMapUniformBuffer.getMappedRange()).set(tileMapUniform);
tileMapUniformBuffer.unmap();

const shaderModule = device.createShaderModule({
	code: `
		struct VertexInput {
			@builtin(vertex_index) Index: u32,
			@builtin(instance_index) Instance: u32,
		};

		struct InstanceInput {
			@location(5) TopLeftPosition: vec2<f32>,
			@location(6) BottomRightPosition: vec2<f32>,
		};

		struct VertexOutput {
			@builtin(position) Position: vec4<f32>,
			@location(0) UV: vec2<f32>
		};

		struct TileMap {
			MapSize: vec2<u32>,
			TileSize: vec2<u32>,
		};

		@group(0) @binding(0) var AtlasTexture: texture_2d<f32>;
		@group(0) @binding(1) var AtlasSampler: sampler;
		@group(1) @binding(0) var TileMapTexture: texture_2d<u32>;
		@group(1) @binding(1) var TileMapSampler: sampler;
		@group(2) @binding(0) var<uniform> TileMap: TileMap;

		@vertex
		fn vs_main(vert: VertexInput, inst: InstanceInput) -> VertexOutput {
			var out: VertexOutput;
			out.Position = vec4<f32>(
				mix(inst.TopLeftPosition.x, inst.BottomRightPosition.x, f32(vert.Index & 1u)),
				mix(inst.TopLeftPosition.y, inst.BottomRightPosition.y, f32(vert.Index < 2u)),
				0f,
				1f,
			);
			out.UV = vec2<f32>(
				mix(0f, 1f, f32(vert.Index & 1u)),
				1f - mix(1f, 0f, f32(vert.Index < 2u))
			);
			return out;
		}
		
		@fragment
		fn fs_main(frag: VertexOutput) -> @location(0) vec4<f32> {
			// return vec4<f32>(frag.UV, 0.5, 1f);							// visualize quad UV

			let tileSizeF32 = vec2<f32>(TileMap.TileSize);
			let tileUV = (frag.UV % (1f / tileSizeF32)) * tileSizeF32;
			
			// return vec4<f32>(tileUV, 0.5, 1f);							// visualize tile UV

			let tilePosition = vec2<i32>(frag.UV / (1f / tileSizeF32));
			let tileIdx = textureLoad(TileMapTexture, tilePosition, 0i).r;

			// return vec4<f32>(f32(tileIdx) / 255f, 0f, 0f, 1f);			// visualize tile index

			let atlasTileSize = vec2<u32>(10u, 10u);

			let atlasPosition = vec2<u32>(
				tileIdx % atlasTileSize.x,
				tileIdx / atlasTileSize.x
			);

			// return vec4<f32>(vec2<f32>(atlasPosition) / 255f, 0f, 1f);	// visualize atlas position

			let atlasUV = vec2<f32>(atlasPosition) / vec2<f32>(atlasTileSize) + tileUV * (1f / tileSizeF32);
			
			// return vec4<f32>(atlasUV, 0f, 1f);
			return textureSample(AtlasTexture, AtlasSampler, atlasUV);
		}
	`
});

const atlasBindGroupLayout = device.createBindGroupLayout({
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

const atlasBindGroup = device.createBindGroup({
	layout: atlasBindGroupLayout,
	entries: [
		{
			binding: 0,
			resource: atlasTexture.createView()
		},
		{
			binding: 1,
			resource: atlasSampler
		}
	]
});

const tileMapBindGroupLayout = device.createBindGroupLayout({
	entries: [
		{
			binding: 0,
			visibility: GPUShaderStage.FRAGMENT,
			texture: {
				multisampled: false,
				viewDimension: "2d",
				sampleType: "uint"
			}
		},
		{
			binding: 1,
			visibility: GPUShaderStage.FRAGMENT,
			sampler: {
				type: "non-filtering"
			}
		}
	]
});

const tileMapBindGroup = device.createBindGroup({
	layout: tileMapBindGroupLayout,
	entries: [
		{
			binding: 0,
			resource: tileMapTexture.createView()
		},
		{
			binding: 1,
			resource: tileMapSampler
		}
	]
});

const tileMapUniformBindGroupLayout = device.createBindGroupLayout({
	entries: [
		{
			binding: 0,
			visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
			buffer: {
				type: "uniform"
			}
		}
	]
});

const tileMapUniformBindGroup = device.createBindGroup({
	layout: tileMapUniformBindGroupLayout,
	entries: [
		{
			binding: 0,
			resource: {
				buffer: tileMapUniformBuffer
			}
		}
	]
});

const pipelineLayout = device.createPipelineLayout({
	bindGroupLayouts: [
		atlasBindGroupLayout,
		tileMapBindGroupLayout,
		tileMapUniformBindGroupLayout
	],
});

const renderPipeline = await device.createRenderPipelineAsync({
	layout: pipelineLayout,
	vertex: {
		entryPoint: "vs_main",
		module: shaderModule,
		buffers: [
			{
				arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
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
				]
			}
		]
	},
	fragment: {
		entryPoint: "fs_main",
		module: shaderModule,
		targets: [
			{
				format: "rgba8unorm",
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
	passEncoder.setBindGroup(0, atlasBindGroup);
	passEncoder.setBindGroup(1, tileMapBindGroup);
	passEncoder.setBindGroup(2, tileMapUniformBindGroup);
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
await Deno.writeFile("./tilemap.png", image);