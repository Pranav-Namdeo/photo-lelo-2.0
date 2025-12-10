import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import {getSavedPhotoPath} from '../utils/storage';
import {verifyFaceOffline} from '../utils/faceVerification';

export default function FaceVerificationScreen({navigation}) {
  const [capturedImage, setCapturedImage] = useState(null);
  const [savedImage, setSavedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  
  const camera = useRef(null);
  const device = useCameraDevice('front');

  useEffect(() => {
    loadSavedPhoto();
    checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    const permission = await Camera.requestCameraPermission();
    setHasPermission(permission === 'granted');
  };

  const loadSavedPhoto = async () => {
    try {
      // First try to load from local storage
      const photoPath = await getSavedPhotoPath();
      if (photoPath) {
        console.log('Loading photo from local storage:', photoPath);
        setSavedImage(`file://${photoPath}`);
      } else {
        // If no local photo, try to load user data and show from server
        console.log('No local photo found, trying to load from user data');
        const {getUserData} = require('../utils/storage');
        const userData = await getUserData();
        if (userData && userData.filename) {
          const {API_BASE_URL} = require('../config');
          const serverPhotoUrl = `${API_BASE_URL}/Image%20save/${encodeURIComponent(userData.filename)}`;
          console.log('Loading photo from server:', serverPhotoUrl);
          setSavedImage(serverPhotoUrl);
        } else {
          Alert.alert('Error', 'No saved photo found. Please login again.');
        }
      }
    } catch (error) {
      console.error('Error loading saved photo:', error);
    }
  };

  const handleOpenCamera = async () => {
    if (!hasPermission) {
      const permission = await Camera.requestCameraPermission();
      if (permission !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Camera permission is required for face verification',
        );
        return;
      }
      setHasPermission(true);
    }
    setShowCamera(true);
  };

  const handleTakePhoto = useCallback(async () => {
    try {
      if (camera.current) {
        const photo = await camera.current.takePhoto({
          qualityPrioritization: 'speed', // Optimized for faster capture
          flash: 'off',
          enableShutterSound: false, // Disable shutter sound for better UX
        });
        
        console.log('Photo captured:', photo.path);
        setCapturedImage(`file://${photo.path}`);
        setVerificationResult(null);
        setShowCamera(false);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to capture photo');
    }
  }, []);

  const handleCloseCamera = () => {
    setShowCamera(false);
  };

  const handleVerify = useCallback(async () => {
    console.log('Verify clicked - capturedImage:', capturedImage);
    console.log('Verify clicked - savedImage:', savedImage);
    
    if (!capturedImage) {
      Alert.alert('Error', 'Please capture your face first');
      return;
    }
    
    if (!savedImage) {
      Alert.alert('Error', 'No reference photo available. Please login again.');
      return;
    }

    setLoading(true);
    setVerificationResult(null); // Clear previous result
    
    try {
      let savedPath = savedImage;
      
      // If it's a server URL, download it temporarily first
      if (savedImage.startsWith('http')) {
        Alert.alert('Info', 'Downloading reference photo for verification...');
        const {downloadAndSavePhoto, getUserData} = require('../utils/storage');
        const userData = await getUserData();
        if (userData) {
          try {
            savedPath = await downloadAndSavePhoto(savedImage, userData.username);
            console.log('Downloaded photo for verification:', savedPath);
          } catch (downloadError) {
            console.error('Failed to download photo:', downloadError);
            Alert.alert('Error', 'Could not download reference photo. Please check your internet connection.');
            setLoading(false);
            return;
          }
        }
      } else {
        savedPath = savedImage.replace('file://', '');
      }

      const result = await verifyFaceOffline(savedPath, capturedImage);

      setVerificationResult(result);

      if (result.isMatch) {
        Alert.alert(
          'Success',
          `${result.message}\nConfidence: ${result.confidence.toFixed(1)}%`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ],
        );
      } else {
        Alert.alert(
          'Verification Failed',
          `${result.message}\nConfidence: ${result.confidence.toFixed(1)}%`,
        );
      }
    } catch (error) {
      console.error('Error verifying face:', error);
      Alert.alert('Error', 'Face verification failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [capturedImage, savedImage]);

  // Show camera view
  if (showCamera) {
    if (!device) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorText}>Camera not available</Text>
        </View>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={showCamera}
          photo={true}
        />
        
        <View style={styles.cameraOverlay}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCloseCamera}>
              <Text style={styles.closeButtonText}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Position your face in the frame</Text>
          </View>

          <View style={styles.cameraFooter}>
            <TouchableOpacity
              style={styles.captureButtonLarge}
              onPress={handleTakePhoto}>
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Show verification view
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Face Verification</Text>
        <Text style={styles.subtitle}>Verify your identity offline</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.imageContainer}>
          <Text style={styles.label}>Saved Photo</Text>
          {savedImage ? (
            <Image source={{uri: savedImage}} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>No photo</Text>
            </View>
          )}
        </View>

        <View style={styles.imageContainer}>
          <Text style={styles.label}>Captured Photo</Text>
          {capturedImage ? (
            <Image source={{uri: capturedImage}} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>Capture your face</Text>
            </View>
          )}
        </View>
      </View>

      {verificationResult && (
        <View
          style={[
            styles.resultContainer,
            verificationResult.isMatch ? styles.resultSuccess : styles.resultError,
          ]}>
          <Text style={styles.resultText}>{verificationResult.message}</Text>
          <Text style={styles.confidenceText}>
            Confidence: {verificationResult.confidence.toFixed(1)}%
          </Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleOpenCamera}
          disabled={loading}>
          <Text style={styles.buttonText}>📷 Capture Face</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.verifyButton,
            (!capturedImage || loading) && styles.buttonDisabled,
          ]}
          onPress={handleVerify}
          disabled={!capturedImage || loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>✓ Verify Face</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          ℹ️ This verification works offline using your saved photo
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cameraHeader: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 10,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cameraFooter: {
    paddingBottom: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 30,
  },
  captureButtonLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#667eea',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#667eea',
  },
  errorText: {
    color: '#f00',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
  header: {
    backgroundColor: '#667eea',
    padding: 20,
    paddingTop: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginTop: 5,
  },
  content: {
    flexDirection: 'row',
    padding: 20,
    justifyContent: 'space-between',
  },
  imageContainer: {
    flex: 1,
    marginHorizontal: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#667eea',
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  placeholderText: {
    color: '#999',
    fontSize: 12,
  },
  resultContainer: {
    margin: 20,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  resultSuccess: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    borderWidth: 1,
  },
  resultError: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
    borderWidth: 1,
  },
  resultText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  confidenceText: {
    fontSize: 14,
    color: '#666',
  },
  buttonContainer: {
    padding: 20,
    paddingTop: 0,
  },
  captureButton: {
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  verifyButton: {
    backgroundColor: '#4caf50',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoBox: {
    margin: 20,
    marginTop: 0,
    padding: 15,
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#90caf9',
  },
  infoText: {
    color: '#1976d2',
    fontSize: 12,
    textAlign: 'center',
  },
});
