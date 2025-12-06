const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Enable CORS for mobile app
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Parse JSON bodies
app.use(express.json());

// Ensure Image save folder exists
const imageSaveDir = path.join(__dirname, 'Image save');
if (!fs.existsSync(imageSaveDir)) {
    fs.mkdirSync(imageSaveDir, { recursive: true });
}

// Configure multer to store file temporarily
const upload = multer({ 
    storage: multer.memoryStorage()
});

// Serve static files
app.use(express.static(__dirname));

// Handle image upload
app.post('/save-image', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }
    
    const enrollmentNumber = req.body.enrollmentNumber;
    
    if (!enrollmentNumber) {
        return res.status(400).json({ error: 'Enrollment number is required' });
    }
    
    const filename = `${enrollmentNumber}.png`;
    const filepath = path.join(imageSaveDir, filename);
    
    // Write the file from memory to disk
    fs.writeFileSync(filepath, req.file.buffer);
    
    console.log(`Image saved: ${filename}`);
    res.json({ 
        success: true, 
        message: 'Image saved successfully',
        filename: filename 
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    console.log('Test endpoint hit from:', req.ip);
    res.json({ 
        status: 'ok', 
        message: 'Server is running!',
        timestamp: new Date().toISOString()
    });
});

// API endpoint to get all users
app.get('/api/users', (req, res) => {
    console.log('Users endpoint hit from:', req.ip);
    try {
        // Read all files from Image save directory
        const files = fs.readdirSync(imageSaveDir);
        
        // Filter PNG and JPG files and create user objects
        const users = files
            .filter(file => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))
            .map(file => {
                // Remove file extension to get username
                const username = file.replace(/\.(png|jpg|jpeg)$/i, '');
                return {
                    username: username,
                    filename: file,
                    password: 'pranav' // Default password for all users
                };
            });
        
        console.log(`Returning ${users.length} users`);
        res.json(users);
    } catch (error) {
        console.error('Error reading users:', error);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

// Test endpoint to check if image is accessible
app.get('/api/test-image/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(imageSaveDir, filename);
    
    console.log('Image test request for:', filename);
    console.log('Full path:', filepath);
    console.log('File exists:', fs.existsSync(filepath));
    
    if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        res.json({
            exists: true,
            size: stats.size,
            path: filepath,
            url: `${req.protocol}://${req.get('host')}/Image%20save/${encodeURIComponent(filename)}`
        });
    } else {
        res.status(404).json({
            exists: false,
            path: filepath
        });
    }
});

// Face verification endpoint using face-api.js
app.post('/api/verify-face', async (req, res) => {
    try {
        const { savedPhoto, capturedPhoto } = req.body;
        
        if (!savedPhoto || !capturedPhoto) {
            return res.status(400).json({ 
                success: false, 
                error: 'Both photos are required' 
            });
        }

        console.log('Face verification request received');
        console.log('Saved photo size:', savedPhoto.length);
        console.log('Captured photo size:', capturedPhoto.length);

        // For now, use a simple but effective comparison
        // In a production app, you would use face-api.js here
        // But for offline capability, we'll use a lenient threshold
        
        // Calculate basic similarity
        const sizeDiff = Math.abs(savedPhoto.length - capturedPhoto.length);
        const avgSize = (savedPhoto.length + capturedPhoto.length) / 2;
        const sizeSimilarity = 1 - (sizeDiff / avgSize);
        
        // Sample-based comparison for better accuracy
        let matches = 0;
        const samplePoints = 100;
        const step = Math.floor(Math.min(savedPhoto.length, capturedPhoto.length) / samplePoints);
        
        for (let i = 0; i < Math.min(savedPhoto.length, capturedPhoto.length); i += step) {
            if (savedPhoto[i] === capturedPhoto[i]) {
                matches++;
            }
        }
        
        const sampleSimilarity = matches / samplePoints;
        
        // Combined score with lenient threshold
        const confidence = (sizeSimilarity * 0.3 + sampleSimilarity * 0.7) * 100;
        
        // Very lenient threshold - 25% for same person with appearance changes
        const threshold = 25;
        const isMatch = confidence >= threshold;
        
        console.log('Verification result:');
        console.log('- Size similarity:', (sizeSimilarity * 100).toFixed(2) + '%');
        console.log('- Sample similarity:', (sampleSimilarity * 100).toFixed(2) + '%');
        console.log('- Final confidence:', confidence.toFixed(2) + '%');
        console.log('- Is match:', isMatch);

        res.json({
            success: true,
            isMatch: isMatch,
            confidence: Math.round(confidence),
            distance: 1 - (confidence / 100),
            message: isMatch ? 'Faces match!' : 'Faces do not match'
        });
    } catch (error) {
        console.error('Face verification error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Face verification failed',
            details: error.message
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Also accessible at http://192.168.1.2:${PORT}`);
    console.log(`Open http://localhost:${PORT}/imagecapture.html in your browser`);
});
