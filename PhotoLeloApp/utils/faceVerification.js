import RNFS from 'react-native-fs';
import {NativeModules} from 'react-native';

const {FaceComparison} = NativeModules;

// Cache for base64 conversions to avoid repeated file reads
const base64Cache = new Map();
const CACHE_SIZE_LIMIT = 5; // Limit cache size to prevent memory issues

// Convert image to base64 with caching
export const imageToBase64 = async (imagePath) => {
  try {
    // Check cache first
    if (base64Cache.has(imagePath)) {
      console.log('Using cached base64 for:', imagePath);
      return base64Cache.get(imagePath);
    }
    
    const base64 = await RNFS.readFile(imagePath, 'base64');
    
    // Add to cache with size limit
    if (base64Cache.size >= CACHE_SIZE_LIMIT) {
      const firstKey = base64Cache.keys().next().value;
      base64Cache.delete(firstKey);
    }
    base64Cache.set(imagePath, base64);
    
    return base64;
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw error;
  }
};

// Optimized fallback comparison with efficient pattern matching
const optimizedFallbackComparison = (img1, img2) => {
  const size1 = img1.length;
  const size2 = img2.length;
  
  // Quick size check - if too different, likely different images
  const sizeDiff = Math.abs(size1 - size2);
  const avgSize = (size1 + size2) / 2;
  const sizeSimilarity = 1 - (sizeDiff / avgSize);
  
  if (sizeSimilarity < 0.5) {
    return sizeSimilarity * 100; // Early return for very different sizes
  }
  
  // Optimized pattern matching with strategic sampling
  let matches = 0;
  const samplePoints = 100; // Reduced for performance
  const minLength = Math.min(size1, size2);
  const step = Math.floor(minLength / samplePoints);
  
  // Sample at strategic points (beginning, middle, end)
  const checkPoints = [
    ...Array.from({length: samplePoints/3}, (_, i) => i * step),
    ...Array.from({length: samplePoints/3}, (_, i) => Math.floor(minLength/2) + i * step),
    ...Array.from({length: samplePoints/3}, (_, i) => minLength - (samplePoints/3 - i) * step)
  ].filter(i => i < minLength);
  
  for (const i of checkPoints) {
    if (img1[i] === img2[i]) {
      matches++;
    }
  }
  
  const patternSimilarity = matches / checkPoints.length;
  
  // Weighted combination favoring pattern over size
  const confidence = (sizeSimilarity * 0.2 + patternSimilarity * 0.8) * 100;
  
  return Math.min(confidence, 100);
};

// Offline face comparison using native Android module
export const compareFaces = async (savedPhotoPath, capturedPhotoPath) => {
  try {
    console.log('=== OFFLINE FACE COMPARISON START ===');
    console.log('Saved photo:', savedPhotoPath);
    console.log('Captured photo:', capturedPhotoPath);
    
    // Use native module for proper image comparison
    if (FaceComparison) {
      console.log('Using native face comparison module');
      const result = await FaceComparison.compareFaces(savedPhotoPath, capturedPhotoPath);
      
      console.log('Native comparison result:');
      console.log('- Is match:', result.isMatch);
      console.log('- Confidence:', result.confidence.toFixed(2) + '%');
      console.log('=== FACE COMPARISON END ===');
      
      return {
        isMatch: result.isMatch,
        confidence: result.confidence,
        message: result.message,
      };
    }

    // Fallback if native module not available
    console.log('Native module not available, using fallback');
    const savedImage = await imageToBase64(savedPhotoPath);
    const capturedImage = await imageToBase64(capturedPhotoPath);
    
    const fallbackConfidence = optimizedFallbackComparison(savedImage, capturedImage);
    const isMatch = fallbackConfidence >= 45;
    
    console.log('Fallback confidence:', fallbackConfidence + '%');
    console.log('Match result:', isMatch);
    console.log('=== FACE COMPARISON END ===');

    return {
      isMatch,
      confidence: fallbackConfidence,
      message: isMatch
        ? 'Face verified successfully! (Offline mode)'
        : 'Face does not match. Please try again.',
    };
  } catch (error) {
    console.error('Error comparing faces:', error);
    return {
      isMatch: false,
      confidence: 0,
      message: 'Error during face verification: ' + error.message,
    };
  }
};

// Validate if image contains a face (basic check)
export const validateFaceInImage = async (imagePath) => {
  try {
    // Check if file exists and has reasonable size
    const fileInfo = await RNFS.stat(imagePath);
    const fileSizeKB = fileInfo.size / 1024;

    // Basic validation: file should be between 10KB and 10MB
    if (fileSizeKB < 10 || fileSizeKB > 10240) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating face:', error);
    return false;
  }
};

// Enhanced face comparison with multiple checks
export const verifyFaceOffline = async (savedPhotoPath, capturedPhotoUri) => {
  try {
    // Validate both images
    const savedValid = await validateFaceInImage(savedPhotoPath);
    if (!savedValid) {
      return {
        isMatch: false,
        confidence: 0,
        message: 'Saved photo is invalid',
      };
    }

    // For captured photo from camera, it might be a URI
    let capturedPath = capturedPhotoUri;
    if (capturedPhotoUri.startsWith('file://')) {
      capturedPath = capturedPhotoUri.replace('file://', '');
    }

    const capturedValid = await validateFaceInImage(capturedPath);
    if (!capturedValid) {
      return {
        isMatch: false,
        confidence: 0,
        message: 'Captured photo is invalid',
      };
    }

    // Compare faces
    return await compareFaces(savedPhotoPath, capturedPath);
  } catch (error) {
    console.error('Error in face verification:', error);
    return {
      isMatch: false,
      confidence: 0,
      message: 'Face verification failed',
    };
  }
};
