import { CameraState, GenerationSettings } from '../types';
import { extractImageFromResponse, generateContent } from '../../../../shared_services/geminiProxyService';

const STANDARD_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';

type SubjectType = GenerationSettings['subjectType'];

const getTargetCameraSide = (yaw: number, subjectType: SubjectType) => {
  if (Math.abs(yaw) < 8) return null;

  const isProduct = subjectType === 'product';

  if (yaw > 0) {
    return isProduct
      ? {
          code: 'USER_RIGHT_ORBIT_PRODUCT_LEFT_SIDE',
          ui: 'RIGHT-SIDE SHOOTING',
          userOrbit: "to the photographer/user's RIGHT from the current front view",
          cameraSide: "the product's LEFT-facing side (the surface that appears on the viewer's LEFT in the original front image)",
          visibleSide: "the product's left-facing side surface",
          forbiddenSide: "the product's RIGHT-facing side surface",
          cameraScreenSide: "the camera is on the viewer's RIGHT side of the original front-view setup",
          nearBodyCues: 'the product\'s left side, left edge, and left-facing surfaces should be closer to and more visible to the camera',
          forbiddenBodyCues: "do not make the product's right side the dominant near side",
          frontReference: 'In the original front image, this is the side that appears on the viewer\'s LEFT.',
        }
      : {
          code: 'USER_RIGHT_ORBIT_MODEL_LEFT_SIDE',
          ui: 'RIGHT-SIDE SHOOTING',
          userOrbit: "to the photographer/user's RIGHT from the current front view",
          cameraSide: "the subject/body anatomical LEFT side",
          visibleSide: "the subject/body anatomical LEFT side surface",
          forbiddenSide: "the subject/body anatomical RIGHT side surface",
          cameraScreenSide: "the camera is on the viewer's RIGHT side of the original front-view setup",
          nearBodyCues:
            "the subject's left cheek, left shoulder, left arm, and left side of the torso should be closer to the camera and more visible",
          forbiddenBodyCues:
            "do not make the subject's right cheek, right shoulder, right arm, or right torso side the dominant near side",
          frontReference:
            "If the subject is facing the camera in a front view, this is the side that appears on the viewer's RIGHT.",
        };
  }

  return isProduct
    ? {
        code: 'USER_LEFT_ORBIT_PRODUCT_RIGHT_SIDE',
        ui: 'LEFT-SIDE SHOOTING',
        userOrbit: "to the photographer/user's LEFT from the current front view",
        cameraSide: "the product's RIGHT-facing side (the surface that appears on the viewer's RIGHT in the original front image)",
        visibleSide: "the product's right-facing side surface",
        forbiddenSide: "the product's LEFT-facing side surface",
        cameraScreenSide: "the camera is on the viewer's LEFT side of the original front-view setup",
        nearBodyCues: 'the product\'s right side, right edge, and right-facing surfaces should be closer to and more visible to the camera',
        forbiddenBodyCues: "do not make the product's left side the dominant near side",
        frontReference: 'In the original front image, this is the side that appears on the viewer\'s RIGHT.',
      }
    : {
        code: 'USER_LEFT_ORBIT_MODEL_RIGHT_SIDE',
        ui: 'LEFT-SIDE SHOOTING',
        userOrbit: "to the photographer/user's LEFT from the current front view",
        cameraSide: "the subject/body anatomical RIGHT side",
        visibleSide: "the subject/body anatomical RIGHT side surface",
        forbiddenSide: "the subject/body anatomical LEFT side surface",
        cameraScreenSide: "the camera is on the viewer's LEFT side of the original front-view setup",
        nearBodyCues:
          "the subject's right cheek, right shoulder, right arm, and right side of the torso should be closer to the camera and more visible",
        forbiddenBodyCues:
          "do not make the subject's left cheek, left shoulder, left arm, or left torso side the dominant near side",
        frontReference:
          "If the subject is facing the camera in a front view, this is the side that appears on the viewer's LEFT.",
      };
};

const getSideGuardInstructions = (target: NonNullable<ReturnType<typeof getTargetCameraSide>>) => [
  `SIDE DISAMBIGUATION: ${target.frontReference}`,
  `Required visible side: ${target.visibleSide}.`,
  `Camera placement cue: ${target.cameraScreenSide}.`,
  `Near-side cue: ${target.nearBodyCues}.`,
  `Forbidden wrong side: do NOT show mainly ${target.forbiddenSide}.`,
  `Forbidden cue: ${target.forbiddenBodyCues}.`,
  'Do not mirror the image to fake the side; synthesize the true new camera-side viewpoint.',
];

const getCameraYawInstruction = (yaw: number, subjectType: SubjectType) => {
  const absYaw = Math.abs(yaw);
  const target = getTargetCameraSide(yaw, subjectType);

  if (!target) {
    return subjectType === 'product'
      ? ['CAMERA ORBIT: 0 degrees. Keep a direct front view of the product.']
      : ['CAMERA ORBIT: 0 degrees. Keep a direct front-facing camera angle.', 'Do not add a side view when yaw is close to zero.'];
  }

  if (absYaw < 30) {
    return [
      `CURRENT TARGET CAMERA SIDE ONLY: ${target.code}.`,
      `CURRENT UI MEANING: ${target.ui}. Move the virtual camera ${target.userOrbit}; this lands on ${target.cameraSide}.`,
      `The output must reveal ${target.visibleSide}, about ${absYaw} degrees from the front.`,
      ...getSideGuardInstructions(target),
      'Do not preserve the uploaded source viewpoint if it does not match this target side.',
    ];
  }

  if (absYaw < 70) {
    return [
      `CURRENT TARGET CAMERA SIDE ONLY: ${target.code}.`,
      `CURRENT UI MEANING: ${target.ui}. Move the virtual camera ${target.userOrbit}; this lands on ${target.cameraSide}.`,
      `CAMERA ORBIT: use a strong three-quarter photograph that clearly reveals ${target.visibleSide}, about ${absYaw} degrees from the front.`,
      ...getSideGuardInstructions(target),
      'If the uploaded photo is from a different side, synthesize the requested target side instead of copying the source side.',
      'Do not preserve the original frontal composition.',
    ];
  }

  if (absYaw < 115) {
    return [
      `CURRENT TARGET CAMERA SIDE ONLY: ${target.code}.`,
      `CURRENT UI MEANING: ${target.ui}. Move the virtual camera ${target.userOrbit}; this lands on ${target.cameraSide}.`,
      `CAMERA ORBIT: use a strict side/profile photograph that reveals ${target.visibleSide}, about 90 degrees from the front.`,
      `Hard constraint: the camera must be on ${target.cameraSide}.`,
      ...getSideGuardInstructions(target),
      'If the uploaded source is currently photographed from another side, synthesize this target side view.',
      'This must look like a new photograph taken from the side, not a front view with edits.',
    ];
  }

  if (absYaw < 155) {
    return [
      `CURRENT TARGET CAMERA SIDE ONLY: ${target.code}, rear angle.`,
      `CURRENT UI MEANING: ${target.ui}. Move the virtual camera ${target.userOrbit}; this lands on ${target.cameraSide}.`,
      `CAMERA ORBIT: move behind the subject while staying on ${target.cameraSide}, about ${absYaw} degrees from the front.`,
      ...getSideGuardInstructions(target),
      subjectType === 'product'
        ? 'The output should show rear-side surfaces and hide most frontal surfaces of the product.'
        : 'The output should show rear-side surfaces and hide most frontal facial details.',
    ];
  }

  return subjectType === 'product'
    ? [
        'CAMERA ORBIT: use a direct back view, 180 degrees from the original camera.',
        'Frontal product details should not be visible unless physically visible from behind.',
      ]
    : [
        'CAMERA ORBIT: use a direct back view, 180 degrees from the original camera.',
        'The face should not be visible unless physically visible from behind.',
      ];
};

const getCameraPitchInstruction = (pitch: number, subjectType: SubjectType) => {
  const absPitch = Math.abs(pitch);
  if (absPitch < 8) return ['CAMERA PITCH: eye-level angle.'];

  if (pitch > 0) {
    if (subjectType === 'product') {
      return [
        `CAMERA PITCH: raise the camera ${absPitch} degrees and shoot straight DOWN at the product from above.`,
        'TOP-DOWN REQUIREMENT: the output must clearly reveal the product\'s TOP FACE / top surface — the lid, top panel, top label, opening, controls, or any detail that faces upward. Maintain the product\'s true upright orientation (do not lay it flat unless the source already shows it flat) and keep its exact design.',
        absPitch > 45
          ? 'Use a near-vertical overhead shot so the top face dominates the frame with correct foreshortening.'
          : 'Use a clear high-angle view that still shows the top face with correct perspective.',
        'Keep consistent perspective, lighting, and a grounded contact shadow so it reads as a real overhead photograph of the same product.',
      ];
    }
    return [
      `CAMERA PITCH: raise the camera ${absPitch} degrees and look downward.`,
      absPitch > 45 ? 'Use a dramatic top-down view.' : 'Use a clear high-angle view.',
    ];
  }

  if (subjectType === 'product') {
    return [
      `CAMERA PITCH: lower the camera ${absPitch} degrees and look UP at the product from below.`,
      'LOW-ANGLE REQUIREMENT: reveal the product\'s BOTTOM / underside, base, bottom label, or lower structure that faces downward, while keeping the product\'s upright orientation and exact design.',
      absPitch > 45
        ? 'Use a dramatic bottom-up shot that emphasizes the underside.'
        : 'Use a clear low-angle view that reveals the lower portion of the product.',
      'Keep consistent perspective and lighting; preserve exact product geometry and details.',
    ];
  }
  return [
    `CAMERA PITCH: lower the camera ${absPitch} degrees and look upward.`,
    absPitch > 45 ? 'Use a dramatic low-angle bottom-up view.' : 'Use a clear low-angle view.',
  ];
};

const getCameraMoveInstruction = (state: CameraState) => {
  const parts: string[] = [];

  if (Math.abs(state.moveZ) > 0.1) {
    if (state.moveZ < 0) {
      parts.push(`CAMERA DOLLY OUT: move the camera backward for a wider shot; value ${state.moveZ.toFixed(2)}. Keep the subject fully framed and preserve spatial context.`);
    } else {
      parts.push(`CAMERA DOLLY IN: move the camera physically forward for a tighter close-up; value ${state.moveZ.toFixed(2)}. This is a real closer camera view, not digital enlargement.`);
      parts.push('For a person or model, tighten the framing toward the head, shoulders, chest, and upper body, while keeping facial and clothing details natural and undistorted.');
      parts.push('For a product or object, make the product fill more of the frame and reveal fine material, edge, label, and construction details without changing its design.');
    }
  }

  return parts;
};

const generatePromptFromState = (state: CameraState, settings: GenerationSettings): string => {
  const subjectType = settings.subjectType ?? 'auto';
  const isProduct = subjectType === 'product';
  const yaw = Math.round(state.rotationX * 180);
  const pitch = Math.round(state.rotationY * 90);

  const eyeContactInstruction = settings.eyeContact
    ? 'Eye contact: rotate the eyes/head only as physically needed so the subject looks toward the new camera lens.'
    : 'Eye contact: preserve the original gaze direction relative to the head. Do not force the subject to look at the camera.';

  const subjectIntro = isProduct
    ? [
        'The UI control is a 3D cube gimbal: horizontal cube rotation controls photographer/user left-right orbit, and vertical cube rotation controls high-angle or low-angle pitch.',
        'All left/right directions are from the photographer/user current front-view perspective, not from the product\'s own perspective.',
        'ABSOLUTE SIDE MAPPING: gimbal RIGHT / positive yaw means the photographer moves to the photographer\'s RIGHT and the image must show the product\'s LEFT-facing side (the surface that appears on the viewer\'s LEFT in the original front image). This is the product\'s left side, not its right.',
        'ABSOLUTE SIDE MAPPING: gimbal LEFT / negative yaw means the photographer moves to the photographer\'s LEFT and the image must show the product\'s RIGHT-facing side (the surface that appears on the viewer\'s RIGHT in the original front image). This is the product\'s right side, not its left.',
        'If a left/right label conflicts with the visual cue, prioritize the camera placement cue and near-side cue.',
        'Most important: obey CURRENT_TARGET CAMERA SIDE ONLY. Ignore every side not explicitly named as the current target.',
        'The prompt has already converted the UI control into one exact target camera side. Follow only that target side.',
      ]
    : [
        'The UI control is a 3D cube gimbal: horizontal cube rotation controls photographer/user left-right orbit, and vertical cube rotation controls high-angle or low-angle pitch.',
        'All left/right directions are from the photographer/user current front-view perspective, not from the model/body self-perspective.',
        'ABSOLUTE SIDE MAPPING: gimbal RIGHT / positive yaw means the photographer moves to the photographer\'s RIGHT, reaches the model\'s LEFT side, and the image must show the model\'s LEFT side. This is not the model\'s right side.',
        'ABSOLUTE SIDE MAPPING: gimbal LEFT / negative yaw means the photographer moves to the photographer\'s LEFT, reaches the model\'s RIGHT side, and the image must show the model\'s RIGHT side. This is not the model\'s left side.',
        'For left-side shooting, the required subject side is the side that appears on the viewer left in a normal front-facing reference image; avoid the opposite side.',
        'For left-side shooting specifically: the camera is on the viewer-left side of the original setup; the subject right cheek/right shoulder/right arm/right torso side must be the near and visible side.',
        'If anatomical left/right labels conflict with the visual cue, prioritize the camera placement cue and near-body cue.',
        'Most important: obey CURRENT_TARGET CAMERA SIDE ONLY. Ignore every side not explicitly named as the current target.',
        'The prompt has already converted the UI control into one exact target camera side. Follow only that target side.',
      ];

  const gazeInstruction = isProduct
    ? 'For a product there is no gaze or eye contact; keep the product consistently oriented and detailed across the new viewpoint.'
    : eyeContactInstruction;

  const preserveInstruction = isProduct
    ? 'Preserve exact product materials, color, geometry, logo, text, packaging, lighting style, and scene consistency.'
    : 'Preserve identity, clothing, materials, lighting style, and scene consistency.';

  const productConstraints = isProduct
    ? [
        'Treat the uploaded product as the single source of truth: preserve exact silhouette, proportions, geometry, color, material, texture, logo, text, packaging, hardware, and distinctive details. Do not redesign, beautify, simplify, duplicate, melt, bend, or invent product parts. Keep the product grounded with physically consistent contact shadows and perspective.',
        'Keep the original scene/background style unless the requested camera position naturally reveals more of it. Generate a true camera view around the same product, not a new product on a generic background. Do not turn a product into a person or add hands, people, props, or decorative elements unless they are already present in the source.',
        'Negative prompt for products: no altered logo or lettering, no incorrect symmetry, no extra components, no missing components, no melted edges, no warped packaging, no invented reflections, and no generic replacement product.',
      ]
    : subjectType === 'auto'
      ? [
          'First identify whether the source is a person/model or a product/object. For product/object images, treat the uploaded product as the single source of truth: preserve exact silhouette, proportions, geometry, color, material, texture, logo, text, packaging, hardware, and distinctive details. Do not redesign, beautify, simplify, duplicate, melt, bend, or invent product parts. Keep the product grounded with physically consistent contact shadows and perspective.',
          'For product/object images, keep the original scene/background style unless the requested camera position naturally reveals more of it. Generate a true camera view around the same product, not a new product on a generic background. Do not turn a product into a person or add hands, people, props, or decorative elements unless they are already present in the source.',
          'Negative prompt for products: no altered logo or lettering, no incorrect symmetry, no extra components, no missing components, no melted edges, no warped packaging, no invented reflections, and no generic replacement product.',
        ]
      : [];

  return [
    'You are editing the uploaded image into a NEW CAMERA VIEW.',
    'The uploaded image is only the source scene. The output must be a new photograph from the requested virtual camera position.',
    ...subjectIntro,
    `Raw controls: yaw=${yaw} degrees, pitch=${pitch} degrees, dolly=${state.moveZ.toFixed(2)}.`,
    ...getCameraYawInstruction(yaw, subjectType),
    ...getCameraPitchInstruction(pitch, subjectType),
    ...getCameraMoveInstruction(state),
    gazeInstruction,
    preserveInstruction,
    'Infer hidden geometry when the new angle reveals surfaces that were not visible in the original.',
    ...productConstraints,
    'Negative prompt: do not merely crop, pan, zoom, rotate the flat image, or keep the original frontal angle when a side/rear angle is requested.',
    'Negative prompt: do not keep the same side as the uploaded source if the target side asks for a different virtual camera side.',
  ].join(' ');
};

const getSystemInstruction = (cameraState: CameraState, subjectType: SubjectType) => {
  const yaw = Math.round(cameraState.rotationX * 180);
  const target = getTargetCameraSide(yaw, subjectType);

  if (subjectType === 'product') {
    const base = [
      'Highest priority: generate the image from the requested virtual camera position around the SAME product.',
      'Treat the uploaded product as the single source of truth: preserve exact silhouette, proportions, geometry, color, material, texture, logo, text, packaging, hardware, and distinctive details. Do not redesign, beautify, melt, bend, or invent product parts.',
      'This is a true virtual camera orbit/pitch task, not a crop, mirror, or flat image rotation. Infer hidden geometry when the new angle reveals surfaces not visible in the original.',
      'When a top-down (high-angle) pitch is requested, the product\'s top face must be clearly visible and correctly oriented; when a low-angle pitch is requested, reveal the underside/base.',
      'Do not turn the product into a person, and do not add hands, people, props, or decorative elements unless present in the source.',
      'Keep the original scene/background style unless the requested camera position naturally reveals more of it.',
    ];
    if (!target) return [...base, 'For near-zero yaw, keep a direct front view of the product.'].join(' ');
    return [
      ...base,
      `Current target camera side code: ${target.code}.`,
      `Current UI meaning: ${target.ui}; move camera ${target.userOrbit}; reveal ${target.visibleSide}.`,
      `Side disambiguation: ${target.frontReference}`,
      `Camera placement cue: ${target.cameraScreenSide}.`,
      `Near-side cue: ${target.nearBodyCues}.`,
      `Forbidden wrong side: do not show mainly ${target.forbiddenSide}.`,
      `Forbidden cue: ${target.forbiddenBodyCues}.`,
      'If the source image is already from any other side, switch to the current target side instead of preserving the source viewpoint.',
    ].join(' ');
  }

  if (!target) {
    return 'Follow the requested camera angle exactly. For near-zero yaw, keep a front camera view.';
  }

  return [
    'Highest priority: generate the image from the current target camera side only.',
    'Use photographer/user perspective for every left/right decision: positive yaw = gimbal right = camera at model left = show model left; negative yaw = gimbal left = camera at model right = show model right.',
    `Current target camera side code: ${target.code}.`,
    `Current UI meaning: ${target.ui}; move camera ${target.userOrbit}; reveal ${target.visibleSide}.`,
    `Side disambiguation: ${target.frontReference}`,
    `Camera placement cue: ${target.cameraScreenSide}.`,
    `Near-body cue: ${target.nearBodyCues}.`,
    `Forbidden wrong side: do not show mainly ${target.forbiddenSide}.`,
    `Forbidden body cue: ${target.forbiddenBodyCues}.`,
    'If the source image is already from any other side, switch to the current target side instead of preserving the source viewpoint.',
    'This is a virtual camera orbit task, not a crop, mirror, or flat image rotation task.',
  ].join(' ');
};

const extractSourceImage = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) {
    throw new Error('\u56fe\u7247\u683c\u5f0f\u65e0\u6cd5\u8bc6\u522b\uff0c\u8bf7\u4e0a\u4f20 PNG\u3001JPG \u6216 WebP \u56fe\u7247\u3002');
  }

  return {
    mimeType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1],
    data: match[2],
  };
};

export const generateNewPerspective = async (
  base64Image: string,
  cameraState: CameraState,
  settings: GenerationSettings
): Promise<string> => {
  const sourceImage = extractSourceImage(base64Image);
  const prompt = generatePromptFromState(cameraState, settings);
  const model = settings.mode === 'pro' ? PRO_IMAGE_MODEL : STANDARD_IMAGE_MODEL;
  const imageSize = settings.mode === 'pro' ? '2K' : '1K';

  const response = await generateContent({
    model,
    task: 'image_gen',
    billing_task: settings.mode === 'pro' ? 'image_gen_2k' : 'image_gen_1k',
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            data: sourceImage.data,
            mimeType: sourceImage.mimeType,
          },
        },
      ],
    },
    systemInstruction: {
      parts: [{ text: getSystemInstruction(cameraState, settings.subjectType ?? 'auto') }],
    },
    config: {
      imageConfig: {
        imageSize,
        aspectRatio: settings.aspectRatio,
      },
    },
  });

  const image = extractImageFromResponse(response);
  if (!image) {
    throw new Error('\u6a21\u578b\u6ca1\u6709\u8fd4\u56de\u56fe\u50cf\u3002\u8bf7\u589e\u5927\u4e91\u53f0\u504f\u822a\u89d2\u5ea6\uff0c\u6216\u6362\u4e00\u5f20\u56fe\u7247\u91cd\u8bd5\u3002');
  }

  return image;
};
