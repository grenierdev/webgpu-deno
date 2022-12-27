// Source: https://web.dev/gpu-compute/

/**
 * Takeaways
 * 
 * BindGroupLayout defines the interface of input/output used in a
 * program.
 * 
 * BindGroup is the actual data of the BindGroupLayout. This means that 
 * multiple BindGroup can share the same layout.
 * 
 * ShaderModule is the program.
 * 
 * PipelineLayout defines the interface of the pipeline
 * 
 * ComputePipeline binds the pipeline layout and program together. This
 * means that multiple program can be shared between pipelines.
 * 
 */

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter!.requestDevice();

const matrixA = new Float32Array([
	2 /* rows */, 4 /* cols */,
	1, 2, 3, 4,
	5, 6, 7, 8
]);
const matrixB = new Float32Array([
	4 /* rows */, 2 /* cols */,
	1, 2,
	3, 4,
	5, 6,
	7, 8
]);
const resultMatrixSize = Float32Array.BYTES_PER_ELEMENT * (2 + matrixA[0] * matrixB[1]);

const gpuBufferA = device.createBuffer({
	size: matrixA.byteLength,
	usage: GPUBufferUsage.STORAGE,
	mappedAtCreation: true
});
const gpuBufferB = device.createBuffer({
	size: matrixB.byteLength,
	usage: GPUBufferUsage.STORAGE,
	mappedAtCreation: true
});
const gpuBufferC = device.createBuffer({
	size: resultMatrixSize,
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
});
const gpuBufferD = device.createBuffer({
	size: resultMatrixSize,
	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
});

// await gpuBufferA.mapAsync(GPUMapMode.WRITE);
const arrayBufferA = gpuBufferA.getMappedRange();
new Float32Array(arrayBufferA).set(matrixA);
gpuBufferA.unmap();

// await gpuBufferB.mapAsync(GPUMapMode.WRITE);
const arrayBufferB = gpuBufferB.getMappedRange();
new Float32Array(arrayBufferB).set(matrixB);
gpuBufferB.unmap();

// BindGroupLayout is the input/ouput interface of the shader
const bindGroupLayout = device.createBindGroupLayout({
	entries: [
		{
			binding: 0,
			visibility: GPUShaderStage.COMPUTE,
			buffer: {
				type: "read-only-storage"
			}
		}, {
			binding: 1,
			visibility: GPUShaderStage.COMPUTE,
			buffer: {
				type: "read-only-storage"
			}
		}, {
			binding: 2,
			visibility: GPUShaderStage.COMPUTE,
			buffer: {
				type: "storage"
			}
		}
	]
});

// BindGroup is the actual data of the BindGroupLayout
const bindGroup = device.createBindGroup({
	layout: bindGroupLayout,
	entries: [
		{
			binding: 0,
			resource: {
				buffer: gpuBufferA,
			}
		}, {
			binding: 1,
			resource: {
				buffer: gpuBufferB
			}
		}, {
			binding: 2,
			resource: {
				buffer: gpuBufferC
			}
		}
	]
});

// WGSL program
const shaderModule = device.createShaderModule({
	code: `
		// matrixA/B/C
		struct Matrix {
			size: vec2<f32>,		// rows, cols
			numbers: array<f32>,	// ...rest
		}

		@group(0) @binding(0) var<storage, read> matrixA: Matrix;
		@group(0) @binding(1) var<storage, read> matrixB: Matrix;
		@group(0) @binding(2) var<storage, read_write> matrixC: Matrix;

		@compute @workgroup_size(8, 8)
		fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
			// Guard against out-of-bounds work group sizes
			if (global_id.x >= u32(matrixA.size.x) || global_id.y >= u32(matrixB.size.y)) {
				return;
			}

			matrixC.size = vec2(matrixA.size.x, matrixB.size.y);

			let resultCell = vec2(global_id.x, global_id.y);
			var result = 0.0;
			for (var i = 0u; i < u32(matrixA.size.y); i = i + 1u) {
				let a = i + resultCell.x * u32(matrixA.size.y);
				let b = resultCell.y + i * u32(matrixB.size.y);
				result = result + matrixA.numbers[a] * matrixB.numbers[b];
			}

			let index = resultCell.y + resultCell.x * u32(matrixB.size.y);
			matrixC.numbers[index] = result;
		}
	`
});

// 
const pipelineLayout = device.createPipelineLayout({
	bindGroupLayouts: [bindGroupLayout],
});

// Define the compute operation
const computePipeline = await device.createComputePipelineAsync({
	layout: pipelineLayout,
	compute: {
		module: shaderModule,
		entryPoint: "main"
	}
});

// Batch commands
const computeEncoder = device.createCommandEncoder();

// Compute pass
{
	const passEncoder = computeEncoder.beginComputePass();
	const workgroupCountX = Math.ceil(matrixA[0] / 8);
	const workgroupCountY = Math.ceil(matrixB[1] / 8);
	passEncoder.setPipeline(computePipeline);
	passEncoder.setBindGroup(0, bindGroup); // @group(0) in WGSL
	passEncoder.dispatchWorkgroups(workgroupCountX, workgroupCountY);
	passEncoder.end();
}

// Copy result
computeEncoder.copyBufferToBuffer(
	gpuBufferC,
	0,
	gpuBufferD,
	0,
	resultMatrixSize
);

device.queue.submit([computeEncoder.finish()]);

// Wait for the buffer to be is allocated/mapped
await gpuBufferD.mapAsync(GPUMapMode.READ);

const arrayBufferD = gpuBufferD.getMappedRange();
console.log(new Float32Array(arrayBufferD));
gpuBufferD.unmap();