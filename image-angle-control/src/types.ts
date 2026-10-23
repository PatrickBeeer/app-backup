
export interface CameraState {
  // Vector Pad (-1 to 1)
  rotationX: number; // Left/Right (Yaw)
  rotationY: number; // Up/Down (Pitch)

  // Linear Slider (-1 to 1)
  moveZ: number; // Forward/Backward Dolly
}

export interface GenerationSettings {
  mode: 'standard' | 'pro';
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  eyeContact: boolean; // true = look at camera, false = natural/away
  subjectType: 'auto' | 'person' | 'product'; // controls prompt vocabulary / camera framing
}

export interface GeneratedImage {
  url: string;
  timestamp: number;
}

export interface GenerationHistoryItem {
  id: string;
  url: string;
  timestamp: number;
  cameraState: CameraState;
  settings: GenerationSettings;
  viewLabel: string;
}

export interface UserState {
  credits: number;
}
