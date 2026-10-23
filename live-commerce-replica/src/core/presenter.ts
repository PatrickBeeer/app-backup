import type { PresenterMode, Project } from './types.js';

export function resolvePresenterMode(
  project: Pick<Project, 'presenterMode' | 'personPhotos'>
): PresenterMode {
  return project.presenterMode ?? (project.personPhotos.length > 0 ? 'reference' : 'generated');
}
