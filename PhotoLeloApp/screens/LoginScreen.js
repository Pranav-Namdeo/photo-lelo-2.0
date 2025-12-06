import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import axios from 'axios';
import {API_BASE_URL} from '../config';
import {saveUserData, downloadAndSavePhoto} from '../utils/storage';

export default function LoginScreen({navigation}) {
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const requestStoragePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Storage Permission',
            message: 'Photo Lelo needs storage access to save your photo for offline verification',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return true; // Continue anyway, internal storage doesn't need permission
      }
    }
    return true;
  };

  const handleLogin = async () => {
    if (!enrollmentNumber.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both enrollment number and password');
      return;
    }

    setLoading(true);

    try {
      console.log('Attempting to connect to:', `${API_BASE_URL}/api/users`);
      const response = await axios.get(`${API_BASE_URL}/api/users`, {
        timeout: 10000,
      });
      console.log('Response received:', response.status);
      const users = response.data;

      const user = users.find((u) => u.username === enrollmentNumber.trim());

      if (!user) {
        Alert.alert('Error', 'Enrollment number not found');
        setLoading(false);
        return;
      }

      if (password === user.password) {
        // Request storage permission
        const hasPermission = await requestStoragePermission();
        console.log('Storage permission granted:', hasPermission);
        
        // Save user data first
        await saveUserData(user);
        
        // Download and save photo for offline verification
        try {
          // Encode the URL properly to handle spaces
          const photoUrl = `${API_BASE_URL}/Image%20save/${encodeURIComponent(user.filename)}`;
          console.log('=== LOGIN: Starting photo download ===');
          console.log('Photo URL:', photoUrl);
          console.log('Username:', user.username);
          console.log('Filename:', user.filename);
          
          const savedPath = await downloadAndSavePhoto(photoUrl, user.username);
          console.log('=== LOGIN: Photo saved successfully ===');
          console.log('Saved path:', savedPath);
          
          setLoading(false);
          navigation.replace('Home', {user});
        } catch (photoError) {
          console.error('=== LOGIN: Photo download failed ===');
          console.error('Error:', photoError);
          console.error('Error message:', photoError.message);
          console.error('Error stack:', photoError.stack);
          
          setLoading(false);
          
          // Show detailed error to user
          Alert.alert(
            'Photo Download Failed',
            `Could not save photo for offline verification.\n\nError: ${photoError.message}\n\nYou can still login, but face verification may require internet connection.`,
            [
              {
                text: 'Continue Anyway',
                onPress: () => navigation.replace('Home', {user}),
              },
              {
                text: 'Retry',
                onPress: () => handleLogin(),
              },
            ]
          );
        }
      } else {
        Alert.alert('Error', 'Incorrect password');
        setLoading(false);
      }
    } catch (error) {
      console.error('Login error:', error);
      console.error('Error details:', error.message);
      console.error('Error code:', error.code);
      
      let errorMessage = 'Unable to connect to server.\n\n';
      errorMessage += `Server: ${API_BASE_URL}\n`;
      
      if (error.code === 'ECONNABORTED') {
        errorMessage += 'Connection timeout. Server not responding.';
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage += 'Network error. Check WiFi connection.';
      } else if (error.message) {
        errorMessage += `Error: ${error.message}`;
      }
      
      Alert.alert('Connection Error', errorMessage);
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>📸</Text>
          <Text style={styles.title}>Photo Lelo</Text>
          <Text style={styles.subtitle}>Login to your account</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Enrollment Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your enrollment number"
              value={enrollmentNumber}
              onChangeText={setEnrollmentNumber}
              autoCapitalize="characters"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>Default password for all users: pranav</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logo: {
    fontSize: 80,
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  loginButton: {
    backgroundColor: '#667eea',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hint: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginTop: 15,
  },
});
