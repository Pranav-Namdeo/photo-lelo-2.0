package com.photoleloapp;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.util.Log;
import android.util.LruCache;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class FaceComparisonModule extends ReactContextBaseJavaModule {
    
    private static final String TAG = "FaceComparison";
    private static final int MAX_IMAGE_SIZE = 1024; // Max dimension for processing
    private static final int CACHE_SIZE = 10; // Cache for processed features
    
    private FaceDetector detector;
    private ExecutorService executorService;
    private LruCache<String, double[]> featureCache;
    
    public FaceComparisonModule(ReactApplicationContext reactContext) {
        super(reactContext);
        
        // Initialize optimized ML Kit Face Detector
        FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                .setMinFaceSize(0.1f)
                .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
                .build();
        
        detector = FaceDetection.getClient(options);
        executorService = Executors.newSingleThreadExecutor();
        
        // Initialize feature cache
        featureCache = new LruCache<String, double[]>(CACHE_SIZE) {
            @Override
            protected int sizeOf(String key, double[] features) {
                return features.length * 8; // 8 bytes per double
            }
        };
    }

    @Override
    public String getName() {
        return "FaceComparison";
    }

    @ReactMethod
    public void compareFaces(String imagePath1, String imagePath2, Promise promise) {
        Bitmap bitmap1 = null;
        Bitmap bitmap2 = null;
        
        try {
            Log.d(TAG, "Starting face comparison...");
            Log.d(TAG, "Image 1 path: " + imagePath1);
            Log.d(TAG, "Image 2 path: " + imagePath2);
            
            // Load and properly orient both images
            bitmap1 = loadAndOrientBitmap(imagePath1);
            bitmap2 = loadAndOrientBitmap(imagePath2);

            if (bitmap1 == null || bitmap2 == null) {
                promise.reject("ERROR", "Failed to load images");
                return;
            }

            Log.d(TAG, "Images loaded successfully");
            Log.d(TAG, "Image 1 size: " + bitmap1.getWidth() + "x" + bitmap1.getHeight());
            Log.d(TAG, "Image 2 size: " + bitmap2.getWidth() + "x" + bitmap2.getHeight());
            
            // Detect faces in both images
            // Try multiple rotations if face not detected
            InputImage image1 = InputImage.fromBitmap(bitmap1, 0);
            InputImage image2 = InputImage.fromBitmap(bitmap2, 0);
            
            Log.d(TAG, "Created InputImages for face detection");
            
            final Bitmap finalBitmap1 = bitmap1;
            final Bitmap finalBitmap2 = bitmap2;
            
            // Process first image
            detector.process(image1)
                .addOnSuccessListener(faces1 -> {
                    Log.d(TAG, "Faces detected in image 1: " + faces1.size());
                    
                    if (faces1.isEmpty()) {
                        Log.w(TAG, "No face detected in first image, using fallback comparison");
                        // Fallback to full image comparison
                        performFallbackComparison(finalBitmap1, finalBitmap2, promise);
                        cleanup(finalBitmap1, finalBitmap2);
                        return;
                    }
                    
                    // Process second image
                    detector.process(image2)
                        .addOnSuccessListener(faces2 -> {
                            Log.d(TAG, "Faces detected in image 2: " + faces2.size());
                            
                            if (faces2.isEmpty()) {
                                Log.w(TAG, "No face detected in second image, using fallback comparison");
                                // Fallback to full image comparison
                                performFallbackComparison(finalBitmap1, finalBitmap2, promise);
                                cleanup(finalBitmap1, finalBitmap2);
                                return;
                            }
                            
                            try {
                                // Get the largest face from each image
                                Face face1 = getLargestFace(faces1);
                                Face face2 = getLargestFace(faces2);
                                
                                // Extract face regions with padding
                                Bitmap faceBitmap1 = extractFaceRegion(finalBitmap1, face1);
                                Bitmap faceBitmap2 = extractFaceRegion(finalBitmap2, face2);
                                
                                if (faceBitmap1 == null || faceBitmap2 == null) {
                                    promise.reject("ERROR", "Failed to extract face regions");
                                    cleanup(finalBitmap1, finalBitmap2);
                                    return;
                                }
                                
                                Log.d(TAG, "Face regions extracted successfully");
                                
                                // Extract features from face regions only
                                double[] features1 = extractFaceFeatures(faceBitmap1);
                                double[] features2 = extractFaceFeatures(faceBitmap2);
                                
                                // Clean up face bitmaps
                                faceBitmap1.recycle();
                                faceBitmap2.recycle();
                                
                                // Calculate similarity
                                double distance = calculateEuclideanDistance(features1, features2);
                                
                                Log.d(TAG, "Raw distance: " + distance);
                                Log.d(TAG, "Feature vector length: " + features1.length);
                                
                                // Normalize distance - face-only comparison has different scale
                                // Same person: 0.5-3.0
                                // Different people: 3.5+
                                double normalizedDistance = Math.min(distance / 5.0, 1.0);
                                double confidence = (1 - normalizedDistance) * 100;
                                
                                Log.d(TAG, "Normalized distance: " + normalizedDistance);
                                Log.d(TAG, "Confidence: " + confidence + "%");
                                
                                // Threshold: 70% for face-only comparison (more lenient since we're only comparing faces)
                                boolean isMatch = confidence >= 70.0;
                                
                                Log.d(TAG, "Threshold: 70%, Match: " + isMatch);

                                WritableMap result = Arguments.createMap();
                                result.putBoolean("isMatch", isMatch);
                                result.putDouble("confidence", confidence);
                                result.putString("message", isMatch ? 
                                    "Face verified successfully!" : 
                                    "Face does not match. Confidence: " + String.format("%.1f", confidence) + "%");

                                promise.resolve(result);
                                cleanup(finalBitmap1, finalBitmap2);
                                
                            } catch (Exception e) {
                                Log.e(TAG, "Error during face comparison", e);
                                promise.reject("ERROR", e.getMessage());
                                cleanup(finalBitmap1, finalBitmap2);
                            }
                        })
                        .addOnFailureListener(e -> {
                            Log.e(TAG, "Face detection failed for image 2", e);
                            promise.reject("DETECTION_ERROR", "Face detection failed: " + e.getMessage());
                            cleanup(finalBitmap1, finalBitmap2);
                        });
                })
                .addOnFailureListener(e -> {
                    Log.e(TAG, "Face detection failed for image 1", e);
                    promise.reject("DETECTION_ERROR", "Face detection failed: " + e.getMessage());
                    cleanup(finalBitmap1, finalBitmap2);
                });

        } catch (Exception e) {
            Log.e(TAG, "Error in compareFaces", e);
            promise.reject("ERROR", e.getMessage());
            cleanup(bitmap1, bitmap2);
        }
    }
    
    private Face getLargestFace(List<Face> faces) {
        Face largest = faces.get(0);
        int maxArea = 0;
        
        for (Face face : faces) {
            Rect bounds = face.getBoundingBox();
            int area = bounds.width() * bounds.height();
            if (area > maxArea) {
                maxArea = area;
                largest = face;
            }
        }
        
        return largest;
    }
    
    private Bitmap extractFaceRegion(Bitmap bitmap, Face face) {
        try {
            Rect bounds = face.getBoundingBox();
            
            // Add 30% padding around face
            int padding = (int) (Math.max(bounds.width(), bounds.height()) * 0.3);
            
            int left = Math.max(0, bounds.left - padding);
            int top = Math.max(0, bounds.top - padding);
            int right = Math.min(bitmap.getWidth(), bounds.right + padding);
            int bottom = Math.min(bitmap.getHeight(), bounds.bottom + padding);
            
            int width = right - left;
            int height = bottom - top;
            
            if (width <= 0 || height <= 0) {
                return null;
            }
            
            Log.d(TAG, "Extracting face region: " + left + "," + top + " " + width + "x" + height);
            
            return Bitmap.createBitmap(bitmap, left, top, width, height);
            
        } catch (Exception e) {
            Log.e(TAG, "Error extracting face region", e);
            return null;
        }
    }
    
    private void cleanup(Bitmap bitmap1, Bitmap bitmap2) {
        try {
            if (bitmap1 != null && !bitmap1.isRecycled()) {
                bitmap1.recycle();
            }
            if (bitmap2 != null && !bitmap2.isRecycled()) {
                bitmap2.recycle();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error during cleanup", e);
        }
    }
    
    private Bitmap loadAndOrientBitmap(String path) {
        try {
            String filePath = path.replace("file://", "");
            File file = new File(filePath);
            
            if (!file.exists()) {
                Log.e(TAG, "File does not exist: " + filePath);
                return null;
            }

            // First, get image dimensions without loading full bitmap
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(filePath, bounds);
            
            // Calculate sample size for memory optimization
            int sampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight, MAX_IMAGE_SIZE);
            
            // Load optimized bitmap
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inPreferredConfig = Bitmap.Config.RGB_565; // Use less memory
            options.inSampleSize = sampleSize;
            options.inMutable = true;
            
            Bitmap bitmap = BitmapFactory.decodeFile(filePath, options);
            
            if (bitmap == null) {
                Log.e(TAG, "Failed to decode bitmap from: " + filePath);
                return null;
            }

            // Handle orientation efficiently
            return handleOrientation(bitmap, filePath);
            
        } catch (OutOfMemoryError e) {
            Log.e(TAG, "Out of memory loading bitmap: " + path, e);
            System.gc(); // Suggest garbage collection
            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error loading bitmap", e);
            return null;
        }
    }
    
    private int calculateSampleSize(int width, int height, int maxSize) {
        int sampleSize = 1;
        if (height > maxSize || width > maxSize) {
            final int halfHeight = height / 2;
            final int halfWidth = width / 2;
            
            while ((halfHeight / sampleSize) >= maxSize && (halfWidth / sampleSize) >= maxSize) {
                sampleSize *= 2;
            }
        }
        return sampleSize;
    }
    
    private Bitmap handleOrientation(Bitmap bitmap, String filePath) {
        try {
            ExifInterface exif = new ExifInterface(filePath);
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            
            if (orientation == ExifInterface.ORIENTATION_NORMAL) {
                return bitmap;
            }
            
            Matrix matrix = new Matrix();
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    matrix.postRotate(90);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    matrix.postRotate(180);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    matrix.postRotate(270);
                    break;
                default:
                    return bitmap;
            }
            
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (rotated != bitmap) {
                bitmap.recycle();
            }
            return rotated;
            
        } catch (IOException e) {
            Log.w(TAG, "Failed to read EXIF data", e);
            return bitmap;
        }
    }
    
    private double[] extractFaceFeatures(Bitmap faceBitmap) {
        // Check cache first
        String cacheKey = generateCacheKey(faceBitmap);
        double[] cachedFeatures = featureCache.get(cacheKey);
        if (cachedFeatures != null) {
            Log.d(TAG, "Using cached features");
            return cachedFeatures;
        }
        
        // Extract optimized features from FACE REGION ONLY
        double[] features = new double[64]; // Reduced feature vector size for performance
        int index = 0;
        
        // 1. Optimized skin tone features (16 values)
        double[] skinTone = extractOptimizedSkinTone(faceBitmap);
        System.arraycopy(skinTone, 0, features, index, skinTone.length);
        index += skinTone.length;
        
        // 2. Spatial color distribution (24 values - 3x3 grid)
        double[] spatial = extractOptimizedSpatialFeatures(faceBitmap);
        System.arraycopy(spatial, 0, features, index, spatial.length);
        index += spatial.length;
        
        // 3. Color histogram (24 values - reduced bins)
        double[] histogram = extractOptimizedHistogram(faceBitmap);
        System.arraycopy(histogram, 0, features, index, histogram.length);
        
        // Cache the features
        featureCache.put(cacheKey, features);
        
        return features;
    }
    
    private String generateCacheKey(Bitmap bitmap) {
        // Simple hash based on bitmap properties
        return String.valueOf(bitmap.getWidth() * bitmap.getHeight() * bitmap.getConfig().hashCode());
    }
    
    private double[] extractOptimizedSkinTone(Bitmap bitmap) {
        double[] features = new double[16];
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        
        // Sample pixels efficiently (every 4th pixel)
        int step = Math.max(1, Math.min(width, height) / 50);
        
        double sumR = 0, sumG = 0, sumB = 0;
        double sumR2 = 0, sumG2 = 0, sumB2 = 0;
        int count = 0;
        
        for (int y = 0; y < height; y += step) {
            for (int x = 0; x < width; x += step) {
                int pixel = bitmap.getPixel(x, y);
                int r = (pixel >> 16) & 0xff;
                int g = (pixel >> 8) & 0xff;
                int b = pixel & 0xff;
                
                if (isSkinTone(r, g, b)) {
                    sumR += r; sumG += g; sumB += b;
                    sumR2 += r * r; sumG2 += g * g; sumB2 += b * b;
                    count++;
                }
            }
        }
        
        if (count > 0) {
            double meanR = sumR / count, meanG = sumG / count, meanB = sumB / count;
            features[0] = meanR / 255.0;
            features[1] = meanG / 255.0;
            features[2] = meanB / 255.0;
            features[3] = Math.sqrt(sumR2 / count - meanR * meanR) / 255.0;
            features[4] = Math.sqrt(sumG2 / count - meanG * meanG) / 255.0;
            features[5] = Math.sqrt(sumB2 / count - meanB * meanB) / 255.0;
            features[6] = (double) count / ((width / step) * (height / step));
        }
        
        return features;
    }
    
    private double[] extractOptimizedSpatialFeatures(Bitmap bitmap) {
        double[] features = new double[27]; // 3x3 grid, RGB
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int gridSize = 3;
        
        int cellWidth = width / gridSize;
        int cellHeight = height / gridSize;
        
        for (int gy = 0; gy < gridSize; gy++) {
            for (int gx = 0; gx < gridSize; gx++) {
                double sumR = 0, sumG = 0, sumB = 0;
                int count = 0;
                
                int startX = gx * cellWidth;
                int endX = Math.min((gx + 1) * cellWidth, width);
                int startY = gy * cellHeight;
                int endY = Math.min((gy + 1) * cellHeight, height);
                
                // Sample every 4th pixel for performance
                for (int y = startY; y < endY; y += 4) {
                    for (int x = startX; x < endX; x += 4) {
                        int pixel = bitmap.getPixel(x, y);
                        sumR += (pixel >> 16) & 0xff;
                        sumG += (pixel >> 8) & 0xff;
                        sumB += pixel & 0xff;
                        count++;
                    }
                }
                
                int idx = (gy * gridSize + gx) * 3;
                if (count > 0) {
                    features[idx] = sumR / (count * 255.0);
                    features[idx + 1] = sumG / (count * 255.0);
                    features[idx + 2] = sumB / (count * 255.0);
                }
            }
        }
        
        return features;
    }
    
    private double[] extractOptimizedHistogram(Bitmap bitmap) {
        double[] features = new double[24]; // 8 bins per channel
        int[] histR = new int[8], histG = new int[8], histB = new int[8];
        
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int totalPixels = 0;
        
        // Sample every 4th pixel for performance
        for (int y = 0; y < height; y += 4) {
            for (int x = 0; x < width; x += 4) {
                int pixel = bitmap.getPixel(x, y);
                int r = (pixel >> 16) & 0xff;
                int g = (pixel >> 8) & 0xff;
                int b = pixel & 0xff;
                
                histR[r / 32]++;
                histG[g / 32]++;
                histB[b / 32]++;
                totalPixels++;
            }
        }
        
        // Normalize
        for (int i = 0; i < 8; i++) {
            features[i] = (double) histR[i] / totalPixels;
            features[i + 8] = (double) histG[i] / totalPixels;
            features[i + 16] = (double) histB[i] / totalPixels;
        }
        
        return features;
    }
    
    private double[] extractSkinToneFeatures(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        
        double[] features = new double[12];
        
        double sumR = 0, sumG = 0, sumB = 0;
        double sumR2 = 0, sumG2 = 0, sumB2 = 0;
        int count = 0;
        
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int pixel = bitmap.getPixel(x, y);
                int r = (pixel >> 16) & 0xff;
                int g = (pixel >> 8) & 0xff;
                int b = pixel & 0xff;
                
                if (isSkinTone(r, g, b)) {
                    sumR += r;
                    sumG += g;
                    sumB += b;
                    sumR2 += r * r;
                    sumG2 += g * g;
                    sumB2 += b * b;
                    count++;
                }
            }
        }
        
        if (count > 0) {
            double meanR = sumR / count;
            double meanG = sumG / count;
            double meanB = sumB / count;
            
            double stdR = Math.sqrt(sumR2 / count - meanR * meanR);
            double stdG = Math.sqrt(sumG2 / count - meanG * meanG);
            double stdB = Math.sqrt(sumB2 / count - meanB * meanB);
            
            features[0] = meanR / 255.0;
            features[1] = meanG / 255.0;
            features[2] = meanB / 255.0;
            features[3] = stdR / 255.0;
            features[4] = stdG / 255.0;
            features[5] = stdB / 255.0;
            features[6] = (double) count / (width * height);
        }
        
        return features;
    }
    
    private boolean isSkinTone(int r, int g, int b) {
        return r > 95 && g > 40 && b > 20 &&
               r > g && r > b &&
               Math.abs(r - g) > 15 &&
               r - Math.min(g, b) > 15;
    }
    
    private double[] extractSpatialColorFeatures(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int gridSize = 4;
        
        double[] features = new double[gridSize * gridSize * 3];
        
        int cellWidth = width / gridSize;
        int cellHeight = height / gridSize;
        
        for (int gy = 0; gy < gridSize; gy++) {
            for (int gx = 0; gx < gridSize; gx++) {
                double sumR = 0, sumG = 0, sumB = 0;
                int count = 0;
                
                int startX = gx * cellWidth;
                int endX = Math.min((gx + 1) * cellWidth, width);
                int startY = gy * cellHeight;
                int endY = Math.min((gy + 1) * cellHeight, height);
                
                for (int y = startY; y < endY; y++) {
                    for (int x = startX; x < endX; x++) {
                        int pixel = bitmap.getPixel(x, y);
                        sumR += (pixel >> 16) & 0xff;
                        sumG += (pixel >> 8) & 0xff;
                        sumB += pixel & 0xff;
                        count++;
                    }
                }
                
                int idx = (gy * gridSize + gx) * 3;
                features[idx] = sumR / (count * 255.0);
                features[idx + 1] = sumG / (count * 255.0);
                features[idx + 2] = sumB / (count * 255.0);
            }
        }
        
        return features;
    }
    
    private double[] extractColorFeatures(Bitmap bitmap) {
        int[] histR = new int[16];
        int[] histG = new int[16];
        int[] histB = new int[16];
        
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int pixel = bitmap.getPixel(x, y);
                int r = (pixel >> 16) & 0xff;
                int g = (pixel >> 8) & 0xff;
                int b = pixel & 0xff;
                
                histR[r / 16]++;
                histG[g / 16]++;
                histB[b / 16]++;
            }
        }
        
        double[] features = new double[48];
        int totalPixels = width * height;
        for (int i = 0; i < 16; i++) {
            features[i] = (double) histR[i] / totalPixels;
            features[i + 16] = (double) histG[i] / totalPixels;
            features[i + 32] = (double) histB[i] / totalPixels;
        }
        
        return features;
    }
    
    private double[] extractTextureFeatures(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        double[] features = new double[16];
        
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int center = getGrayscale(bitmap.getPixel(x, y));
                int pattern = 0;
                
                if (getGrayscale(bitmap.getPixel(x-1, y-1)) >= center) pattern |= 1;
                if (getGrayscale(bitmap.getPixel(x, y-1)) >= center) pattern |= 2;
                if (getGrayscale(bitmap.getPixel(x+1, y-1)) >= center) pattern |= 4;
                if (getGrayscale(bitmap.getPixel(x+1, y)) >= center) pattern |= 8;
                
                features[pattern % 16]++;
            }
        }
        
        double total = (width - 2) * (height - 2);
        for (int i = 0; i < features.length; i++) {
            features[i] /= total;
        }
        
        return features;
    }
    
    private double[] extractEdgeFeatures(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        double[] features = new double[16];
        
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int gx = -getGrayscale(bitmap.getPixel(x-1, y-1)) + getGrayscale(bitmap.getPixel(x+1, y-1))
                       - 2*getGrayscale(bitmap.getPixel(x-1, y)) + 2*getGrayscale(bitmap.getPixel(x+1, y))
                       - getGrayscale(bitmap.getPixel(x-1, y+1)) + getGrayscale(bitmap.getPixel(x+1, y+1));
                
                int gy = -getGrayscale(bitmap.getPixel(x-1, y-1)) - 2*getGrayscale(bitmap.getPixel(x, y-1)) - getGrayscale(bitmap.getPixel(x+1, y-1))
                       + getGrayscale(bitmap.getPixel(x-1, y+1)) + 2*getGrayscale(bitmap.getPixel(x, y+1)) + getGrayscale(bitmap.getPixel(x+1, y+1));
                
                int magnitude = (int) Math.sqrt(gx*gx + gy*gy);
                features[Math.min(15, magnitude / 16)]++;
            }
        }
        
        double total = (width - 2) * (height - 2);
        for (int i = 0; i < features.length; i++) {
            features[i] /= total;
        }
        
        return features;
    }
    
    private int getGrayscale(int pixel) {
        int r = (pixel >> 16) & 0xff;
        int g = (pixel >> 8) & 0xff;
        int b = pixel & 0xff;
        return (int) (0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    private double calculateEuclideanDistance(double[] features1, double[] features2) {
        double sum = 0;
        int length = Math.min(features1.length, features2.length);
        for (int i = 0; i < length; i++) {
            double diff = features1[i] - features2[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }
    
    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        cleanup();
    }
    
    private void cleanup() {
        if (executorService != null && !executorService.isShutdown()) {
            executorService.shutdown();
        }
        if (featureCache != null) {
            featureCache.evictAll();
        }
        if (detector != null) {
            detector.close();
        }
    }
    
    private void performFallbackComparison(Bitmap bitmap1, Bitmap bitmap2, Promise promise) {
        try {
            Log.d(TAG, "Performing fallback full-image comparison");
            
            // Resize images to same size for comparison
            int targetSize = 300;
            Bitmap resized1 = Bitmap.createScaledBitmap(bitmap1, targetSize, targetSize, true);
            Bitmap resized2 = Bitmap.createScaledBitmap(bitmap2, targetSize, targetSize, true);
            
            // Extract features from full images
            double[] features1 = extractFaceFeatures(resized1);
            double[] features2 = extractFaceFeatures(resized2);
            
            resized1.recycle();
            resized2.recycle();
            
            // Calculate similarity
            double distance = calculateEuclideanDistance(features1, features2);
            
            Log.d(TAG, "Fallback - Raw distance: " + distance);
            
            // More strict threshold for full image comparison (85%)
            double normalizedDistance = Math.min(distance / 3.5, 1.0);
            double confidence = (1 - normalizedDistance) * 100;
            
            Log.d(TAG, "Fallback - Confidence: " + confidence + "%");
            
            boolean isMatch = confidence >= 85.0;
            
            WritableMap result = Arguments.createMap();
            result.putBoolean("isMatch", isMatch);
            result.putDouble("confidence", confidence);
            result.putString("message", isMatch ? 
                "Face verified successfully! (fallback mode)" : 
                "Face does not match. Confidence: " + String.format("%.1f", confidence) + "% (fallback mode)");

            promise.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "Error in fallback comparison", e);
            promise.reject("ERROR", "Fallback comparison failed: " + e.getMessage());
        }
    }
}
