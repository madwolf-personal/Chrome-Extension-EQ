// Default configuration
let currentBandCount = 10;
let frequencies = [];
let currentGains = [];
let preAmpGain = 0.0; 
let savedPresets = {}; 
let isCurrentTabActive = false; 
let isDeleteMode = false;

// DOM Elements
const container = document.getElementById('eqContainer');
const presetList = document.getElementById('presetList');
const presetNameInput = document.getElementById('presetNameInput');
const toggleBtn = document.getElementById('toggleBtn'); 
const preAmpSlider = document.getElementById('preAmpSlider');
const preAmpInput = document.getElementById('preAmpInput');
const preAmpUp = document.getElementById('preAmpUp');
const preAmpDown = document.getElementById('preAmpDown');
const preAmpReset = document.getElementById('preAmpReset');
const bandCountInput = document.getElementById('bandCountInput');
const saveBtn = document.getElementById('savePresetBtn');
const resetBtn = document.getElementById('resetBtn');
const loadBtn = document.getElementById('loadPresetBtn');
const deleteBtn = document.getElementById('deletePresetBtn');
const incBandBtn = document.getElementById('incBandBtn');
const decBandBtn = document.getElementById('decBandBtn');

// --- NEW HELPER: Send message directly to the webpage ---
function sendToActiveTab(message) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {
        // Ignores error if used on an empty tab or chrome settings page
      });
    }
  });
}

// --- Helper 1: Simple Hold ---
function addSimpleHold(button, action) {
  let interval, timeout;
  const start = () => {
    action();
    timeout = setTimeout(() => { interval = setInterval(action, 150); }, 400);
  };
  const stop = () => { clearTimeout(timeout); clearInterval(interval); };
  button.addEventListener('mousedown', start);
  button.addEventListener('mouseup', stop);
  button.addEventListener('mouseleave', stop);
}

// --- Helper 2: Dynamic Acceleration Hold ---
function setupDynamicHold(button, getCurrentValue, setValue, direction) {
  let interval, timeout, startTime;
  const performUpdate = () => {
    const elapsed = Date.now() - startTime;
    const currentVal = parseFloat(getCurrentValue());
    let step = 0.1; 
    if (elapsed > 3000) step = 0.5;      
    else if (elapsed > 2000) step = 0.3; 
    let newValue = currentVal + (step * direction);
    if (newValue > 12) newValue = 12;
    if (newValue < -12) newValue = -12;
    setValue(Math.round(newValue * 10) / 10);
  };
  const start = (e) => {
    if(e.button !== 0) return;
    startTime = Date.now();
    let initialVal = parseFloat(getCurrentValue());
    let nextVal = initialVal + (0.1 * direction);
    if (nextVal > 12) nextVal = 12;
    if (nextVal < -12) nextVal = -12;
    setValue(Math.round(nextVal * 10) / 10);
    timeout = setTimeout(() => { interval = setInterval(performUpdate, 60); }, 400);
  };
  const stop = () => { clearTimeout(timeout); clearInterval(interval); };
  button.addEventListener('mousedown', start);
  button.addEventListener('mouseup', stop);
  button.addEventListener('mouseleave', stop);
}

function generateFrequencies(count) {
  const fullISO = [31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
  const freqs = [];
  const step = (fullISO.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) { freqs.push(fullISO[Math.round(i * step)]); }
  return [...new Set(freqs)].sort((a, b) => a - b);
}

function interpolateGains(oldFreqs, oldGains, newFreqs) {
  if (!oldFreqs || !oldGains || oldFreqs.length === 0) return new Array(newFreqs.length).fill(0);
  return newFreqs.map(newF => {
    const exactIndex = oldFreqs.indexOf(newF);
    if (exactIndex !== -1) return oldGains[exactIndex];
    let lowerIdx = -1, upperIdx = -1;
    for (let i = 0; i < oldFreqs.length; i++) {
      if (oldFreqs[i] < newF) lowerIdx = i;
      if (oldFreqs[i] > newF && upperIdx === -1) { upperIdx = i; break; }
    }
    if (lowerIdx === -1) return oldGains[0]; 
    if (upperIdx === -1) return oldGains[oldGains.length - 1]; 
    const ratio = (newF - oldFreqs[lowerIdx]) / (oldFreqs[upperIdx] - oldFreqs[lowerIdx]);
    return Math.round((oldGains[lowerIdx] + (oldGains[upperIdx] - oldGains[lowerIdx]) * ratio) * 10) / 10;
  });
}

function renderEQ(count, gains = null) {
  container.innerHTML = ''; 
  currentBandCount = count;
  bandCountInput.value = count; 
  const newFrequencies = generateFrequencies(count);

  if (!gains) currentGains = interpolateGains(frequencies, currentGains, newFrequencies);
  else currentGains = (gains.length !== count) ? new Array(count).fill(0) : gains;

  frequencies = newFrequencies;

  frequencies.forEach((freq, i) => {
    const band = document.createElement('div');
    band.className = 'band';
    
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = -12; slider.max = 12; slider.step = 0.1; slider.value = currentGains[i]; slider.className = 'eq-slider';

    const btnUp = document.createElement('button'); btnUp.className = 'gain-btn'; btnUp.innerText = '+';
    const btnDown = document.createElement('button'); btnDown.className = 'gain-btn'; btnDown.innerText = '-';

    const numberInput = document.createElement('input');
    numberInput.type = 'number'; numberInput.className = 'gain-input'; numberInput.value = currentGains[i]; numberInput.min = -12; numberInput.max = 12; numberInput.step = 0.1;

    const btnReset = document.createElement('button');
    btnReset.className = 'band-reset-btn'; btnReset.title = 'Reset to 0dB';

    const updateBand = (val) => {
      val = parseFloat(val); if (isNaN(val)) val = 0;
      val = Math.round(val * 10) / 10;
      if (val > 12) val = 12; else if (val < -12) val = -12;
      currentGains[i] = val; slider.value = val; numberInput.value = val;
      sendUpdate(); saveCurrentState();
    };

    slider.addEventListener('input', (e) => updateBand(e.target.value));
    numberInput.addEventListener('input', (e) => updateBand(e.target.value));
    btnReset.addEventListener('click', () => updateBand(0));
    setupDynamicHold(btnUp, () => currentGains[i], updateBand, 1);
    setupDynamicHold(btnDown, () => currentGains[i], updateBand, -1);

    const bandLabel = document.createElement('span'); bandLabel.className = 'freq-label';
    bandLabel.innerText = (freq >= 1000) ? (freq / 1000) + 'k' : freq;

    band.appendChild(numberInput); band.appendChild(slider); band.appendChild(btnUp); band.appendChild(btnDown); band.appendChild(bandLabel); band.appendChild(btnReset);    
    container.appendChild(band);
  });
}

function updateBandCount(change) {
  let val = parseInt(bandCountInput.value) + change;
  if (val < 5) val = 5; if (val > 20) val = 20;
  if (val !== currentBandCount) { renderEQ(val, null); sendUpdate(); saveCurrentState(); }
}

addSimpleHold(incBandBtn, () => updateBandCount(1));
addSimpleHold(decBandBtn, () => updateBandCount(-1));

function updatePreAmp(val) {
  preAmpGain = parseFloat(val); if (isNaN(preAmpGain)) preAmpGain = 0;
  preAmpGain = Math.round(preAmpGain * 10) / 10;
  if (preAmpGain > 12) preAmpGain = 12; if (preAmpGain < -12) preAmpGain = -12;
  preAmpSlider.value = preAmpGain; preAmpInput.value = preAmpGain;
  sendUpdate(); saveCurrentState();
}
preAmpSlider.addEventListener('input', (e) => updatePreAmp(e.target.value));
preAmpInput.addEventListener('input', (e) => updatePreAmp(e.target.value));
setupDynamicHold(preAmpUp, () => preAmpGain, updatePreAmp, 1);
setupDynamicHold(preAmpDown, () => preAmpGain, updatePreAmp, -1);
preAmpReset.addEventListener('click', () => updatePreAmp(0));

chrome.storage.local.get(['eqSettings', 'userPresets', 'activeTabs'], (result) => {
  let savedBandCount = 10, savedGains = null;
  if (result.eqSettings) {
    if (result.eqSettings.bandCount) savedBandCount = result.eqSettings.bandCount;
    if (result.eqSettings.bands) savedGains = result.eqSettings.bands;
    if (result.eqSettings.preamp) preAmpGain = result.eqSettings.preamp;
  }
  bandCountInput.value = savedBandCount; preAmpInput.value = preAmpGain; preAmpSlider.value = preAmpGain;
  renderEQ(savedBandCount, savedGains);
  
  savedPresets = result.userPresets || {}; 
  if(!result.userPresets) chrome.storage.local.set({ 'userPresets': savedPresets });
  refreshPresetDropdown();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if(!tabs[0]) return;
    const activeTabs = result.activeTabs || [];
    setToggleState(activeTabs.includes(tabs[0].id));
  });
});

function setToggleState(isActive) {
  isCurrentTabActive = isActive;
  if (isActive) {
    toggleBtn.innerText = "Disable EQ";
    toggleBtn.classList.remove('primary'); toggleBtn.classList.add('active-state'); 
  } else {
    toggleBtn.innerText = "Enable EQ";
    toggleBtn.classList.remove('active-state'); toggleBtn.classList.add('primary'); 
  }
}

// --- UPDATED: Uses sendToActiveTab instead of background messages ---
toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;
    
    if (isCurrentTabActive) {
      sendToActiveTab({ type: 'STOP_CAPTURE' });
      setToggleState(false);
      chrome.storage.local.get(['activeTabs'], (data) => {
          chrome.storage.local.set({ 'activeTabs': (data.activeTabs || []).filter(id => id !== tabId) });
      });
    } else {
      sendToActiveTab({ 
        type: 'START_CAPTURE', 
        data: { bands: currentGains, preamp: preAmpGain, frequencies: frequencies } 
      });
      setToggleState(true);
      chrome.storage.local.get(['activeTabs'], (data) => {
          let activeTabs = data.activeTabs || [];
          if (!activeTabs.includes(tabId)) activeTabs.push(tabId);
          chrome.storage.local.set({ 'activeTabs': activeTabs });
      });
    }
  });
});

resetBtn.addEventListener('click', () => {
  preAmpGain = 0; preAmpSlider.value = 0; preAmpInput.value = 0;
  renderEQ(currentBandCount, new Array(currentBandCount).fill(0));
  sendUpdate(); saveCurrentState();
});

let msgTimeout;
function showInputMessage(msg, type) {
  if (msgTimeout) clearTimeout(msgTimeout);
  saveBtn.disabled = true;
  presetNameInput.value = msg;
  presetNameInput.className = type === 'error' ? 'input-error' : 'input-success';
  msgTimeout = setTimeout(() => {
    presetNameInput.value = ''; presetNameInput.className = ''; saveBtn.disabled = false;
  }, 1500);
}

presetNameInput.addEventListener('focus', () => {
  if (presetNameInput.className) {
    if (msgTimeout) clearTimeout(msgTimeout);
    presetNameInput.value = ''; presetNameInput.className = ''; saveBtn.disabled = false;
  }
});

function enterDeleteMode() {
  isDeleteMode = true;
  if (presetList.selectedIndex !== -1) presetList.options[presetList.selectedIndex].text = `Delete "${presetList.value}"?`;
  presetList.disabled = true; presetList.classList.add('input-error');
  loadBtn.innerText = "Yes"; deleteBtn.innerText = "No";
  loadBtn.classList.add('danger'); deleteBtn.classList.remove('danger'); 
}

function exitDeleteMode() {
  isDeleteMode = false; presetList.disabled = false; presetList.className = '';
  refreshPresetDropdown();
  loadBtn.innerText = "Load"; deleteBtn.innerText = "Del";
  loadBtn.classList.remove('danger'); deleteBtn.classList.add('danger');
}

deleteBtn.addEventListener('click', () => {
  if (isDeleteMode) exitDeleteMode();
  else if (presetList.value && savedPresets[presetList.value]) enterDeleteMode();
});

loadBtn.addEventListener('click', () => {
  const selectedName = presetList.value;
  if (isDeleteMode) {
    if (selectedName && savedPresets[selectedName]) {
      delete savedPresets[selectedName];
      chrome.storage.local.set({ 'userPresets': savedPresets }, () => {
        refreshPresetDropdown(); isDeleteMode = false;
        loadBtn.innerText = "Load"; deleteBtn.innerText = "Del";
        loadBtn.className = ''; deleteBtn.className = 'danger';
        presetList.disabled = false; presetList.className = 'input-success';
        presetList.innerHTML = '<option selected>Deleted!</option>' + presetList.innerHTML;
        setTimeout(() => refreshPresetDropdown(), 1500);
      });
    } else exitDeleteMode();
  } else {
    const data = savedPresets[selectedName];
    if (data) {
      preAmpGain = data.preamp || 0; preAmpInput.value = preAmpGain; preAmpSlider.value = preAmpGain;
      renderEQ(data.bandCount || (Array.isArray(data) ? data.length : data.bands.length), Array.isArray(data) ? data : data.bands);
      sendUpdate(); saveCurrentState();
    }
  }
});

saveBtn.addEventListener('click', () => {
  if (isDeleteMode) return; 
  const name = presetNameInput.value.trim();
  if (!name) { showInputMessage('Enter Name!', 'error'); return; }
  savedPresets[name] = { bands: [...currentGains], preamp: preAmpGain, frequencies: [...frequencies], bandCount: currentBandCount };
  chrome.storage.local.set({ 'userPresets': savedPresets }, () => {
    refreshPresetDropdown(); showInputMessage('Saved!', 'success');
  });
});

function refreshPresetDropdown() {
  presetList.innerHTML = '<option value="" disabled selected>Select...</option>';
  if (Object.keys(savedPresets).length === 0) {
    presetList.innerHTML += '<option disabled>(No Presets)</option>';
  } else {
    Object.keys(savedPresets).forEach(name => presetList.innerHTML += `<option value="${name}">${name}</option>`);
  }
}

// --- UPDATED: Send slider updates straight to the webpage ---
function sendUpdate() {
  sendToActiveTab({ 
    type: 'UPDATE_EQ', 
    data: { bands: currentGains, preamp: preAmpGain, frequencies: frequencies } 
  });
}

function saveCurrentState() {
  chrome.storage.local.set({ 'eqSettings': { bands: currentGains, preamp: preAmpGain, bandCount: currentBandCount } });
}