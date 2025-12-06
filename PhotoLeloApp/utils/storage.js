import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import CryptoJS from 'crypto-js';

const STORAGE_KEYS = {
  USER_DATA: 'user_data',
  PHOTO_HASH: 'photo_hash',
  PHOTO_PATH: 'photo_path',
};

// Generate hash for filename
export const generateHash = (username) => {
  return CryptoJS.SHA256(username).toString();
};

// Save user data after login
export const saveUserData = async (user) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
};

// Get saved user data
export const getUserData = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

// Download and save photo locally
export const downloadAndSavePhoto = async (photoUrl, username) => {
  try {
    const hash = generateHash(username);
    // Extract file extension from URL - decode first to handle encoded URLs
    const decodedUrl = decodeURIComponent(photoUrl.split('?')[0]);
    const fileExtension = decodedUrl.split('.').pop().toLowerCase() || 'jpg';
    const fileName = `${hash}.${fileExtension}`;
    const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

    console.log('=== PHOTO DOWNLOAD DEBUG ===');
    console.log('Username:', username);
    console.log('Hash:', hash);
    console.log('Original URL:', photoUrl);
    console.log('File extension:', fileExtension);
    console.log('Target file path:', filePath);
    console.log('Document directory:', RNFS.DocumentDirectoryPath);

    // Check if file already exists
    const alreadyExists = await RNFS.exists(filePath);
    if (alreadyExists) {
      console.log('Photo already exists, deleting old version...');
      await RNFS.unlink(filePath);
    }

    // Download the photo with headers
    const downloadResult = await RNFS.downloadFile({
      fromUrl: photoUrl,
      toFile: filePath,
      background: false,
      discretionary: false,
      cacheable: false,
      progressDivider: 1,
      begin: (res) => {
        console.log('Download started, status:', res.statusCode);
        console.log('Content length:', res.contentLength);
        console.log('Headers:', JSON.stringify(res.headers));
      },
      progress: (res) => {
        const progress = (res.bytesWritten / res.contentLength) * 100;
        console.log(`Download progress: ${progress.toFixed(0)}%`);
      },
    }).promise;

    console.log('=== DOWNLOAD COMPLETE ===');
    console.log('Status code:', downloadResult.statusCode);
    console.log('Bytes written:', downloadResult.bytesWritten);
    console.log('Job ID:', downloadResult.jobId);

    if (downloadResult.statusCode === 200 && downloadResult.bytesWritten > 0) {
      // Verify file exists
      const fileExists = await RNFS.exists(filePath);
      console.log('File exists after download:', fileExists);

      if (fileExists) {
        const fileStats = await RNFS.stat(filePath);
        console.log('File size:', fileStats.size, 'bytes');
        console.log('File path:', fileStats.path);
        console.log('Is file:', fileStats.isFile());

        if (fileStats.size > 0) {
          // Save the file path
          await AsyncStorage.setItem(STORAGE_KEYS.PHOTO_PATH, filePath);
          await AsyncStorage.setItem(STORAGE_KEYS.PHOTO_HASH, hash);
          console.log('✓ Photo saved successfully!');
          console.log('=========================');
          return filePath;
        } else {
          throw new Error('Downloaded file is empty (0 bytes)');
        }
      } else {
        throw new Error('File was not created after download');
      }
    } else {
      throw new Error(
        `Download failed. Status: ${downloadResult.statusCode}, Bytes: ${downloadResult.bytesWritten}`
      );
    }
  } catch (error) {
    console.error('=== DOWNLOAD ERROR ===');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('======================');
    throw error;
  }
};

// Get saved photo path
export const getSavedPhotoPath = async () => {
  try {
    const path = await AsyncStorage.getItem(STORAGE_KEYS.PHOTO_PATH);
    if (path && (await RNFS.exists(path))) {
      return path;
    }
    return null;
  } catch (error) {
    console.error('Error getting photo path:', error);
    return null;
  }
};

// Clear all stored data (logout)
export const clearStorage = async () => {
  try {
    const photoPath = await AsyncStorage.getItem(STORAGE_KEYS.PHOTO_PATH);
    if (photoPath && (await RNFS.exists(photoPath))) {
      await RNFS.unlink(photoPath);
    }
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_DATA,
      STORAGE_KEYS.PHOTO_HASH,
      STORAGE_KEYS.PHOTO_PATH,
    ]);
  } catch (error) {
    console.error('Error clearing storage:', error);
  }
};

// Check if user is logged in
export const isUserLoggedIn = async () => {
  try {
    const userData = await getUserData();
    const photoPath = await getSavedPhotoPath();
    return userData !== null && photoPath !== null;
  } catch (error) {
    return false;
  }
};
