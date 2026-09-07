import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';

const OPTIONS = { mediaType: 'photo', quality: 0.8 } as const;

/** A file the driver picked, with what the server needs to store it. */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

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

/**
 * A document from Files / Drive — the "PDF or file" the web composer offers.
 *
 * Left in the picker's default `import` mode, which hands back a COPY the app
 * can read. `open` mode returns a security-scoped url that stops being
 * readable when the picker closes — a zero-byte upload with no error anywhere.
 *
 * The type list mirrors the server's whitelist. Filtering here is a courtesy;
 * the presign refuses anything else regardless.
 */
export const pickDocument = async (): Promise<PickedFile | null> => {
  const {pick, types, errorCodes, isErrorWithCode} = await import(
    '@react-native-documents/picker'
  );
  try {
    const [file] = await pick({
      type: [
        types.pdf,
        types.plainText,
        types.csv,
        types.doc,
        types.docx,
        types.xls,
        types.xlsx,
      ],
    });
    if (!file) {
      return null;
    }
    return {
      uri: file.uri,
      name: file.name ?? 'attachment',
      type: file.type ?? 'application/octet-stream',
    };
  } catch (e: unknown) {
    // A cancel is not a failure — the caller does nothing, same as the pickers.
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return null;
    }
    throw e;
  }
};
