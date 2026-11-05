import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';

const OPTIONS = { mediaType: 'photo', quality: 0.8 } as const;

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

const uriOf = (r: ImagePickerResponse): string | null =>
  r.didCancel ? null : r.assets?.[0]?.uri ?? null;

export const pickPhoto = async (): Promise<string | null> => {
  const shot = await launchCamera(OPTIONS);
  if (!shot.errorCode) {
    return uriOf(shot);
  }
  return uriOf(await launchImageLibrary(OPTIONS));
};

export const pickFromLibrary = async (): Promise<string | null> =>
  uriOf(await launchImageLibrary(OPTIONS));

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
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return null;
    }
    throw e;
  }
};
