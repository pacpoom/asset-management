/**
 * A client-side image compression utility.
 * Takes a File object, compresses it, and returns a new compressed File object.
 *
 * @param file The original image file.
 * @param options Configuration for compression.
 * @param options.quality The quality of the output image (0 to 1).
 * @param options.maxWidth The maximum width of the output image.
 * @param options.maxHeight The maximum height of the output image.
 * @returns A promise that resolves with the compressed file.
 */
export function compressImage(
	file: File,
	options: { quality?: number; maxWidth?: number; maxHeight?: number } = {}
): Promise<File> {
	return new Promise((resolve, reject) => {
		const { quality = 0.8, maxWidth = 1920, maxHeight = 1080 } = options;
		const reader = new FileReader();

		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				let { width, height } = img;

				// Calculate new dimensions while maintaining aspect ratio
				if (width > height) {
					if (width > maxWidth) {
						height = Math.round((height * maxWidth) / width);
						width = maxWidth;
					}
				} else {
					if (height > maxHeight) {
						width = Math.round((width * maxHeight) / height);
						height = maxHeight;
					}
				}

				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');

				if (!ctx) {
					return reject(new Error('Failed to get canvas context.'));
				}

				// Draw image to canvas
				ctx.drawImage(img, 0, 0, width, height);

				// Convert canvas to blob, then to file
				canvas.toBlob(
					(blob) => {
						if (!blob) {
							return reject(new Error('Canvas to Blob conversion failed.'));
						}
						// Create a new File object with a modified name
						const newFileName = `compressed-${file.name}`;
						const compressedFile = new File([blob], newFileName, {
							type: 'image/jpeg', // Force jpeg for best compression
							lastModified: Date.now()
						});
						resolve(compressedFile);
					},
					'image/jpeg',
					quality
				);
			};

			img.onerror = (error) => {
				reject(error);
			};

			if (event.target?.result) {
				img.src = event.target.result as string;
			} else {
				reject(new Error('FileReader did not load the image.'));
			}
		};

		reader.onerror = (error) => {
			reject(error);
		};

		reader.readAsDataURL(file);
	});
}
