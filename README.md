# LiftSync

LiftSync is a real-time exercise repetition segmentation and form degradation detection engine. It uses biomechanical signals from IMU sensors (accelerometer and gyroscope) to analyze workout performance.
This is our project
## Overview

The application is split into two parts:
1. **Frontend**: A React application built with Vite and TailwindCSS for real-time visualization of workout metrics.
2. **Backend**: A FastAPI engine that processes WebSocket streams of IMU data. It performs segmentation, extracts features, and uses a Random Forest Classifier and CUSUM statistical change detection to evaluate physical fatigue and form degradation.

## Features

- Real-time repetition segmentation from accelerometer and gyroscope data
- Detection of form breakdown and fatigue using machine learning
- CUSUM statistical change detection
- WebSocket-based real-time telemetry streaming

## Setup

### Backend

The backend is a Python FastAPI service.

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```
3. Install dependencies:
   ```bash
   pip install -r app/requirements.txt
   ```
4. Run the server:
   ```bash
   cd backend/app
   uvicorn main:app --reload
   ```
   Or to run the signal processing test bench:
   ```bash
   cd backend
   python app/test_engine.py
   ```

### Frontend

The frontend is a React application powered by Vite.

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Architecture

- `backend/app/processing/`: Contains the core algorithmic engine.
  - `segmentation.py`: Segments individual repetitions from raw IMU data using Butterworth low-pass filtering and peak detection.
  - `features.py`: Extracts kinematic features like Jerk, Displacement Peak-to-Peak, and Instability Ratio.
  - `statistics.py`: Implements CUSUM (Cumulative Sum) algorithms to detect when a user's form significantly breaks from their baseline.
- `backend/app/main.py`: Exposes a WebSocket endpoint `/ws/session` to handle real-time streaming of workout data.
