// content.js - Shiraz Pool Auto-Reserve Bot
// Injected into https://sups.shirazu.ac.ir/SfxWeb/

(() => {
  if (window.__supsAutoReserveLoaded) return;
  window.__supsAutoReserveLoaded = true;

  // State
  let isRunning = false;
  let loopTimer = null;
  let attemptCount = 0;
  let isPickerActive = false;
  let targetSlot = {
    ident: '',
    dayText: '',
    slotText: '',
    colIndex: -1,
    rowIndex: -1
  };
  let config = {
    intervalSeconds: 1,
    friendCount: 0,
    mode: 'sniper', // 'sniper' or 'monitor'
    soundEnabled: true
  };

  // Convert Persian numbers to English
  function persianToEnglishDigits(str) {
    if (!str) return '';
    const persianMap = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return str.replace(/[۰-۹]/g, (w) => persianMap.indexOf(w));
  }

  // Play pleasant chime on booking success using Web Audio API
  function playSuccessChime() {
    if (!config.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.35);
      });
    } catch (err) {
      console.warn('Audio chime playback failed:', err);
    }
  }

  // Check if we are on reservation page
  function isReservationPage() {
    return !!(document.getElementById('lstReserve') || document.querySelector('table.ListBase'));
  }

  // Parse days (columns) and timeslots (rows) from the table
  function parseTableStructure() {
    const table = document.querySelector('table.ListBase');
    if (!table) return { days: [], slots: [] };

    const days = [];
    const slots = [];

    // Columns: row 0 headers
    const headerRow = table.querySelector('tr');
    if (headerRow) {
      const ths = headerRow.querySelectorAll('th');
      ths.forEach((th, idx) => {
        if (idx === 0) return; // skip corner empty header
        const rawText = th.innerText.replace(/\s+/g, ' ').trim();
        days.push({
          index: idx,
          label: rawText
        });
      });
    }

    // Rows: time slots
    const rows = table.querySelectorAll('tr.ListEven, tr.ListOdd');
    rows.forEach((tr, rIdx) => {
      const headCell = tr.querySelector('.RowHead');
      const slotText = headCell ? headCell.innerText.trim() : `Slot ${rIdx + 1}`;
      slots.push({
        index: rIdx,
        label: slotText
      });
    });

    return { days, slots };
  }

  // Find cell Ident and info by Day index and Slot index
  function getCellData(colIndex, rowIndex) {
    const table = document.querySelector('table.ListBase');
    if (!table) return null;

    const rows = table.querySelectorAll('tr.ListEven, tr.ListOdd');
    if (rowIndex < 0 || rowIndex >= rows.length) return null;

    const tr = rows[rowIndex];
    const cells = tr.querySelectorAll('td');
    if (colIndex < 0 || colIndex >= cells.length) return null;

    const cell = cells[colIndex];
    if (!cell) return null;

    const slotElem = cell.querySelector('[Ident]') || cell.querySelector('[id^="SfeReserve_"]') || cell.querySelector('.arrayinput');
    const ident = slotElem ? (slotElem.getAttribute('Ident') || (slotElem.id.startsWith('SfeReserve_') ? slotElem.id.split('_')[1] : slotElem.id)) : '';

    return {
      cell,
      slotElem,
      ident,
      text: cell.innerText.trim()
    };
  }

  // Highlight selected cell in the table
  function highlightTargetCell() {
    document.querySelectorAll('.sups-table-cell-highlight').forEach(el => {
      el.classList.remove('sups-table-cell-highlight');
    });

    if (targetSlot.colIndex >= 0 && targetSlot.rowIndex >= 0) {
      const data = getCellData(targetSlot.colIndex, targetSlot.rowIndex);
      if (data && data.cell) {
        data.cell.classList.add('sups-table-cell-highlight');
      }
    } else if (targetSlot.ident) {
      const elem = document.querySelector(`[Ident="${targetSlot.ident}"]`);
      if (elem) {
        const td = elem.closest('td');
        if (td) td.classList.add('sups-table-cell-highlight');
      }
    }
  }

  // Create UI Panel
  function createPanel() {
    if (document.getElementById('sups-auto-reserve-root')) return;

    const root = document.createElement('div');
    root.id = 'sups-auto-reserve-root';

    root.innerHTML = `
      <div class="sups-panel" id="supsPanel">
        <div class="sups-header" id="supsHeader">
          <div class="sups-title-wrap">
            <svg class="sups-logo-icon" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>
            </svg>
            <span class="sups-title">Pool Auto-Reserve</span>
            <span class="sups-badge" id="supsStatusBadge">Ready</span>
          </div>
          <div class="sups-header-actions">
            <button class="sups-btn-icon" id="supsMinimizeBtn" title="Minimize">_</button>
          </div>
        </div>

        <div class="sups-body" id="supsBody">
          <div class="sups-form-group">
            <label>Day:</label>
            <select class="sups-select" id="supsSelectDay">
              <option value="">-- Select Day --</option>
            </select>
          </div>

          <div class="sups-form-group">
            <label>Slot:</label>
            <select class="sups-select" id="supsSelectSlot">
              <option value="">-- Select Slot --</option>
            </select>
          </div>

          <button type="button" class="sups-btn-interactive" id="supsPickOnTableBtn">
            <span>🎯</span>
            <span id="supsPickBtnText">Click cell in table to select</span>
          </button>

          <div class="sups-target-info" id="supsTargetDisplay">
            Target: <span>Not selected</span>
          </div>

          <div class="sups-row-2">
            <div class="sups-form-group">
              <label>Friends:</label>
              <input type="number" class="sups-input" id="supsFriendCount" min="0" max="5" value="0">
            </div>
            <div class="sups-form-group">
              <label>Interval (s):</label>
              <input type="number" class="sups-input" id="supsInterval" min="0.5" max="60" step="0.5" value="1">
            </div>
          </div>

          <div class="sups-form-group">
            <label>Mode:</label>
            <select class="sups-select" id="supsModeSelect">
              <option value="sniper" selected>Sniper (Instant Buy Loop)</option>
              <option value="monitor">Monitor (Check Table First)</option>
            </select>
          </div>

          <div class="sups-action-btns">
            <button type="button" class="sups-btn-start" id="supsStartBtn">Start</button>
            <button type="button" class="sups-btn-stop" id="supsStopBtn" style="display: none;">Stop</button>
          </div>

          <div class="sups-stats-bar">
            <div class="sups-stat-item">
              <span class="sups-stat-label">Attempts:</span>
              <span class="sups-stat-val" id="supsStatAttempts">0</span>
            </div>
            <div class="sups-stat-item">
              <span class="sups-stat-label">Capacity:</span>
              <span class="sups-stat-val" id="supsStatCapacity">--</span>
            </div>
            <div class="sups-stat-item">
              <span class="sups-stat-label">Last Check:</span>
              <span class="sups-stat-val" id="supsStatLastTime">--</span>
            </div>
          </div>

          <div class="sups-log-box" id="supsLogBox">
            <div class="sups-log-line info">[Ready. Select slot and click Start]</div>
          </div>

          <div style="font-size: 10px; color: #94a3b8; text-align: center; padding-top: 2px;">
            by <a href="https://github.com/RMNO21" target="_blank" style="color: #0284c7; text-decoration: none; font-weight: 600;">Raman Tondro</a>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    setupPanelEvents();
    populateDropdowns();
  }

  // Append a message to the in-panel log
  function logMessage(text, type = 'info') {
    const box = document.getElementById('supsLogBox');
    if (!box) return;

    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const div = document.createElement('div');
    div.className = `sups-log-line ${type}`;
    div.innerText = `[${time}] ${text}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  // Populate Day & Time Slot dropdowns from table
  function populateDropdowns() {
    const { days, slots } = parseTableStructure();
    const daySelect = document.getElementById('supsSelectDay');
    const slotSelect = document.getElementById('supsSelectSlot');
    if (!daySelect || !slotSelect) return;

    daySelect.innerHTML = '<option value="">-- Select Day --</option>';
    days.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.index;
      opt.textContent = d.label;
      daySelect.appendChild(opt);
    });

    slotSelect.innerHTML = '<option value="">-- Select Slot --</option>';
    slots.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.index;
      opt.textContent = s.label;
      slotSelect.appendChild(opt);
    });
  }

  // Update target when dropdowns change
  function updateTargetFromDropdowns() {
    const daySelect = document.getElementById('supsSelectDay');
    const slotSelect = document.getElementById('supsSelectSlot');
    if (!daySelect || !slotSelect) return;

    const colIdx = parseInt(daySelect.value, 10);
    const rowIdx = parseInt(slotSelect.value, 10);

    if (isNaN(colIdx) || isNaN(rowIdx)) return;

    const cellData = getCellData(colIdx, rowIdx);
    if (!cellData) {
      logMessage('Slot data not found.', 'warn');
      return;
    }

    const dayText = daySelect.options[daySelect.selectedIndex].text;
    const slotText = slotSelect.options[slotSelect.selectedIndex].text;

    setTargetSlot({
      ident: cellData.ident,
      dayText,
      slotText,
      colIndex: colIdx,
      rowIndex: rowIdx
    });
  }

  // Set target slot state and update UI
  function setTargetSlot({ ident, dayText, slotText, colIndex, rowIndex }) {
    targetSlot = { ident, dayText, slotText, colIndex, rowIndex };

    const disp = document.getElementById('supsTargetDisplay');
    if (disp) {
      disp.innerHTML = `Target: <span>${dayText} | ${slotText}</span>`;
      disp.title = `ID: ${ident || 'N/A'}`;
    }

    highlightTargetCell();
    logMessage(`Target: ${dayText} - ${slotText}`, 'info');
  }

  // Toggle Table Cell Picker Mode
  function toggleTablePicker() {
    isPickerActive = !isPickerActive;
    const btn = document.getElementById('supsPickOnTableBtn');
    const btnText = document.getElementById('supsPickBtnText');
    const table = document.querySelector('table.ListBase');

    if (!table) {
      logMessage('Table not found.', 'error');
      return;
    }

    const allCells = table.querySelectorAll('tr.ListEven td:not(.RowHead), tr.ListOdd td:not(.RowHead)');

    if (isPickerActive) {
      if (btn) btn.classList.add('active');
      if (btnText) btnText.textContent = 'Click cell in table...';
      allCells.forEach(cell => cell.classList.add('sups-cell-clickable-hover'));
      logMessage('Click any cell in table to select.', 'info');
    } else {
      if (btn) btn.classList.remove('active');
      if (btnText) btnText.textContent = 'Click cell in table to select';
      allCells.forEach(cell => cell.classList.remove('sups-cell-clickable-hover'));
    }
  }

  // Attach event handlers
  function setupPanelEvents() {
    const minimizeBtn = document.getElementById('supsMinimizeBtn');
    const body = document.getElementById('supsBody');
    const daySelect = document.getElementById('supsSelectDay');
    const slotSelect = document.getElementById('supsSelectSlot');
    const pickBtn = document.getElementById('supsPickOnTableBtn');
    const startBtn = document.getElementById('supsStartBtn');
    const stopBtn = document.getElementById('supsStopBtn');
    const modeSelect = document.getElementById('supsModeSelect');
    const intervalInput = document.getElementById('supsInterval');
    const friendInput = document.getElementById('supsFriendCount');

    // Minimize toggle
    minimizeBtn.addEventListener('click', () => {
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'flex' : 'none';
      minimizeBtn.textContent = isHidden ? '_' : '+';
    });

    // Dropdown changes
    daySelect.addEventListener('change', updateTargetFromDropdowns);
    slotSelect.addEventListener('change', updateTargetFromDropdowns);

    // Pick on table click
    pickBtn.addEventListener('click', toggleTablePicker);

    // Click handler for table cells
    document.addEventListener('click', (e) => {
      if (!isPickerActive) return;
      const td = e.target.closest('td');
      if (!td || td.classList.contains('RowHead')) return;

      const tr = td.closest('tr');
      if (!tr || (!tr.classList.contains('ListEven') && !tr.classList.contains('ListOdd'))) return;

      const table = tr.closest('table.ListBase');
      if (!table) return;

      // Determine col and row indices
      const cells = Array.from(tr.querySelectorAll('td'));
      const colIndex = cells.indexOf(td);

      const rows = Array.from(table.querySelectorAll('tr.ListEven, tr.ListOdd'));
      const rowIndex = rows.indexOf(tr);

      const headCell = tr.querySelector('.RowHead');
      const slotText = headCell ? headCell.innerText.trim() : `Slot ${rowIndex + 1}`;

      const headerRow = table.querySelector('tr');
      const ths = headerRow ? Array.from(headerRow.querySelectorAll('th')) : [];
      const dayText = ths[colIndex] ? ths[colIndex].innerText.replace(/\s+/g, ' ').trim() : `Day ${colIndex}`;

      const slotElem = td.querySelector('[Ident]') || td.querySelector('[id^="SfeReserve_"]') || td.querySelector('.arrayinput');
      const ident = slotElem ? (slotElem.getAttribute('Ident') || (slotElem.id.startsWith('SfeReserve_') ? slotElem.id.split('_')[1] : slotElem.id)) : '';

      setTargetSlot({ ident, dayText, slotText, colIndex, rowIndex });

      // Update dropdown selections to match
      daySelect.value = colIndex;
      slotSelect.value = rowIndex;

      toggleTablePicker(); // Turn off picker mode
      e.stopPropagation();
      e.preventDefault();
    }, true);

    // Mode and settings change
    modeSelect.addEventListener('change', (e) => {
      config.mode = e.target.value;
      logMessage(`Mode: ${e.target.value === 'sniper' ? 'Sniper' : 'Monitor'}`);
    });

    intervalInput.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      config.intervalSeconds = isNaN(val) || val < 0.5 ? 1 : val;
    });

    friendInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      config.friendCount = isNaN(val) || val < 0 ? 0 : val;
    });

    // Start & Stop
    startBtn.addEventListener('click', startAutomation);
    stopBtn.addEventListener('click', stopAutomation);
  }

  // Start Automation Loop
  function startAutomation() {
    if (!targetSlot.ident) {
      alert('Please select a day and slot first!');
      return;
    }

    isRunning = true;
    attemptCount = 0;

    const startBtn = document.getElementById('supsStartBtn');
    const stopBtn = document.getElementById('supsStopBtn');
    const badge = document.getElementById('supsStatusBadge');

    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    badge.textContent = 'Running';
    badge.className = 'sups-badge running';

    logMessage(`Started (${config.mode}, ${config.intervalSeconds}s)`, 'info');

    runTick();
  }

  // Stop Automation Loop
  function stopAutomation() {
    isRunning = false;
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }

    const startBtn = document.getElementById('supsStartBtn');
    const stopBtn = document.getElementById('supsStopBtn');
    const badge = document.getElementById('supsStatusBadge');

    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (badge) {
      badge.textContent = 'Stopped';
      badge.className = 'sups-badge';
    }

    logMessage('Stopped.', 'warn');
  }

  // Accurate validation of server response
  function isReservationSuccessful(ret, targetIdent) {
    if (!ret) return { isSuccess: false, message: 'No server response' };

    const spl = ret.split('!^*^!');
    const serverMsg = (spl[0] || ret).trim();

    // Specific error keywords from Shiraz University Welfare portal
    const errorKeywords = [
      'کمتر از تقاضا',
      'تکمیل ظرفیت',
      'تکمیل است',
      'کافی نمی باشد',
      'کافی نیست',
      'عدم تطبیق',
      'محروم',
      'مجوز',
      'امکان رزرو',
      'نمی توانید',
      'خطا',
      'ErrorMessage'
    ];

    for (const kw of errorKeywords) {
      if (serverMsg.includes(kw)) {
        return { isSuccess: false, message: serverMsg };
      }
    }

    // Success keywords
    const successKeywords = [
      'موفقیت',
      'با موفقیت',
      'ثبت گردید',
      'ثبت شد',
      'خریداری شد',
      'انجام شد',
      'انجام گردید'
    ];

    const hasSuccessKw = successKeywords.some(kw => serverMsg.includes(kw));

    // Also verify updated HTML table if present
    if (spl[1] && targetIdent) {
      const hasCancelBtn = spl[1].includes(`SfeCancel_${targetIdent}`);
      const hasPurchased = spl[1].includes(`Ident="${targetIdent}"`) && (spl[1].includes('خریداری شده') || spl[1].includes('مصرف شده'));
      if (hasCancelBtn || hasPurchased) {
        return { isSuccess: true, message: serverMsg || 'Reserved successfully!' };
      }
      if (spl[1].includes(`Ident="${targetIdent}"`) && spl[1].includes('تکمیل ظرفیت')) {
        return { isSuccess: false, message: serverMsg || 'Full capacity' };
      }
    }

    if (hasSuccessKw) {
      return { isSuccess: true, message: serverMsg };
    }

    return { isSuccess: false, message: serverMsg };
  }

  // Reservation Buy Request
  async function performReserve(ident, friendCount) {
    try {
      const buyUrl = `/SfxWeb/Script/AjaxMember.aspx?Act=SfeBuy&Friend=${friendCount}&Ident=${encodeURIComponent(ident)}&_=${Date.now()}`;

      const res = await fetch(buyUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      const ret = await res.text();
      const spl = ret.split('!^*^!');

      // Update table if returned by server so UI is fresh
      if (spl[1]) {
        const lstReserve = document.getElementById('lstReserve');
        if (lstReserve) {
          lstReserve.innerHTML = spl[1];
          highlightTargetCell();
        }
      }
      if (spl[2]) {
        const lblCredit = document.getElementById('lblCredit');
        if (lblCredit) lblCredit.innerHTML = spl[2];
      }

      // Check whether this was a GENUINE success or an error
      const verdict = isReservationSuccessful(ret, ident);

      if (!verdict.isSuccess) {
        logMessage(`[#${attemptCount}] Full. Retrying...`, 'warn');
        const statCapacity = document.getElementById('supsStatCapacity');
        if (statCapacity) statCapacity.textContent = '0 (Full)';
        return { success: false, message: verdict.message };
      }

      // REAL SUCCESS!
      const successMsg = verdict.message || 'Reserved successfully!';
      logMessage(`🎉 SUCCESS: ${successMsg}`, 'success');
      playSuccessChime();

      // Desktop notification
      chrome.runtime.sendMessage({
        action: 'notify',
        title: '🎉 Reserved Successfully!',
        body: `${targetSlot.slotText} (${targetSlot.dayText}) has been booked.`
      });

      const badge = document.getElementById('supsStatusBadge');
      if (badge) {
        badge.textContent = 'Booked';
        badge.className = 'sups-badge success';
      }

      stopAutomation();
      showSuccessModal(successMsg);
      return { success: true, message: successMsg };
    } catch (err) {
      logMessage(`Network error: ${err.message}`, 'error');
      return { success: false, error: err };
    }
  }

  // Display celebratory success modal
  function showSuccessModal(msg) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.7); z-index: 10000000;
      display: flex; align-items: center; justify-content: center;
      direction: ltr; font-family: -apple-system, sans-serif;
    `;
    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; padding: 24px; width: 360px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);">
        <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
        <h2 style="color: #15803d; margin: 0 0 8px; font-size: 18px;">Reserved Successfully!</h2>
        <p style="color: #334155; font-size: 13px; line-height: 1.5; margin: 0 0 16px;">${msg}<br><b>${targetSlot.dayText} - ${targetSlot.slotText}</b></p>
        <button id="supsCloseModalBtn" style="padding: 8px 20px; background: #16a34a; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px;">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('supsCloseModalBtn').addEventListener('click', () => modal.remove());
  }

  // Check capacity & status from fresh page fetch
  async function checkPageStatus() {
    try {
      // Cache-busted URL to guarantee fresh data from server
      const url = `${window.location.pathname}?_t=${Date.now()}`;
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Live-update entire #lstReserve table so the user sees live server changes on screen
      const freshTable = doc.getElementById('lstReserve');
      const currentTable = document.getElementById('lstReserve');
      if (freshTable && currentTable) {
        currentTable.innerHTML = freshTable.innerHTML;
        highlightTargetCell();
      }

      // Look for the target element in doc
      let targetElemInDoc = null;
      if (targetSlot.ident) {
        targetElemInDoc = doc.querySelector(`[Ident="${targetSlot.ident}"]`) ||
                          doc.querySelector(`[id="SfeReserve_${targetSlot.ident}"]`) ||
                          doc.querySelector(`[id="${targetSlot.ident}"]`);
      }

      // If not found by ident, look by table coordinates
      if (!targetElemInDoc && targetSlot.colIndex >= 0 && targetSlot.rowIndex >= 0) {
        const rows = doc.querySelectorAll('table.ListBase tr.ListEven, table.ListBase tr.ListOdd');
        if (rows[targetSlot.rowIndex]) {
          const cells = rows[targetSlot.rowIndex].querySelectorAll('td');
          if (cells[targetSlot.colIndex]) {
            targetElemInDoc = cells[targetSlot.colIndex].querySelector('[Ident]') ||
                              cells[targetSlot.colIndex].querySelector('[id^="SfeReserve_"]') ||
                              cells[targetSlot.colIndex].querySelector('.arrayinput');
          }
        }
      }

      if (!targetElemInDoc) {
        return { isAvailable: false, capacity: 0, text: 'Not found' };
      }

      const text = targetElemInDoc.innerText || '';
      const englishText = persianToEnglishDigits(text);

      // Extract capacity number
      let capacityNum = 0;
      const match = englishText.match(/ظرفیت باقیمانده\s*[:=]\s*(\d+)/i) || englishText.match(/(\d+)/);
      if (match) {
        capacityNum = parseInt(match[1], 10);
      }

      // Comprehensive availability checks
      const parentTd = targetElemInDoc.closest('td');
      const isReserveBtn = (targetElemInDoc.id && targetElemInDoc.id.startsWith('SfeReserve_')) ||
                           (parentTd && !!parentTd.querySelector('[id^="SfeReserve_"]'));

      const isMismatch = text.includes('عدم تطبیق') || (targetElemInDoc.title && targetElemInDoc.title.includes('عدم تطبیق'));
      const isAlreadyUsed = text.includes('مصرف شده') || (targetElemInDoc.title && targetElemInDoc.title.includes('خریداری شده'));
      const isFull = (text.includes('تکمیل ظرفیت') && capacityNum === 0) || (targetElemInDoc.title && targetElemInDoc.title.includes('تکمیل ظرفیت') && capacityNum === 0);

      const isAvailable = isReserveBtn ||
                          (capacityNum > 0 && !isMismatch && !isAlreadyUsed) ||
                          (!targetElemInDoc.classList.contains('btn-disable') && !isFull && !isMismatch);

      return {
        isAvailable,
        capacity: capacityNum,
        title: targetElemInDoc.title || '',
        text
      };
    } catch (err) {
      console.error('Fetch error:', err);
      return { isAvailable: false, capacity: 0, error: err.message };
    }
  }

  // Single iteration of loop
  async function runTick() {
    if (!isRunning) return;

    attemptCount++;

    const statAttempts = document.getElementById('supsStatAttempts');
    const statLastTime = document.getElementById('supsStatLastTime');
    const statCapacity = document.getElementById('supsStatCapacity');

    if (statAttempts) statAttempts.textContent = attemptCount;
    if (statLastTime) statLastTime.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

    try {
      if (config.mode === 'sniper') {
        const res = await performReserve(targetSlot.ident, config.friendCount);
        if (res.success) return;
      } else {
        const status = await checkPageStatus();
        if (statCapacity) statCapacity.textContent = status.capacity;

        if (status.isAvailable) {
          logMessage(`Available! (${status.capacity}). Booking...`, 'success');
          const res = await performReserve(targetSlot.ident, config.friendCount);
          if (res.success) return;
        } else {
          logMessage(`[#${attemptCount}] Cap: ${status.capacity}. Checking...`);
        }
      }
    } catch (err) {
      logMessage(`Loop error: ${err.message}`, 'error');
    }

    if (isRunning) {
      const delayMs = Math.max(500, config.intervalSeconds * 1000);
      loopTimer = setTimeout(runTick, delayMs);
    }
  }

  // Initialize on page load
  function init() {
    if (isReservationPage()) {
      createPanel();
    } else {
      const observer = new MutationObserver(() => {
        if (isReservationPage() && !document.getElementById('sups-auto-reserve-root')) {
          createPanel();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
