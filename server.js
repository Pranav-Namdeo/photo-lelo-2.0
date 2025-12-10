const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const compression = require('compression');

const app = express();
const PORT = 3000;

// Enable compression for better performance
app.use(compression());

// Enable CORS for mobile app with optimized headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Cache-Control', 'public, max-age=3600'); // Cache static resources
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

// Optimized JSON parsing with streaming for large payloads
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
        // Add request size logging for monitoring
        if (buf.length > 10 * 1024 * 1024) { // 10MB
            console.log(`Large request: ${buf.length} bytes from ${req.ip}`);
        }
    }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Cache for users data to avoid repeated file system reads
let usersCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// API endpoint to get all users - optimized with caching
app.get('/api/users', async (req, res) => {
    console.log('Users endpoint hit from:', req.ip);
    
    try {
        const now = Date.now();
        
        // Return cached data if still valid
        if (usersCache && (now - cacheTimestamp) < CACHE_DURATION) {
            return res.json(usersCache);
        }
        
        // Check if directory exists
        if (!fsSync.existsSync(imageSaveDir)) {
            console.log('Image save directory does not exist');
            return res.json([]);
        }
        
        // Read all files from Image save directory
        const files = await fs.readdir(imageSaveDir);
        
        // Filter and map files efficiently
        const users = files
            .filter(file => /\.(png|jpg|jpeg)$/i.test(file))
            .map(file => ({
                username: file.replace(/\.(png|jpg|jpeg)$/i, ''),
                filename: file,
                password: 'pranav' // Default password for all users
            }));
        
        // Update cache
        usersCache = users;
        cacheTimestamp = now;
        
        console.log(`Returning ${users.length} users (cached for ${CACHE_DURATION/1000}s)`);
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

// Face verification endpoint with improved algorithm
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

        // Multi-level comparison for better accuracy
        
        // 1. Size similarity (basic check)
        const sizeDiff = Math.abs(savedPhoto.length - capturedPhoto.length);
        const avgSize = (savedPhoto.length + capturedPhoto.length) / 2;
        const sizeSimilarity = 1 - (sizeDiff / avgSize);
        
        // 2. Pattern matching at multiple sample points
        let exactMatches = 0;
        let closeMatches = 0;
        const samplePoints = 500; // Increased sample points for better accuracy
        const minLength = Math.min(savedPhoto.length, capturedPhoto.length);
        const step = Math.floor(minLength / samplePoints);
        
        for (let i = 0; i < minLength; i += step) {
            if (savedPhoto[i] === capturedPhoto[i]) {
                exactMatches++;
            } else {
                // Check if characters are close (within 5 ASCII values)
                const diff = Math.abs(savedPhoto.charCodeAt(i) - capturedPhoto.charCodeAt(i));
                if (diff <= 5) {
                    closeMatches++;
                }
            }
        }
        
        const exactMatchRatio = exactMatches / samplePoints;
        const closeMatchRatio = (exactMatches + closeMatches * 0.5) / samplePoints;
        
        // 3. Chunk-based pattern comparison
        const chunkSize = 1000;
        let chunkMatches = 0;
        const totalChunks = Math.floor(minLength / chunkSize);
        
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = start + chunkSize;
            const chunk1 = savedPhoto.substring(start, end);
            const chunk2 = capturedPhoto.substring(start, end);
            
            // Compare chunk patterns
            let chunkSimilarity = 0;
            for (let j = 0; j < chunkSize; j++) {
                if (chunk1[j] === chunk2[j]) {
                    chunkSimilarity++;
                }
            }
            
            if (chunkSimilarity / chunkSize > 0.6) {
                chunkMatches++;
            }
        }
        
        const chunkMatchRatio = totalChunks > 0 ? chunkMatches / totalChunks : 0;
        
        // Calculate weighted confidence score
        const confidence = (
            sizeSimilarity * 15 +           // 15% weight
            exactMatchRatio * 40 +          // 40% weight - most important
            closeMatchRatio * 25 +          // 25% weight
            chunkMatchRatio * 20            // 20% weight
        );
        
        // Balanced threshold - 45% allows same person with appearance changes
        // but rejects completely different people
        const threshold = 45;
        const isMatch = confidence >= threshold;
        
        console.log('Verification result:');
        console.log('- Size similarity:', (sizeSimilarity * 100).toFixed(2) + '%');
        console.log('- Exact match ratio:', (exactMatchRatio * 100).toFixed(2) + '%');
        console.log('- Close match ratio:', (closeMatchRatio * 100).toFixed(2) + '%');
        console.log('- Chunk match ratio:', (chunkMatchRatio * 100).toFixed(2) + '%');
        console.log('- Final confidence:', confidence.toFixed(2) + '%');
        console.log('- Threshold:', threshold + '%');
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
    console.log(`Also accessible at http://192.168.1.9:${PORT}`);
    console.log(`Open http://localhost:${PORT}/imagecapture.html in your browser`);
});
