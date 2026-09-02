import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';

const OPTIONS = { mediaType: 'photo', quality: 0.8 } as const;

const uriOf = (r: ImagePickerResponse): string | null =>
  r.didCancel ? null : r.assets?.[0]?.uri ?? null;

/**
 * Evidence is shot, not chosen — `launchCamera` is the primary path.
 *
 * It fails on a simulator and on a device that denied the camera (`errorCode`
 * `camera_unavailable` / `permission`), which is exactly where QA lives, so the
 * library is the fallback rather than an error. A cancel returns null and the
 * caller does nothing; a cancel is not a failure.
 */
export const pickPhoto = async (): Promise<string | null> => {
  const shot = await launchCamera(OPTIONS);
  if (!shot.errorCode) {
    return uriOf(shot);
  }
  return uriOf(await launchImageLibrary(OPTIONS));
};
