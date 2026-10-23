/**
 * Standard smoothstep function for softer gradient transitions
 */
const smoothstep = (min: number, max: number, value: number): number => {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
};

/**
 * Enforces seamless tiling by blending the edges of the image.
 */
export const enforceSeamlessness = (base64Image: string, blendFactor: number = 0.15): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const width = img.width;
        const height = img.height;
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }

        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const blendWidth = Math.floor(width * blendFactor);
        const blendHeight = Math.floor(height * blendFactor);

        // --- HORIZONTAL PASS ---
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < blendWidth; x++) {
            const iL = (y * width + x) * 4;
            const iR = (y * width + (width - 1 - x)) * 4;

            const avgR = (data[iL] + data[iR]) / 2;
            const avgG = (data[iL+1] + data[iR+1]) / 2;
            const avgB = (data[iL+2] + data[iR+2]) / 2;
            const avgA = (data[iL+3] + data[iR+3]) / 2;

            const t = smoothstep(0, blendWidth, x); 

            data[iL] = data[iL] * t + avgR * (1 - t);
            data[iL+1] = data[iL+1] * t + avgG * (1 - t);
            data[iL+2] = data[iL+2] * t + avgB * (1 - t);
            data[iL+3] = data[iL+3] * t + avgA * (1 - t);

            data[iR] = data[iR] * t + avgR * (1 - t);
            data[iR+1] = data[iR+1] * t + avgG * (1 - t);
            data[iR+2] = data[iR+2] * t + avgB * (1 - t);
            data[iR+3] = data[iR+3] * t + avgA * (1 - t);
          }
        }

        // --- VERTICAL PASS ---
        for (let x = 0; x < width; x++) {
          for (let y = 0; y < blendHeight; y++) {
             const iT = (y * width + x) * 4;
             const iB = ((height - 1 - y) * width + x) * 4;

             const avgR = (data[iT] + data[iB]) / 2;
             const avgG = (data[iT+1] + data[iB+1]) / 2;
             const avgB = (data[iT+2] + data[iB+2]) / 2;
             const avgA = (data[iT+3] + data[iB+3]) / 2;

             const t = smoothstep(0, blendHeight, y);

             data[iT] = data[iT] * t + avgR * (1 - t);
             data[iT+1] = data[iT+1] * t + avgG * (1 - t);
             data[iT+2] = data[iT+2] * t + avgB * (1 - t);
             data[iT+3] = data[iT+3] * t + avgA * (1 - t);

             data[iB] = data[iB] * t + avgR * (1 - t);
             data[iB+1] = data[iB+1] * t + avgG * (1 - t);
             data[iB+2] = data[iB+2] * t + avgB * (1 - t);
             data[iB+3] = data[iB+3] * t + avgA * (1 - t);
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(new Error("Image load failed"));
    img.src = base64Image;
  });
};

/**
 * Converts a Grayscale Height Map into a Tangent Space Normal Map.
 */
export const generateNormalMapFromHeight = (heightMapBase64: string, strength: number = 2.0): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error("No context")); return; }
            
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;
            const width = img.width;
            const height = img.height;
            
            const outputData = ctx.createImageData(width, height);
            const output = outputData.data;

            const getHeight = (x: number, y: number) => {
                const wx = (x + width) % width;
                const wy = (y + height) % height;
                const i = (wy * width + wx) * 4;
                return data[i] / 255.0; 
            };

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const tl = getHeight(x - 1, y - 1);
                    const t  = getHeight(x    , y - 1);
                    const tr = getHeight(x + 1, y - 1);
                    const l  = getHeight(x - 1, y    );
                    const r  = getHeight(x + 1, y    );
                    const bl = getHeight(x - 1, y + 1);
                    const b  = getHeight(x    , y + 1);
                    const br = getHeight(x + 1, y + 1);

                    const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
                    const dY = (bl + 2 * b + br) - (tl + 2 * t + tr); 

                    const nz = 1.0 / strength;
                    const len = Math.sqrt(dX * dX + dY * dY + nz * nz);
                    const nx = -dX / len;
                    const ny = -dY / len; 
                    const nz_norm = nz / len;

                    const i = (y * width + x) * 4;
                    output[i]     = (nx * 0.5 + 0.5) * 255;
                    output[i + 1] = (ny * 0.5 + 0.5) * 255;
                    output[i + 2] = (nz_norm * 0.5 + 0.5) * 255;
                    output[i + 3] = 255;
                }
            }
            ctx.putImageData(outputData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => reject(e);
        img.src = heightMapBase64;
    });
};

/**
 * Converts an RGB texture to a Simulated Depth/Height Map.
 * @param contrast 0.0 to 2.0 (Default 1.0). Controls the intensity of the depth.
 * @param blurRadius 1 to 10 (Default 1). Higher values remove texture details, keeping only structure.
 */
export const generateHeightMapFromDiffuse = (base64Image: string, contrast: number = 1.0, blurRadius: number = 1): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error("No context")); return; }
            
            const w = img.width;
            const h = img.height;

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            
            // 1. Convert to Grayscale & Find Min/Max
            let minVal = 255;
            let maxVal = 0;
            const grayBuffer = new Uint8Array(w * h);

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                // Luma
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                
                grayBuffer[i / 4] = gray;

                if (gray < minVal) minVal = gray;
                if (gray > maxVal) maxVal = gray;
            }

            if (maxVal === minVal) maxVal = minVal + 1;

            // 2. Normalize, Apply Smoothing (Variable Radius), then Apply Contrast
            const smoothedData = new Uint8Array(w * h);
            // Use the blur radius passed in. 
            // For Displacement maps, we want a HIGH radius (e.g. 4) to remove high-frequency noise.
            // For Normal maps (intermediate), we want a LOW radius (e.g. 1) to keep details.
            const radius = blurRadius; 

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let sum = 0;
                    let count = 0;

                    for (let ky = -radius; ky <= radius; ky++) {
                        for (let kx = -radius; kx <= radius; kx++) {
                            const ny = y + ky;
                            const nx = x + kx;
                            
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                sum += grayBuffer[ny * w + nx];
                                count++;
                            }
                        }
                    }
                    
                    const avg = sum / count;
                    // First Normalize (0-255)
                    let normalized = ((avg - minVal) / (maxVal - minVal)) * 255;
                    
                    // Apply User Contrast
                    // Center around 128
                    normalized = 128 + (normalized - 128) * contrast;

                    smoothedData[y * w + x] = Math.max(0, Math.min(255, normalized));
                }
            }

            for (let i = 0; i < w * h; i++) {
                const val = smoothedData[i];
                const idx = i * 4;
                data[idx] = val;
                data[idx + 1] = val;
                data[idx + 2] = val;
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => reject(e);
        img.src = base64Image;
    });
};

/**
 * Converts an RGB texture to a Roughness map.
 * @param adjustment 0.0 to 1.0. 0.0 = Smooth (Black), 1.0 = Rough (White), 0.5 = Natural
 */
export const generateRoughnessMapFromDiffuse = (base64Image: string, adjustment: number = 0.5): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error("No context")); return; }
            
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;
            
            // Calculate shift: 0.5 is neutral. 
            // 0 -> -128, 1 -> +128
            const brightnessShift = (adjustment - 0.5) * 255 * 1.5; 

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Grayscale
                let gray = 0.299 * r + 0.587 * g + 0.114 * b;
                
                // Add shift
                gray = gray + brightnessShift;
                
                // Clamp
                gray = Math.max(0, Math.min(255, gray));
                
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => reject(e);
        img.src = base64Image;
    });
};

/**
 * Generates a Metallic map.
 * @param adjustment 0.0 to 1.0. 0.0 = Non-Metal (Black), 1.0 = Metal (White).
 */
export const generateMetallicMapFromDiffuse = (base64Image: string, adjustment: number = 0.0): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error("No context")); return; }
            
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;
            
            // Base value from slider (0-255)
            const baseMetalness = adjustment * 255;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Get detail from diffuse (low opacity) to show scratches/dirt on metal
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                
                // Formula: 80% slider value + 20% texture detail
                // If slider is 0 (non-metal), result is mostly black with faint noise.
                // If slider is 1 (metal), result is mostly white with faint noise.
                let val = (baseMetalness * 0.8) + (gray * 0.2);

                val = Math.max(0, Math.min(255, val));
                
                data[i] = val;
                data[i + 1] = val;
                data[i + 2] = val;
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => reject(e);
        img.src = base64Image;
    });
};
