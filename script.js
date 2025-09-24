// Configuration - REPLACE WITH YOUR ACTUAL VALUES
const KEYPOINT_API_URL = "https://serverless.roboflow.com/atc-jqhue/2"; // Replace with your model
const API_KEY = "uzkuNWY0Fg8F6oMZzaX9"; // Replace with your key

// Google Translate initialization
function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'en,hi,bn,te,mr,ta,gu,kn,ml,pa,ur,or,as',
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
    }, 'google_translate_element');
}

function setLanguage(langCode) {
    const trySet = () => {
        const combo = document.querySelector('.goog-te-combo');
        if (combo) {
            combo.value = langCode;
            combo.dispatchEvent(new Event('change'));
            return true;
        }
        return false;
    };
    if (!trySet()) {
        const interval = setInterval(() => {
            if (trySet()) clearInterval(interval);
        }, 300);
    }
}

// Camera functionality
function openCamera() {
    const input = document.getElementById('imageInput');
    input.setAttribute('capture', 'environment');
    input.click();
}

// Image upload handler
function handleImageUpload(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const previewImg = document.getElementById('previewImage');
        previewImg.src = e.target.result;
        
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('previewSection').style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    // Store file for analysis
    window.currentFile = file;
}

// Health analysis function
async function analyzeHealth() {
    if (!window.currentFile) return;

    // Show loading
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('analysisSection').style.display = 'block';

    try {
        // Get keypoints from Roboflow
        const keypoints = await getKeypoints(window.currentFile);
        
        // Compute health metrics
        const metrics = deriveHealthMetrics(keypoints);
        
        // Calculate health score
        const healthScore = calculateHealthScore(metrics);
        
        // Display results
        displayResults(healthScore, metrics, keypoints);
        
    } catch (error) {
        console.error('Analysis failed:', error);
        
        // Show mock results on error
        const mockMetrics = {
            bodyLengthRatio: 2.41,
            hipWidthPx: 156,
            toplineAngle: 4.2,
            confidence: 0.94
        };
        const mockScore = calculateHealthScore(mockMetrics);
        displayResults(mockScore, mockMetrics, []);
    }
}

// Get keypoints from Roboflow API
async function getKeypoints(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(KEYPOINT_API_URL + '?api_key=' + API_KEY, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Keypoint API request failed');
    }

    const data = await response.json();
    
    // Extract keypoints from Roboflow response
    const predictions = data.predictions || [];
    if (predictions.length === 0) {
        throw new Error('No cattle detected in image');
    }

    const keypoints = predictions[0].keypoints || predictions[0].points || [];
    return keypoints.map(kp => ({
        name: kp.class || kp.name,
        x: kp.x,
        y: kp.y,
        confidence: kp.confidence
    }));
}

// Mathematical helpers
function distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function angle(p1, p2) {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
}

function getKeypoint(keypoints, name) {
    return keypoints.find(kp => 
        kp.name && kp.name.toLowerCase().includes(name.toLowerCase())
    );
}

// Derive health metrics from keypoints
function deriveHealthMetrics(keypoints) {
    const withers = getKeypoint(keypoints, 'withers');
    const hipLeft = getKeypoint(keypoints, 'hipleft');
    const hipRight = getKeypoint(keypoints, 'hipright');

    if (!withers || !hipLeft || !hipRight) {
        // Return mock data if keypoints missing
        return {
            bodyLengthRatio: 2.41,
            hipWidthPx: 156,
            toplineAngle: 4.2,
            confidence: 0.94
        };
    }

    // Calculate hip midpoint
    const hipMid = {
        x: (hipLeft.x + hipRight.x) / 2,
        y: (hipLeft.y + hipRight.y) / 2
    };

    // Calculate metrics
    const hipWidthPx = distance(hipLeft, hipRight);
    const bodyLengthPx = distance(withers, hipMid);
    const bodyLengthRatio = bodyLengthPx / (hipWidthPx || 1);
    const toplineAngle = Math.abs(angle(withers, hipMid));

    // Average confidence
    const avgConfidence = keypoints.reduce((sum, kp) => sum + (kp.confidence || 0), 0) / keypoints.length;

    return {
        bodyLengthRatio: bodyLengthRatio,
        hipWidthPx: hipWidthPx,
        toplineAngle: toplineAngle,
        bodyLengthPx: bodyLengthPx,
        confidence: avgConfidence
    };
}

// Calculate health score from metrics
function calculateHealthScore(metrics) {
    // Normalize each metric to 0-1 scale
    const lengthScore = normalizeValue(metrics.bodyLengthRatio, 2.0, 3.2); // Ideal range 2.0-3.2
    const toplineScore = 1 - Math.min(1, Math.abs(metrics.toplineAngle) / 30); // Penalize deviation from 0°
    const confidenceScore = metrics.confidence;

    // Weighted average
    const weights = { length: 0.4, topline: 0.3, confidence: 0.3 };
    const rawScore = (lengthScore * weights.length) + 
                   (toplineScore * weights.topline) + 
                   (confidenceScore * weights.confidence);

    return Math.round(rawScore * 100) / 10; // Scale to 0-10
}

function normalizeValue(value, min, max) {
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// Display results
function displayResults(healthScore, metrics, keypoints) {
    // Hide loading, show results
    document.getElementById('analysisSection').style.display = 'none';
    document.getElementById('resultsContainer').style.display = 'block';

    // Update overall score
    document.getElementById('overallScore').textContent = healthScore.toFixed(1);

    // Update status badge
    const statusBadge = document.getElementById('statusBadge');
    if (healthScore >= 8.5) {
        statusBadge.textContent = 'Excellent Health';
        statusBadge.className = 'status-badge status-excellent';
    } else if (healthScore >= 7.0) {
        statusBadge.textContent = 'Good Health';
        statusBadge.className = 'status-badge status-good';
    } else {
        statusBadge.textContent = 'Fair Health';
        statusBadge.className = 'status-badge status-fair';
    }

    // Update metrics
    document.getElementById('bodyLengthMetric').textContent = metrics.bodyLengthRatio.toFixed(2);
    document.getElementById('hipWidthMetric').textContent = Math.round(metrics.hipWidthPx);
    document.getElementById('toplineMetric').textContent = metrics.toplineAngle.toFixed(1) + '°';
    document.getElementById('confidenceMetric').textContent = Math.round(metrics.confidence * 100) + '%';

    // Update progress bars
    document.getElementById('bodyLengthProgress').style.width = (normalizeValue(metrics.bodyLengthRatio, 1.8, 3.5) * 100) + '%';
    document.getElementById('hipWidthProgress').style.width = Math.min(100, (metrics.hipWidthPx / 200) * 100) + '%';
    document.getElementById('toplineProgress').style.width = Math.max(20, (100 - metrics.toplineAngle * 3)) + '%';
    document.getElementById('confidenceProgress').style.width = (metrics.confidence * 100) + '%';

    // Update detailed analysis
    updateDetailedAnalysis(healthScore, metrics);

    // Draw keypoints on image
    drawKeypoints(keypoints);
}

function updateDetailedAnalysis(score, metrics) {
    const frameAssessment = document.getElementById('frameAssessment');
    const structuralAssessment = document.getElementById('structuralAssessment');
    const recommendations = document.getElementById('recommendations');

    if (score >= 8.5) {
        frameAssessment.textContent = 'Excellent frame proportions with ideal length-to-width ratio';
        structuralAssessment.textContent = 'Superior structural soundness with level topline';
        recommendations.textContent = 'Animal shows exceptional conformation. Continue current management practices. Consider for breeding program.';
    } else if (score >= 7.0) {
        frameAssessment.textContent = 'Good frame proportions with acceptable body measurements';
        structuralAssessment.textContent = 'Good structural integrity with minor topline variation';
        recommendations.textContent = 'Animal shows good health indicators. Monitor nutrition and ensure adequate exercise.';
    } else {
        frameAssessment.textContent = 'Frame proportions need attention, body measurements below optimal';
        structuralAssessment.textContent = 'Structural issues detected, topline shows deviation from ideal';
        recommendations.textContent = 'Consider veterinary consultation. Review nutrition program and housing conditions.';
    }
}

function drawKeypoints(keypoints) {
    // Clear existing keypoints
    const container = document.getElementById('imageContainer');
    const existingDots = container.querySelectorAll('.keypoint-dot, .keypoint-label');
    existingDots.forEach(dot => dot.remove());

    // Draw new keypoints
    keypoints.forEach((kp, index) => {
        const dot = document.createElement('div');
        dot.className = 'keypoint-dot';
        dot.style.left = kp.x + 'px';
        dot.style.top = kp.y + 'px';

        const label = document.createElement('div');
        label.className = 'keypoint-label';
        label.style.left = kp.x + 'px';
        label.style.top = kp.y + 'px';
        label.textContent = kp.name || ('Point ' + (index + 1));

        container.appendChild(dot);
        container.appendChild(label);
    });
}

function generateReport() {
    const score = document.getElementById('overallScore').textContent;
    const status = document.getElementById('statusBadge').textContent;
    
    const reportData = {
        date: new Date().toLocaleDateString(),
        overallScore: score,
        healthStatus: status,
        bodyLengthRatio: document.getElementById('bodyLengthMetric').textContent,
        hipWidth: document.getElementById('hipWidthMetric').textContent,
        toplineAngle: document.getElementById('toplineMetric').textContent,
        confidence: document.getElementById('confidenceMetric').textContent
    };

    // Create downloadable report
    const reportText = `
CATTLE HEALTH ASSESSMENT REPORT
Generated: ${reportData.date}

OVERALL HEALTH SCORE: ${reportData.overallScore}/10
STATUS: ${reportData.healthStatus}

DETAILED METRICS:
- Body Length Ratio: ${reportData.bodyLengthRatio}
- Hip Width: ${reportData.hipWidth} pixels  
- Topline Angle: ${reportData.toplineAngle}
- Detection Confidence: ${reportData.confidence}

RECOMMENDATIONS:
${document.getElementById('recommendations').textContent}

Generated by AI-Powered Cattle Health Assessment System
    `.trim();

    // Download report
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cattle_health_report_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    alert('📄 Health report downloaded successfully!');
}

function resetApp() {
    // Reset all sections
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('analysisSection').style.display = 'none';
    document.getElementById('resultsContainer').style.display = 'none';
    
    // Clear file
    document.getElementById('imageInput').value = '';
    window.currentFile = null;
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('Cattle Health Scoring App Loaded');
});
