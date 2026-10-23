import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { CameraState, GenerationSettings } from '../types';

const IMAGE_GEN_MODEL = 'gemini-3.1-flash-image-preview';

/**
 * Generates a prompt description based on camera state coordinates and settings.
 */
const generatePromptFromState = (state: CameraState, settings: GenerationSettings): string => {
  const parts: string[] = [];
  const yaw = Math.round(state.rotationX * 180);
  const pitch = Math.round(state.rotationY * 90);

  const resolutionHint: Record<GenerationSettings['resolution'], string> = {
    '1K': 'target output quality around 1K resolution',
    '2K': 'target output quality around 2K resolution',
    '4K': 'target output quality around 4K resolution',
  };

  // Explicitly state the technical angles first
  parts.push(`STRICT CAMERA PARAMETERS: Yaw angle ${yaw} degrees, Pitch angle ${pitch} degrees`);

  // --- Rotation Logic (Yaw: -180 to 180) ---
  // Using forceful descriptions combined with exact numbers
  
  if (Math.abs(yaw) < 10) {
    // Dead center - strict front view
    parts.push(`Direct HEAD-ON front view (approx ${yaw}°), perfect symmetry`);
  } else if (yaw >= 10) {
    // RIGHT SIDE ROTATION (Positive Yaw)
    if (yaw < 35) {
      parts.push(`Camera shifted slightly right (${yaw}°), showing the subject's right side`);
    } else if (yaw < 70) {
      parts.push(`Oblique angle from the RIGHT (${yaw}°), significantly revealing the right side depth`);
    } else if (yaw < 110) {
      // 90 degrees - Strict Profile
      parts.push(`PERFECT 90-degree RIGHT PROFILE view (actual angle ${yaw}°). The camera is strictly perpendicular to the subject's right side. You see ONLY the right side profile. The front face is largely HIDDEN or in profile`);
    } else if (yaw < 155) {
      parts.push(`Rear-angle view from behind the right shoulder (${yaw}°). The subject is facing away from the camera to the left`);
    } else {
      parts.push(`Direct BACK view (${yaw}°), seeing the complete back of the subject. The face is NOT visible`);
    }
  } else if (yaw <= -10) {
    // LEFT SIDE ROTATION (Negative Yaw)
    if (yaw > -35) {
      parts.push(`Camera shifted slightly left (${yaw}°), showing the subject's left side`);
    } else if (yaw > -70) {
      parts.push(`Oblique angle from the LEFT (${yaw}°), significantly revealing the left side depth`);
    } else if (yaw > -110) {
       // -90 degrees - Strict Profile
      parts.push(`PERFECT 90-degree LEFT PROFILE view (actual angle ${yaw}°). The camera is strictly perpendicular to the subject's left side. You see ONLY the left side profile. The front face is largely HIDDEN or in profile`);
    } else if (yaw > -155) {
      parts.push(`Rear-angle view from behind the left shoulder (${yaw}°). The subject is facing away from the camera to the right`);
    } else {
      parts.push(`Direct BACK view (${yaw}°), seeing the complete back of the subject. The face is NOT visible`);
    }
  }

  // --- Rotation Logic (Pitch: -90 to 90) ---
  if (pitch > 10) {
     if (pitch > 45) parts.push(`Extreme TOP-DOWN overhead view (${pitch}°), looking vertically down`);
     else parts.push(`High camera angle (${pitch}°), looking DOWN at the subject from above`);
  } 
  else if (pitch < -10) {
     if (pitch < -45) parts.push(`Extreme BOTTOM-UP view (${pitch}°), looking vertically up`);
     else parts.push(`Low camera angle (${pitch}°), looking UP at the subject from below`);
  }

  // --- Movement Logic ---
  if (Math.abs(state.moveX) > 0.1) {
    const direction = state.moveX < 0 ? "left" : "right";
    const intensity = Math.abs(state.moveX) > 0.5 ? "DRAMATICALLY shift" : "Shift";
    parts.push(`${intensity} the camera position to the ${direction} (value: ${state.moveX.toFixed(2)}), changing the composition balance`);
  }

  if (Math.abs(state.moveZ) > 0.1) {
    if (state.moveZ < -0.1) {
       const intensity = state.moveZ < -0.5 ? "Wide shot, camera moved FAR back to show environment" : "Zoom out, move camera backward";
       parts.push(`${intensity} (Z-depth: ${state.moveZ.toFixed(2)})`);
    } else {
       const intensity = state.moveZ > 0.5 ? "Extreme CLOSE-UP, camera moved VERY close to details" : "Zoom in, move camera forward";
       parts.push(`${intensity} (Z-depth: ${state.moveZ.toFixed(2)})`);
    }
  }

  // --- Eye Contact Logic ---
  if (settings.eyeContact) {
    parts.push("Subject's eyes MUST track and look directly at the camera lens");
  } else {
    parts.push("Subject maintains original eye direction relative to their head. If the camera moves to the side, the subject DOES NOT look at the camera");
  }

  // --- Consistency Logic ---
  // Updated to ensure occlusion is understood as part of consistency
  const consistencyInstruction = "CRITICAL INSTRUCTION: This is a 3D RE-RENDERING task. 1) The subject's 3D pose is FROZEN in space. 2) Because the camera moves around the subject, parts of the subject that were visible may become HIDDEN, and new parts may become VISIBLE. 3) For profile views, do NOT try to show the front of the face if the angle demands a side view. 4) Maintain consistent lighting, clothing, and background spatial logic.";
  const qualityInstruction = `QUALITY TARGET: ${resolutionHint[settings.resolution]}.`;

  if (parts.length === 0) {
    return `Enhance image clarity and details. ${qualityInstruction} ${consistencyInstruction}`;
  }

  return `Render the image from a NEW CAMERA ANGLE: ${parts.join(". ")}. ${qualityInstruction} ${consistencyInstruction}`;
};

/**
 * Generates a new perspective image based on camera state and settings
 */
export const generateNewPerspective = async (
  base64Image: string,
  cameraState: CameraState,
  settings: GenerationSettings
): Promise<string> => {
  try {
    const prompt = generatePromptFromState(cameraState, settings);
    
    // Extract base64 data (remove data URL prefix if present)
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    
    // Detect mime type from base64 string
    let mimeType = 'image/png';
    if (base64Image.includes('data:image/jpeg')) mimeType = 'image/jpeg';
    else if (base64Image.includes('data:image/jpg')) mimeType = 'image/jpeg';
    else if (base64Image.includes('data:image/webp')) mimeType = 'image/webp';

    const response = await generateContent({
      model: IMAGE_GEN_MODEL,
      task: 'image_gen',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {},
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error("模型未返回图像，可能是参数设置导致生成被拒绝，请重试。");
    }

    return imageUrl;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const message = error instanceof Error ? error.message : "生成图片失败，请稍后重试。";
    throw new Error(message);
  }
};

