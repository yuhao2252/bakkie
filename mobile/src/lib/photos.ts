import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

// import_job_photos.position allows 0–9.
export const MAX_PHOTOS = 10;

// Long enough edge for Claude to read small label text; keeps uploads and token costs small.
const LONG_EDGE_PX = 1600;

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

export async function takePhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Bakkie needs camera access to photograph a bag. You can allow it in the iPhone Settings app.');
  }

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;

  const { uri, width, height } = result.assets[0];
  return { uri, width, height };
}

export async function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 1,
  });
  if (result.canceled) return [];

  return result.assets.map(({ uri, width, height }) => ({ uri, width, height }));
}

// Always re-encodes as JPEG: iPhone photos are often HEIC, which the storage
// bucket rejects and Claude cannot read.
export async function prepareForUpload(photo: PickedPhoto): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > LONG_EDGE_PX) {
    context.resize(photo.width >= photo.height ? { width: LONG_EDGE_PX } : { height: LONG_EDGE_PX });
  }

  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}
