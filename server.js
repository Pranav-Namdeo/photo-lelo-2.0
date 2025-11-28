const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at:`);
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Network: http://192.168.100.174:${PORT}`);
    console.log(`\nOpen http://192.168.100.174:${PORT}/imagecapture.html in your browser`);
});
