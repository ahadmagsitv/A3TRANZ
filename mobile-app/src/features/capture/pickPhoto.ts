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

/** The library, chosen deliberately — only offered where it is allowed. */
export const pickFromLibrary = async (): Promise<string | null> =>
  uriOf(await launchImageLibrary(OPTIONS));

/**
 * The camera, chosen deliberately.
 *
 * Unlike `pickPhoto` this does NOT fall back to the library: the caller asked
 * for the camera from a menu that offers the library right beside it, so a
 * silent substitution would just be the wrong one of two things they picked
 * between. A camera that cannot open says so.
 */
export const takePhoto = async (): Promise<string | null> => {
  const shot = await launchCamera(OPTIONS);
  if (shot.errorCode) {
    throw new Error(
      shot.errorCode === 'camera_unavailable'
        ? 'No camera available on this device.'
        : 'The camera needs permission before it can be used.',
    );
  }
  return uriOf(shot);
};
