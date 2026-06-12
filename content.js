let audioContext;
let source;
let preAmpNode;
let filters = [];
let currentFrequencies = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let isEnabled = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_CAPTURE') {
    isEnabled = true;
    initAudio(msg.data);
    sendResponse({status: "ok"});
  } else if (msg.type === 'UPDATE_EQ') {
    if (isEnabled) updateAudioSettings(msg.data);
    sendResponse({status: "ok"});
  } else if (msg.type === 'STOP_CAPTURE') {
    isEnabled = false;
    stopAudio();
    sendResponse({status: "ok"});
  }
  return true;
});

// Helper to locate media elements across the main document and PiP windows
function getMediaElement() {
  // First, check the main tab
  let media = document.querySelector('video') || document.querySelector('audio');
  if (media) return media;

  // If not in the main tab, check inside the Document PiP window if it exists
  if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
    media = window.documentPictureInPicture.window.document.querySelector('video') || 
            window.documentPictureInPicture.window.document.querySelector('audio');
  }
  
  return media;
}

function initAudio(settings) {
  // Find the video or audio tag on the webpage
  const mediaElement = getMediaElement(); 
  if (!mediaElement) return;

  if (!audioContext) {
    audioContext = new AudioContext();
    // Only create the source once to avoid errors
    source = audioContext.createMediaElementSource(mediaElement);
    if (settings && settings.frequencies) currentFrequencies = settings.frequencies;
    createEQChain();
  } else if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  if (settings) updateAudioSettings(settings);

  // Route audio through EQ
  source.disconnect();
  source.connect(preAmpNode);
}

function stopAudio() {
  if (source && audioContext) {
    source.disconnect();
    // Route audio straight to speakers, bypassing EQ
    source.connect(audioContext.destination);
  }
}

function createEQChain() {
  if (preAmpNode) {
    let lastNode = preAmpNode;
    filters.forEach(f => {
      lastNode.disconnect();
      lastNode = f;
    });
    lastNode.disconnect(); 
  }

  preAmpNode = audioContext.createGain();
  
  const bandCount = currentFrequencies.length;
  let qValue = bandCount / 4.5;
  if (qValue < 1.0) qValue = 1.0;

  filters = currentFrequencies.map(freq => {
    const filter = audioContext.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = qValue;
    return filter;
  });

  let currentNode = preAmpNode;
  filters.forEach(filter => {
    currentNode.connect(filter);
    currentNode = filter;
  });
  currentNode.connect(audioContext.destination);
}

function updateAudioSettings(settings) {
  if (!preAmpNode) return;

  if (settings.frequencies && settings.frequencies.length !== filters.length) {
    currentFrequencies = settings.frequencies;
    createEQChain(); 
    if (source) {
      source.disconnect();
      source.connect(preAmpNode);
    }
    if (settings.bands) {
      settings.bands.forEach((val, index) => {
        if (filters[index]) filters[index].gain.value = val;
      });
    }
  } else if (settings.frequencies && settings.frequencies[0] !== currentFrequencies[0]) {
      currentFrequencies = settings.frequencies;
      const bandCount = currentFrequencies.length;
      let qValue = bandCount / 4.5;
      if (qValue < 1.0) qValue = 1.0;

      filters.forEach((f, i) => {
          if (currentFrequencies[i]) {
            f.frequency.value = currentFrequencies[i];
            f.Q.value = qValue;
          }
      });
  }

  if (settings.preamp !== undefined) {
    preAmpNode.gain.value = Math.pow(10, settings.preamp / 20);
  }

  if (settings.bands && filters.length) {
    settings.bands.forEach((val, index) => {
      if (filters[index]) {
        filters[index].gain.value = val;
      }
    });
  }
}

// Auto-reconnect audio nodes during PiP window transitions to prevent dropouts
function handlePiPTransition() {
  if (isEnabled && audioContext && source && preAmpNode) {
    // Give the browser 100ms to finish moving the video tag to the new window
    setTimeout(() => {
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      // Sever and re-establish the connection to wake the audio back up
      source.disconnect();
      source.connect(preAmpNode);
    }, 100);
  }
}

// Listen for the Document PiP window opening
if ('documentPictureInPicture' in window) {
  window.documentPictureInPicture.addEventListener('enter', (e) => {
    handlePiPTransition();
    
    // Listen for the PiP window closing so we can reconnect when the video goes back to the main tab
    e.window.addEventListener('pagehide', handlePiPTransition);
  });
}
