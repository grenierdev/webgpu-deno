import { getRowPadding } from "@std/webgpu/row-padding";
import { assertOutputBufferFromSnapshot, assertSnapshot } from "./utils.test.ts";
import { createBufferWithContents, createCapture, resliceBufferWithPadding } from "./utils.ts";
import { createTextureWithData } from "@std/webgpu/texture-with-data";
import { decode } from "pngs";

Deno.test("quads blending", async (t) => {
	const adapter = await navigator.gpu.requestAdapter();
	const device = await adapter?.requestDevice()!;

	device.addEventListener("uncapturederror", (event) => {
		console.error("Uncaptured GPU error:", (event as any).error.message);
	});

	const dimensions = {
		width: 8,
		height: 8,
	};

	const bytesPerRow = getRowPadding(dimensions.width).padded;

	const outputBuffer = device.createBuffer({
		label: "Buffer",
		size: bytesPerRow * dimensions.height,
		usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
	});

	const texture = device.createTexture({
		label: "Texture",
		size: {
			width: 32,
			height: 32,
		},
		format: "r32uint",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
	});

	const shaderModule = device.createShaderModule({
		label: "ShaderModule",
		code: `
			@group(0) @binding(0)
      		var tex: texture_storage_2d<r32uint, write>;

			// Pack 2x 15-bit unsigned integers and 1x 2-bit unsigned integer into a single 32-bit unsigned integer
			fn packUVA(c: vec3<u32>) -> u32 {
				let u = (c.x & 0x7FFFu);
				let v = (c.y & 0x7FFFu) << 15;
				let a = (c.z & 0x3u) << 30;
				return u | v | a;
			}

			fn unpackUVA(packed: u32) -> vec3<u32> {
				let u = packed & 0x7FFFu;
				let v = (packed >> 15) & 0x7FFFu;
				let a = (packed >> 30) & 0x3u;
				return vec3<u32>(u, v, a);
			}


			@compute
			@workgroup_size(1)
			fn cs_main(
				@builtin(global_invocation_id) id : vec3<u32>,
			) {
				let coord = pack4xU8(vec4<u32>(id.xy, 0u, 0u));
				textureStore(tex, id.xy, vec4<u32>(coord, 0u, 0u, 0u));
			}
		`,
	});

	const pipelineLayout = device.createPipelineLayout({
		label: "PipelineLayout",
		bindGroupLayouts: [
			device.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.COMPUTE,
						storageTexture: {
							access: "write-only",
							format: "r32uint",
							viewDimension: "2d",
						},
					},
				],
			}),
		],
	});

	const computePipeline = device.createComputePipeline({
		label: "ComputePipeline",
		// layout: "auto",
		layout: pipelineLayout,
		compute: {
			module: shaderModule,
		},
	});

	const bindGroup = device.createBindGroup({
		label: "BindGroup",
		// layout: pipelineLayout,
		layout: computePipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: texture.createView() },
		],
	});

	const commandEncoder = device.createCommandEncoder({ label: "CommandEncoder" });
	const computePass = commandEncoder.beginComputePass();
	computePass.setPipeline(computePipeline);
	computePass.setBindGroup(0, bindGroup);
	computePass.dispatchWorkgroups(texture.width, texture.height);
	computePass.end();

	commandEncoder.copyTextureToBuffer(
		{ texture },
		{ buffer: outputBuffer, bytesPerRow },
		dimensions,
	);

	const commandBuffer = commandEncoder.finish();
	device.queue.submit([commandBuffer]);

	await outputBuffer.mapAsync(GPUMapMode.READ);

	const data = new Uint32Array(
		resliceBufferWithPadding(
			new Uint8Array(outputBuffer.getMappedRange()),
			dimensions.width,
			dimensions.height,
		).buffer,
	);

	console.log(data);

	await assertSnapshot(t, data);

	device.destroy();
});
