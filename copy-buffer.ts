// Source: https://web.dev/gpu-compute/

/**
 * Takeaways
 * 
 * Buffer need to be mapped (allocated) on GPU before writing. `.mapAsync` is
 * used to wait for the buffer to be mapped.
 * 
 * Javascript needs to take ownership of the buffer before reading or writing.
 * `.getMappedRange()` is used to retrieve the underlying buffer.
 * 
 * Javascript needs to release ownership of the buffer before the GPU can
 * use the buffer. `.unmap()` is used to release the underlying buffer.
 */

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter!.requestDevice();

const gpuBufferA = device.createBuffer({
	size: 4,
	usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC
});
const gpuBufferB = device.createBuffer({
	size: 4,
	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
});

// Wait for the buffer to be is allocated/mapped
await gpuBufferA.mapAsync(GPUMapMode.WRITE);

// Take ownership of buffer
const arrayBufferA = gpuBufferA.getMappedRange();
new Uint8Array(arrayBufferA).set([0, 1, 2, 3]);

// Release ownership of buffer
gpuBufferA.unmap();

// Batch commands
const copyEncoder = device.createCommandEncoder();

// Copy GPU buffer A to buffer B
copyEncoder.copyBufferToBuffer(gpuBufferA, 0, gpuBufferB, 0, 4);

// Submit commands to GPU
device.queue.submit([copyEncoder.finish()]);

// Wait for the buffer to be is allocated/mapped
await gpuBufferB.mapAsync(GPUMapMode.READ);

const arrayBufferB = gpuBufferB.getMappedRange();
console.log(new Uint8Array(arrayBufferB));
gpuBufferB.unmap();