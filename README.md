# Face Capture System

A simple web application to capture face images with enrollment numbers using face detection.

## Setup

1. Install dependencies:
```
npm install
```

2. Start the server:
```
npm start
```

3. Open your browser and go to:
```
http://192.168.100.174:3000/imagecapture.html
```
Or from the same computer:
```
http://localhost:3000/imagecapture.html
```

## Usage

1. Enter an enrollment number
2. Position your face in front of the camera
3. Wait for face detection (green box will appear)
4. Click "Save Image" button
5. Image will be saved as `enrollmentnumber.png` in the "Image save" folder

## Features

- Real-time face detection using face-api.js
- Face landmark detection
- Automatic face validation before saving
- Images saved with enrollment number as filename
