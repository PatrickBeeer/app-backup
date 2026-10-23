export interface CameraState {
  // Vector Pad (-1 to 1)
  rotationX: number; // Left/Right (Yaw)
  rotationY: number; // Up/Down (Pitch)
  
  // Linear Sliders (-1 to 1)
  moveX: number; // Left/Right Truck
  moveZ: number; // Forward/Backward Dolly
}

export interface GenerationSettings {
  resolution: '1K' | '2K' | '4K';
  eyeContact: boolean; // true = look at camera, false = natural/away
}

