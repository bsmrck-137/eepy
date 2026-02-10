// Sleepy Video - Frontend JavaScript

const API_BASE = '';

// DOM Elements
const timerValue = document.getElementById('timerValue');
const progressBar = document.getElementById('progressBar');
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusEl = document.getElementById('status');
const presetGrid = document.getElementById('presetGrid');
const customMinutes = document.getElementById('customMinutes');
const moonIcon = document.getElementById('moonIcon');
const zzzElements = document.querySelectorAll('.zzz');

// Video elements
const videoSection = document.getElementById('videoSection');
const videoWrapper = document.getElementById('videoWrapper');
const videoCloseBtn = document.getElementById('videoCloseBtn');
const videoUrlInput = document.getElementById('videoUrl');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const videoHint = document.getElementById('videoHint');
const dimOverlay = document.getElementById('dimOverlay');

// State
let selectedMinutes = 60;
let pollInterval = null;
let isRunning = false;
let currentVideoId = null;
let youtubePlayer = null;

// ===================
// VIDEO FUNCTIONS
// ===================

/**
 * Extract YouTube video ID from various URL formats
 * Supports: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
 */
function extractYouTubeId(url) {
    if (!url) return null;

    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

/**
 * Load and display a YouTube video
 */
function loadVideo(videoId) {
    if (!videoId) {
        showVideoHint('Invalid YouTube URL', 'error');
        return false;
    }

    currentVideoId = videoId;

    // Create YouTube iframe with autoplay
    const iframe = document.createElement('iframe');
    iframe.id = 'youtubePlayer';
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${window.location.origin}`;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;

    // Clear existing content and add iframe
    videoWrapper.innerHTML = '';
    videoWrapper.appendChild(iframe);
    youtubePlayer = iframe;

    // Show video section (dim mode will be enabled when timer starts)
    videoSection.classList.remove('hidden');
    document.body.classList.add('video-active');

    showVideoHint('Video loaded! Set your timer 🌙', 'success');
    return true;
}

/**
 * Close the video and exit dim mode
 */
function closeVideo() {
    currentVideoId = null;
    youtubePlayer = null;
    videoWrapper.innerHTML = '';
    videoSection.classList.add('hidden');
    document.body.classList.remove('dim-mode');
    document.body.classList.remove('video-active');
    videoUrlInput.value = '';
    showVideoHint('');
}

/**
 * Set the volume of the YouTube video (0-100)
 */
function setVideoVolume(volume) {
    if (youtubePlayer && youtubePlayer.contentWindow) {
        youtubePlayer.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'setVolume', args: [volume] }),
            '*'
        );
    }
}

/**
 * Pause the YouTube video (called when timer expires)
 */
function pauseVideo() {
    if (youtubePlayer && youtubePlayer.contentWindow) {
        // Use YouTube iframe API via postMessage
        youtubePlayer.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
            '*'
        );
        console.log('[Video] Pause command sent');
    }
}

/**
 * Show a hint message below the video input
 */
function showVideoHint(message, type = '') {
    videoHint.textContent = message;
    videoHint.className = 'video-hint' + (type ? ` ${type}` : '');
}

/**
 * Handle video URL submission
 */
function handleLoadVideo() {
    const url = videoUrlInput.value.trim();

    if (!url) {
        showVideoHint('Please enter a YouTube URL', 'error');
        return;
    }

    const videoId = extractYouTubeId(url);

    if (!videoId) {
        showVideoHint('Could not parse YouTube URL. Try youtube.com or youtu.be links.', 'error');
        return;
    }

    loadVideo(videoId);
}

// Format seconds to HH:MM:SS
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Update UI based on timer state
function updateUI(state) {
    const wasRunning = isRunning;
    isRunning = state.isRunning;

    // Update timer display
    timerValue.textContent = formatTime(state.remainingSeconds);

    // Update progress bar
    if (state.totalSeconds > 0) {
        const progress = ((state.totalSeconds - state.remainingSeconds) / state.totalSeconds) * 100;
        progressBar.style.width = `${progress}%`;
        progressBar.classList.toggle('active', state.isRunning);
    } else {
        progressBar.style.width = '0%';
        progressBar.classList.remove('active');
    }

    // Toggle buttons
    startBtn.classList.toggle('hidden', state.isRunning);
    cancelBtn.classList.toggle('hidden', !state.isRunning);

    // Update status
    if (state.isRunning) {
        const remaining = state.remainingSeconds;
        if (remaining <= 10) {
            statusEl.textContent = 'ALMOST THERE...';
            statusEl.className = 'status warning';
        } else if (remaining <= 60) {
            statusEl.textContent = 'GETTING SLEEPY...';
            statusEl.className = 'status warning';
        } else {
            statusEl.textContent = 'TIMER RUNNING';
            statusEl.className = 'status running';
        }

        // Show zzz animation
        zzzElements.forEach(el => el.classList.remove('hidden'));

        // Disable preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => btn.disabled = true);
        customMinutes.disabled = true;

        // Progressive Dimming Logic
        if (state.totalSeconds > 0) {
            // Calculate progress (0 to 1)
            // 0 = start, 1 = end
            const progress = (state.totalSeconds - state.remainingSeconds) / state.totalSeconds;

            // Map progress to opacity. 
            // We want it to start dimming immediately but max out at maybe 0.9 opacity so we can still see a bit.
            // Let's make it proportional.
            const maxOpacity = 0.9;
            const currentOpacity = progress * maxOpacity;

            // Apply to dim overlay
            if (dimOverlay) {
                dimOverlay.style.backgroundColor = `rgba(0, 0, 0, ${currentOpacity})`;
                // Ensure backdrop filter blur increases too for extra dreamy effect?
                // dimOverlay.style.backdropFilter = `blur(${progress * 2}px)`; 
            }
        }

        // Volume Fading Logic (Last 10%)
        if (state.totalSeconds > 0 && currentVideoId) {
            const tenPercentTime = state.totalSeconds * 0.1;

            if (remaining <= tenPercentTime) {
                // We are in the last 10%
                // Calculate volume: at 10% remaining it's 100, at 0 remaining it's 0.
                // volume = (remaining / tenPercentTime) * 100
                const volume = Math.floor((remaining / tenPercentTime) * 100);
                setVideoVolume(volume);
            } else {
                // Ensure volume is 100 otherwise
                setVideoVolume(100);
            }
        }
    } else {
        if (wasRunning && state.remainingSeconds === 0) {
            statusEl.textContent = 'SWEET DREAMS!';
            statusEl.className = 'status';
            // Pause video when timer expires
            pauseVideo();
        } else {
            statusEl.textContent = 'READY TO SLEEP';
            statusEl.className = 'status';
        }

        // Hide zzz animation
        zzzElements.forEach(el => el.classList.add('hidden'));

        // Enable preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => btn.disabled = false);
        customMinutes.disabled = false;

        // Reset dimming
        if (dimOverlay) {
            dimOverlay.style.backgroundColor = '';
        }

        // Reset volume if video is still loaded
        if (currentVideoId) {
            setVideoVolume(100);
        }
    }

    // Animate moon when running
    moonIcon.style.filter = state.isRunning ? 'hue-rotate(30deg)' : '';
}

// Fetch current status
async function fetchStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
        const state = await response.json();
        updateUI(state);
        return state;
    } catch (error) {
        console.error('Failed to fetch status:', error);
        statusEl.textContent = 'CONNECTION ERROR';
        statusEl.className = 'status warning';
    }
}

// Start timer
async function startTimer() {
    const minutes = customMinutes.value ? parseInt(customMinutes.value) : selectedMinutes;

    if (!minutes || minutes < 1 || minutes > 480) {
        statusEl.textContent = 'INVALID TIME (1-480 MIN)';
        statusEl.className = 'status warning';
        return;
    }

    try {
        startBtn.disabled = true;
        statusEl.textContent = 'STARTING...';

        const response = await fetch(`${API_BASE}/api/start-timer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes }),
        });

        const state = await response.json();

        if (response.ok) {
            updateUI(state);
            startPolling();
            // Enable dim mode if video is loaded
            if (currentVideoId) {
                document.body.classList.add('dim-mode');
            }
        } else {
            statusEl.textContent = state.error || 'FAILED TO START';
            statusEl.className = 'status warning';
        }
    } catch (error) {
        console.error('Failed to start timer:', error);
        statusEl.textContent = 'FAILED TO START';
        statusEl.className = 'status warning';
    } finally {
        startBtn.disabled = false;
    }
}

// Cancel timer
async function cancelTimer() {
    try {
        cancelBtn.disabled = true;

        const response = await fetch(`${API_BASE}/api/cancel-timer`, {
            method: 'POST',
        });

        const state = await response.json();
        updateUI(state);
        stopPolling();

        statusEl.textContent = 'TIMER CANCELLED';
        statusEl.className = 'status';
    } catch (error) {
        console.error('Failed to cancel timer:', error);
        statusEl.textContent = 'FAILED TO CANCEL';
        statusEl.className = 'status warning';
    } finally {
        cancelBtn.disabled = false;
    }
}

// Start polling for status updates
function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(fetchStatus, 1000);
}

// Stop polling
function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

// Handle preset button clicks
function handlePresetClick(event) {
    if (!event.target.matches('.preset-btn')) return;

    const minutes = parseInt(event.target.dataset.minutes);
    if (!minutes) return;

    selectedMinutes = minutes;
    customMinutes.value = '';

    // Update selected state
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.toggle('selected', parseInt(btn.dataset.minutes) === minutes);
    });
}

// Handle custom input changes
function handleCustomInput() {
    if (customMinutes.value) {
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        selectedMinutes = parseInt(customMinutes.value);
    }
}

// Initialize
async function init() {
    // Event listeners
    startBtn.addEventListener('click', startTimer);
    cancelBtn.addEventListener('click', cancelTimer);
    presetGrid.addEventListener('click', handlePresetClick);
    customMinutes.addEventListener('input', handleCustomInput);

    // Allow Enter key to start timer
    customMinutes.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startTimer();
    });

    // Video event listeners
    loadVideoBtn.addEventListener('click', handleLoadVideo);
    videoCloseBtn.addEventListener('click', closeVideo);

    // Allow Enter key to load video
    videoUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLoadVideo();
    });

    // Initial status fetch
    const state = await fetchStatus();

    // If timer is already running, start polling
    if (state?.isRunning) {
        startPolling();
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
