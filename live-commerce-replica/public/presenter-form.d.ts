export type PresenterFormMode = 'reference' | 'generated';

export interface PresenterFormState {
  mode: PresenterFormMode;
  forced: boolean;
  requiresPhotos: boolean;
  message: string;
}

export function presenterFormState(
  duration: number | undefined,
  requestedMode: PresenterFormMode
): PresenterFormState;
