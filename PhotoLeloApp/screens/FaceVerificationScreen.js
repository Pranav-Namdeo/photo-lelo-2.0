import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {launchCamera} from 'react-native-image-picker';
import {getSavedPhotoPath} from '../utils/storage';
import {verifyFaceOffline} from '../utils/faceVerification';

export default function FaceVerificationScreen({navigation}) {
  const [capturedImage, setCapturedImage] = useState(null);
  const [savedImage, setSavedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  useEffect(() => {
    loadSavedPhoto();
  }, []);

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

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'Photo Lelo needs access to your camera for face verification',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const handleCapture = async () => {
    try {
      // Request camera permission first
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Denied',
          'Camera permission is required for face verification',
        );
        return;
      }

      const result = await launchCamera({
        mediaType: 'photo',
        cameraType: 'front',
        quality: 0.8,
        saveToPhotos: false,
      });

      if (result.didCancel) {
        return;
      }

      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Failed to capture photo');
        return;
      }

      if (result.assets && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        setCapturedImage(imageUri || null);
        setVerificationResult(null);
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const handleVerify = async () => {
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
  };

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
          onPress={handleCapture}
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
