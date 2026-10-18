// content.js - sups shirazu (Pool & Food Auto-Reserve)
// Shiraz University SUPS Portal Assistant (sups.shirazu.ac.ir)

(() => {
  if (window.__supsExtensionLoaded) return;
  window.__supsExtensionLoaded = true;

  // -------------------------------------------------------------
  // General Utility Helpers
  // -------------------------------------------------------------
  function persianToEnglishDigits(str) {
    if (!str) return '';
    const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(str).replace(/[۰-۹]/g, (w) => map.indexOf(w));
  }

  function englishToPersianDigits(str) {
    if (str === null || str === undefined) return '';
    const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(str).replace(/\d/g, (d) => map[parseInt(d, 10)]);
  }

  // Exact price extraction for food titles (handles strings with weights, egg counts, etc.)
  function extractPriceFromFoodString(str) {
    if (!str) return 0;
    const eng = persianToEnglishDigits(String(str));

    // Match numbers directly before ریال or ريال
    // Example: "صبحانه هفتگي ( شير 100 گرمي ) ( 600,000 ريال)" -> 600000
    const match = eng.match(/([\d,]+)\s*(?:ریال|ريال)/);
    if (match) {
      const numStr = match[1].replace(/,/g, '').trim();
      const val = parseInt(numStr, 10);
      if (!isNaN(val) && val > 0) return val;
    }

    // Match number inside the last parentheses: ( 600,000 )
    const matchParen = eng.match(/\(\s*([\d,]+)\s*(?:ریال|ريال)?\s*\)\s*$/);
    if (matchParen) {
      const numStr = matchParen[1].replace(/,/g, '').trim();
      const val = parseInt(numStr, 10);
      if (!isNaN(val) && val > 0) return val;
    }

    return 0;
  }

  function parsePrice(str) {
    if (!str) return 0;
    const eng = persianToEnglishDigits(String(str));
    const cleaned = eng.replace(/[^\d]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
  }

  function formatPriceRials(num) {
    if (isNaN(num)) return '۰ ریال';
    const formatted = num.toLocaleString('en-US');
    return englishToPersianDigits(formatted) + ' ریال';
  }

  // Preset recharge packages common in Shiraz University SUPS portal
  const PRESET_PACKAGES = [
    500000,
    1000000,
    1500000,
    2000000,
    2500000,
    3000000,
    4000000,
    5000000,
    10000000
  ];

  function getMinimumRechargePackage(deficit) {
    if (deficit <= 0) return 0;
    for (const pkg of PRESET_PACKAGES) {
      if (pkg >= deficit) return pkg;
    }
    return Math.ceil(deficit / 1000000) * 1000000;
  }

  function playSuccessChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
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
      console.warn('Audio chime error:', err);
    }
  }

  // Page detection
  const currentPath = window.location.pathname.toLowerCase();
  const isPoolPage = currentPath.includes('sfereserve') || !!document.getElementById('SfeForm');
  const isFoodPage = currentPath.includes('sfxchipweek') || !!document.getElementById('ChipEditForm') || !!document.getElementById('edChip');

  // =============================================================
  // 1. POOL AUTO-RESERVE MODULE (Only on SfeReserve.aspx)
  // =============================================================
  function initPoolBot() {
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
      mode: 'sniper',
      soundEnabled: true
    };

    function parseTableStructure() {
      const table = document.querySelector('table.ListBase');
      if (!table) return { days: [], slots: [] };
      const days = [];
      const slots = [];
      const headerRow = table.querySelector('tr');
      if (headerRow) {
        const ths = headerRow.querySelectorAll('th');
        ths.forEach((th, idx) => {
          if (idx === 0) return;
          days.push({ index: idx, label: th.innerText.replace(/\s+/g, ' ').trim() });
        });
      }
      const rows = table.querySelectorAll('tr.ListEven, tr.ListOdd');
      rows.forEach((tr, rIdx) => {
        const headCell = tr.querySelector('.RowHead');
        slots.push({ index: rIdx, label: headCell ? headCell.innerText.trim() : `Slot ${rIdx + 1}` });
      });
      return { days, slots };
    }

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
      return { cell, slotElem, ident, text: cell.innerText.trim() };
    }

    function highlightTargetCell() {
      document.querySelectorAll('.sups-table-cell-highlight').forEach(el => el.classList.remove('sups-table-cell-highlight'));
      if (targetSlot.colIndex >= 0 && targetSlot.rowIndex >= 0) {
        const data = getCellData(targetSlot.colIndex, targetSlot.rowIndex);
        if (data && data.cell) data.cell.classList.add('sups-table-cell-highlight');
      } else if (targetSlot.ident) {
        const elem = document.querySelector(`[Ident="${targetSlot.ident}"]`);
        if (elem) {
          const td = elem.closest('td');
          if (td) td.classList.add('sups-table-cell-highlight');
        }
      }
    }

    function createPoolPanel() {
      if (document.getElementById('sups-pool-root')) return;

      const root = document.createElement('div');
      root.id = 'sups-pool-root';

      root.innerHTML = `
        <div class="sups-floating-pill" id="supsPoolLauncher" title="باز کردن پنل رزرو خودکار استخر">
          <span class="sups-pill-icon">🏊‍♂️</span>
          <span class="sups-pill-text">رزرو خودکار استخر</span>
        </div>

        <div class="sups-panel" id="supsPoolPanel" style="display: none;">
          <div class="sups-header" id="supsHeader">
            <div class="sups-title-wrap">
              <span class="sups-header-icon">🏊‍♂️</span>
              <span class="sups-title">sups shirazu (استخر)</span>
              <span class="sups-badge" id="supsStatusBadge">آماده</span>
            </div>
            <div class="sups-header-actions">
              <button class="sups-btn-icon" id="supsPoolCloseBtn" title="بستن / کوچک کردن">✕</button>
            </div>
          </div>

          <div class="sups-body" id="supsBody">
            <div class="sups-form-group">
              <label>روز:</label>
              <select class="sups-select" id="supsSelectDay">
                <option value="">-- انتخاب روز --</option>
              </select>
            </div>

            <div class="sups-form-group">
              <label>سانس:</label>
              <select class="sups-select" id="supsSelectSlot">
                <option value="">-- انتخاب سانس --</option>
              </select>
            </div>

            <button type="button" class="sups-btn-interactive" id="supsPickOnTableBtn">
              <span>🎯</span>
              <span id="supsPickBtnText">انتخاب با کلیک روی جدول</span>
            </button>

            <div class="sups-target-info" id="supsTargetDisplay">
              هدف: <span>انتخاب نشده</span>
            </div>

            <div class="sups-row-2">
              <div class="sups-form-group">
                <label>تعداد همراه:</label>
                <input type="number" class="sups-input" id="supsFriendCount" min="0" max="5" value="0">
              </div>
              <div class="sups-form-group">
                <label>فاصله تلاش (ثانیه):</label>
                <input type="number" class="sups-input" id="supsInterval" min="0.5" max="60" step="0.5" value="1">
              </div>
            </div>

            <div class="sups-form-group">
              <label>حالت:</label>
              <select class="sups-select" id="supsModeSelect">
                <option value="sniper" selected>حالت اسنایپر (خرید مستقیم در حلقه)</option>
                <option value="monitor">حالت مانیتور (بررسی جدول سپس رزرو)</option>
              </select>
            </div>

            <div class="sups-action-btns">
              <button type="button" class="sups-btn-start" id="supsStartBtn">شروع رزرو خودکار</button>
              <button type="button" class="sups-btn-stop" id="supsStopBtn" style="display: none;">توقف</button>
            </div>

            <div class="sups-stats-bar">
              <div class="sups-stat-item">
                <span class="sups-stat-label">تلاش‌ها:</span>
                <span class="sups-stat-val" id="supsStatAttempts">۰</span>
              </div>
              <div class="sups-stat-item">
                <span class="sups-stat-label">ظرفیت:</span>
                <span class="sups-stat-val" id="supsStatCapacity">--</span>
              </div>
              <div class="sups-stat-item">
                <span class="sups-stat-label">آخرین بررسی:</span>
                <span class="sups-stat-val" id="supsStatLastTime">--</span>
              </div>
            </div>

            <div class="sups-log-box" id="supsLogBox">
              <div class="sups-log-line info">[آماده. سانس را انتخاب و شروع کنید]</div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(root);

      const launcher = document.getElementById('supsPoolLauncher');
      const panel = document.getElementById('supsPoolPanel');
      const closeBtn = document.getElementById('supsPoolCloseBtn');

      launcher.addEventListener('click', () => {
        panel.style.display = 'flex';
        launcher.style.display = 'none';
      });

      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
        launcher.style.display = 'flex';
      });

      setupPoolEvents();
      populatePoolDropdowns();
    }

    function logMessage(text, type = 'info') {
      const box = document.getElementById('supsLogBox');
      if (!box) return;
      const time = new Date().toLocaleTimeString('fa-IR');
      const div = document.createElement('div');
      div.className = `sups-log-line ${type}`;
      div.innerText = `[${time}] ${text}`;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    }

    function populatePoolDropdowns() {
      const { days, slots } = parseTableStructure();
      const daySelect = document.getElementById('supsSelectDay');
      const slotSelect = document.getElementById('supsSelectSlot');
      if (!daySelect || !slotSelect) return;

      daySelect.innerHTML = '<option value="">-- انتخاب روز --</option>';
      days.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.index;
        opt.textContent = d.label;
        daySelect.appendChild(opt);
      });

      slotSelect.innerHTML = '<option value="">-- انتخاب سانس --</option>';
      slots.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.index;
        opt.textContent = s.label;
        slotSelect.appendChild(opt);
      });
    }

    function updateTargetFromDropdowns() {
      const daySelect = document.getElementById('supsSelectDay');
      const slotSelect = document.getElementById('supsSelectSlot');
      if (!daySelect || !slotSelect) return;
      const colIdx = parseInt(daySelect.value, 10);
      const rowIdx = parseInt(slotSelect.value, 10);
      if (isNaN(colIdx) || isNaN(rowIdx)) return;
      const cellData = getCellData(colIdx, rowIdx);
      if (!cellData) {
        logMessage('اطلاعات سانس یافت نشد.', 'warn');
        return;
      }
      setTargetSlot({
        ident: cellData.ident,
        dayText: daySelect.options[daySelect.selectedIndex].text,
        slotText: slotSelect.options[slotSelect.selectedIndex].text,
        colIndex: colIdx,
        rowIndex: rowIdx
      });
    }

    function setTargetSlot({ ident, dayText, slotText, colIndex, rowIndex }) {
      targetSlot = { ident, dayText, slotText, colIndex, rowIndex };
      const disp = document.getElementById('supsTargetDisplay');
      if (disp) {
        disp.innerHTML = `هدف: <span>${dayText} | ${slotText}</span>`;
      }
      highlightTargetCell();
      logMessage(`هدف تنظیم شد: ${dayText} - ${slotText}`, 'info');
    }

    function toggleTablePicker() {
      isPickerActive = !isPickerActive;
      const btn = document.getElementById('supsPickOnTableBtn');
      const btnText = document.getElementById('supsPickBtnText');
      const table = document.querySelector('table.ListBase');
      if (!table) return;

      const allCells = table.querySelectorAll('tr.ListEven td:not(.RowHead), tr.ListOdd td:not(.RowHead)');
      if (isPickerActive) {
        if (btn) btn.classList.add('active');
        if (btnText) btnText.textContent = 'روی خانه موردنظر در جدول کلیک کنید...';
        allCells.forEach(cell => cell.classList.add('sups-cell-clickable-hover'));
      } else {
        if (btn) btn.classList.remove('active');
        if (btnText) btnText.textContent = 'انتخاب با کلیک روی جدول';
        allCells.forEach(cell => cell.classList.remove('sups-cell-clickable-hover'));
      }
    }

    function setupPoolEvents() {
      const daySelect = document.getElementById('supsSelectDay');
      const slotSelect = document.getElementById('supsSelectSlot');
      const pickBtn = document.getElementById('supsPickOnTableBtn');
      const startBtn = document.getElementById('supsStartBtn');
      const stopBtn = document.getElementById('supsStopBtn');
      const modeSelect = document.getElementById('supsModeSelect');
      const intervalInput = document.getElementById('supsInterval');
      const friendInput = document.getElementById('supsFriendCount');

      daySelect.addEventListener('change', updateTargetFromDropdowns);
      slotSelect.addEventListener('change', updateTargetFromDropdowns);
      pickBtn.addEventListener('click', toggleTablePicker);

      document.addEventListener('click', (e) => {
        if (!isPickerActive) return;
        const td = e.target.closest('td');
        if (!td || td.classList.contains('RowHead')) return;
        const tr = td.closest('tr');
        if (!tr || (!tr.classList.contains('ListEven') && !tr.classList.contains('ListOdd'))) return;
        const table = tr.closest('table.ListBase');
        if (!table) return;

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
        daySelect.value = colIndex;
        slotSelect.value = rowIndex;
        toggleTablePicker();
        e.stopPropagation();
        e.preventDefault();
      }, true);

      modeSelect.addEventListener('change', (e) => {
        config.mode = e.target.value;
      });

      intervalInput.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        config.intervalSeconds = isNaN(val) || val < 0.5 ? 1 : val;
      });

      friendInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        config.friendCount = isNaN(val) || val < 0 ? 0 : val;
      });

      startBtn.addEventListener('click', startPoolAutomation);
      stopBtn.addEventListener('click', stopPoolAutomation);
    }

    function startPoolAutomation() {
      if (!targetSlot.ident) {
        alert('لطفاً ابتدا سانس مورد نظر را انتخاب نمایید.');
        return;
      }
      isRunning = true;
      attemptCount = 0;
      document.getElementById('supsStartBtn').style.display = 'none';
      document.getElementById('supsStopBtn').style.display = 'block';
      const badge = document.getElementById('supsStatusBadge');
      badge.textContent = 'در حال اجرا';
      badge.className = 'sups-badge running';
      logMessage(`حلقه رزرو فعال شد (${config.intervalSeconds} ثانیه)`, 'info');
      runPoolTick();
    }

    function stopPoolAutomation() {
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
        badge.textContent = 'متوقف';
        badge.className = 'sups-badge';
      }
      logMessage('عملیات متوقف شد.', 'warn');
    }

    function isReservationSuccessful(ret, targetIdent) {
      if (!ret) return { isSuccess: false, message: 'پاسخی از سرور دریافت نشد' };
      const spl = ret.split('!^*^!');
      const serverMsg = (spl[0] || ret).trim();
      const errorKeywords = ['کمتر از تقاضا', 'تکمیل ظرفیت', 'تکمیل است', 'کافی نمی باشد', 'کافی نیست', 'عدم تطبیق', 'محروم', 'مجوز', 'امکان رزرو', 'نمی توانید', 'خطا', 'ErrorMessage'];
      for (const kw of errorKeywords) {
        if (serverMsg.includes(kw)) return { isSuccess: false, message: serverMsg };
      }
      const successKeywords = ['موفقیت', 'با موفقیت', 'ثبت گردید', 'ثبت شد', 'خریداری شد', 'انجام شد', 'انجام گردید'];
      if (successKeywords.some(kw => serverMsg.includes(kw))) {
        return { isSuccess: true, message: serverMsg };
      }
      if (spl[1] && targetIdent) {
        const hasCancelBtn = spl[1].includes(`SfeCancel_${targetIdent}`);
        const hasPurchased = spl[1].includes(`Ident="${targetIdent}"`) && (spl[1].includes('خریداری شده') || spl[1].includes('مصرف شده'));
        if (hasCancelBtn || hasPurchased) {
          return { isSuccess: true, message: serverMsg || 'رزرو با موفقیت انجام شد' };
        }
      }
      return { isSuccess: false, message: serverMsg };
    }

    async function performReserve(ident, friendCount) {
      try {
        const buyUrl = `/SfxWeb/Script/AjaxMember.aspx?Act=SfeBuy&Friend=${friendCount}&Ident=${encodeURIComponent(ident)}&_=${Date.now()}`;
        const res = await fetch(buyUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
        const ret = await res.text();
        const spl = ret.split('!^*^!');
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

        const verdict = isReservationSuccessful(ret, ident);
        if (!verdict.isSuccess) {
          logMessage(`[تلاش #${attemptCount}] ظرفیت پر است. تلاش مجدد...`, 'warn');
          const statCap = document.getElementById('supsStatCapacity');
          if (statCap) statCap.textContent = '۰';
          return { success: false, message: verdict.message };
        }

        const successMsg = verdict.message || 'رزرو با موفقیت انجام شد!';
        logMessage(`🎉 رزرو موفق: ${successMsg}`, 'success');
        playSuccessChime();

        chrome.runtime.sendMessage({
          action: 'notify',
          title: '🎉 رزرو استخر موفق بود!',
          body: `${targetSlot.slotText} (${targetSlot.dayText}) با موفقیت ثبت شد.`
        });

        stopPoolAutomation();
        alert(`رزرو استخر با موفقیت ثبت گردید:\n${targetSlot.dayText} - ${targetSlot.slotText}`);
        return { success: true, message: successMsg };
      } catch (err) {
        logMessage(`خطای شبکه: ${err.message}`, 'error');
        return { success: false, error: err };
      }
    }

    async function runPoolTick() {
      if (!isRunning) return;
      attemptCount++;
      const statAttempts = document.getElementById('supsStatAttempts');
      const statLastTime = document.getElementById('supsStatLastTime');
      if (statAttempts) statAttempts.textContent = englishToPersianDigits(attemptCount);
      if (statLastTime) statLastTime.textContent = new Date().toLocaleTimeString('fa-IR');

      try {
        const res = await performReserve(targetSlot.ident, config.friendCount);
        if (res.success) return;
      } catch (err) {
        logMessage(`خطا در پردازش: ${err.message}`, 'error');
      }

      if (isRunning) {
        const delayMs = Math.max(500, config.intervalSeconds * 1000);
        loopTimer = setTimeout(runPoolTick, delayMs);
      }
    }

    createPoolPanel();
  }


  // =============================================================
  // 2. FOOD RESERVATION WIZARD MODULE (Only on SfxChipWeek.aspx)
  // =============================================================
  function initFoodBot() {
    // 3 Allowed Restaurants strictly per user requirement:
    // 8: غذاخوری مرکزی
    // 19: غذاخوری ارم( پسر)
    // 7: غذاخوری دانشکده مهندسی شیمی،نفت و گاز
    const RESTAURANTS = [
      { id: 8, name: 'سلف مرکزی', shortName: 'مرکزی' },
      { id: 19, name: 'سلف ارم (پسر)', shortName: 'ارم' },
      { id: 7, name: 'سلف شیمی نفت و گاز', shortName: 'شیمی نفت' }
    ];

    const MEALS = [
      { index: 0, name: 'صبحانه', icon: '☀️' },
      { index: 1, name: 'ناهار', icon: '🍲' },
      { index: 2, name: 'شام', icon: '🌙' }
    ];

    // State
    let activeDayIndex = 0;
    // Map of unique key `${progDate}_${mealIndex}` => order item
    const selectedOrders = {};
    // Cache for food API: `${progDate}_${restaurantId}_${mealIndex}` => food array
    const foodCache = {};

    function getTodayProgDate() {
      const lblDate = document.getElementById('Toolbar1_lblDate');
      if (lblDate) {
        const eng = persianToEnglishDigits(lblDate.innerText);
        const m = eng.match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (m) {
          return parseInt(`${m[1]}${m[2]}${m[3]}`, 10);
        }
      }
      return null;
    }

    // Check if a date is expired based on SUPS rule:
    // "جهت رزرو غذا تا ساعت 13 ظهر روز قبل اقدام فرماييد"
    function isDateOrTimeExpired(dayProgDate) {
      const todayProg = getTodayProgDate();
      if (!todayProg) return false;

      // If already in the past or today:
      if (dayProgDate <= todayProg) {
        return true;
      }

      // If tomorrow: check if local time >= 13:00 (1 PM)
      const now = new Date();
      const currentHour = now.getHours();

      const isTomorrow = (dayProgDate - todayProg === 1) || (dayProgDate % 100 === 1 && todayProg % 100 >= 29);
      if (isTomorrow && currentHour >= 13) {
        return true;
      }

      return false;
    }

    function parseWeekDays() {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const td = document.getElementById('edDay' + i);
        if (!td) continue;
        const rawText = td.innerText.trim();
        const engText = persianToEnglishDigits(rawText);
        const dateMatch = engText.match(/(\d{4}\/\d{2}\/\d{2})/);
        const rawDate = dateMatch ? dateMatch[1] : '';
        const progDate = rawDate.replace(/\//g, '');

        let dayName = 'روز ' + (i + 1);
        const rawLower = rawText.replace(/\s+/g, ' ');
        if (rawLower.includes('یک شنبه') || rawLower.includes('یکشنبه')) dayName = 'یک‌شنبه';
        else if (rawLower.includes('دو شنبه') || rawLower.includes('دوشنبه')) dayName = 'دوشنبه';
        else if (rawLower.includes('سه شنبه') || rawLower.includes('سه‌شنبه')) dayName = 'سه‌شنبه';
        else if (rawLower.includes('چهار شنبه') || rawLower.includes('چهارشنبه')) dayName = 'چهارشنبه';
        else if (rawLower.includes('پنج شنبه') || rawLower.includes('پنج‌شنبه')) dayName = 'پنج‌شنبه';
        else if (rawLower.includes('شنبه')) dayName = 'شنبه';
        else if (rawLower.includes('جمعه')) dayName = 'جمعه';

        // Short 2-char name for 7-column grid
        let dayShortName = dayName;
        if (dayName === 'یک‌شنبه') dayShortName = '۱ش';
        else if (dayName === 'دوشنبه') dayShortName = '۲ش';
        else if (dayName === 'سه‌شنبه') dayShortName = '۳ش';
        else if (dayName === 'چهارشنبه') dayShortName = '۴ش';
        else if (dayName === 'پنج‌شنبه') dayShortName = '۵ش';
        else if (dayName === 'شنبه') dayShortName = 'شنبه';
        else if (dayName === 'جمعه') dayShortName = 'جمعه';

        // Day of month: e.g. "1405/07/28" -> 28
        const parts = rawDate.split('/');
        const dayOfMonth = parts[2] ? parseInt(parts[2], 10) : '';
        const dayOfMonthPersian = dayOfMonth !== '' ? englishToPersianDigits(dayOfMonth) : '';
        const dayTitle = dayOfMonthPersian ? `${dayName} ${dayOfMonthPersian}` : dayName;

        days.push({
          index: i,
          dayName,
          dayShortName,
          dayTitle,
          dayOfMonthPersian,
          rawDate,
          progDate: parseInt(progDate, 10),
          displayDate: rawDate ? englishToPersianDigits(rawDate) : ''
        });
      }
      return days;
    }

    function getCurrentCredit() {
      const el = document.getElementById('lblCredit');
      return el ? parsePrice(el.innerText) : 0;
    }

    // Inspect the status of a meal slot in the page table
    function getMealSlotStatus(day, mealIndex) {
      const inputId = `Meal${day.index * 3 + mealIndex}`;
      const input = document.getElementById(inputId);
      if (!input) {
        return { exists: false, isUnscheduled: true, isReserved: false, isExpired: false, text: '' };
      }

      const val = (input.value || input.title || '').trim();
      const isPrimary = input.classList.contains('btn-primary');
      const isSuccess = input.classList.contains('btn-success');
      const isDisable = input.classList.contains('btn-disable');

      const isUnscheduled = val.includes('برنامه ریزی نشده') || (!isPrimary && !isSuccess && val === '');
      const isReserved = isPrimary;

      // Check if expired
      let isExpired = val.includes('پایان مهلت رزرو');
      if (!isReserved && !isUnscheduled) {
        if (isDateOrTimeExpired(day.progDate)) {
          isExpired = true;
        } else if (isDisable && !isSuccess) {
          isExpired = true;
        }
      }

      return {
        exists: true,
        inputId,
        isUnscheduled,
        isReserved,
        isSuccess,
        isDisable,
        isExpired,
        text: val.replace(/\r?\n/g, ' - ')
      };
    }

    // Find the first modifiable upcoming day (e.g. tomorrow before 13:00, or Tuesday)
    function findFirstModifiableDayIndex(days) {
      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        if (isDateOrTimeExpired(day.progDate)) continue;
        for (let m = 0; m < 3; m++) {
          const st = getMealSlotStatus(day, m);
          if (st.isSuccess || (!st.isExpired && !st.isUnscheduled)) {
            return i;
          }
        }
      }
      // Fallback
      for (let i = 0; i < days.length; i++) {
        if (!isDateOrTimeExpired(days[i].progDate)) return i;
      }
      return 0;
    }

    // Persist selected orders to chrome.storage.local
    function saveOrders() {
      chrome.storage.local.set({
        sups_saved_orders: selectedOrders,
        sups_saved_timestamp: Date.now()
      });
    }

    function loadSavedOrders(callback) {
      chrome.storage.local.get(['sups_saved_orders', 'sups_saved_timestamp'], (data) => {
        if (data && data.sups_saved_orders) {
          // Keep selections within 48 hours
          if (Date.now() - (data.sups_saved_timestamp || 0) < 48 * 60 * 60 * 1000) {
            Object.assign(selectedOrders, data.sups_saved_orders);
          }
        }
        if (callback) callback();
      });
    }

    // Fetch foods from SUPS Ajax API
    async function fetchFoods(progDate, restaurantId, mealIndex) {
      const cacheKey = `${progDate}_${restaurantId}_${mealIndex}`;
      if (foodCache[cacheKey]) {
        return foodCache[cacheKey];
      }

      const url = `/SfxWeb/Script/AjaxMember.aspx?Act=FoodDessert&ProgDate=${progDate}&Restaurant=${restaurantId}&Meal=${mealIndex}&Rand=${Math.random()}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Cache-Control': 'no-cache'
          }
        });
        const ret = await res.text();
        const spl = ret.split('!~!');
        const foods = [];

        if (spl[0]) {
          const items = spl[0].split('~');
          items.forEach(itemStr => {
            const parts = itemStr.split('^');
            if (parts.length >= 2) {
              const foodId = parts[0];
              const rawTitle = parts[1].trim();
              const price = extractPriceFromFoodString(rawTitle);
              foods.push({
                foodId,
                rawTitle,
                price
              });
            }
          });
        }
        foodCache[cacheKey] = foods;
        return foods;
      } catch (err) {
        console.error('Fetch foods error:', err);
        return [];
      }
    }

    // Create the fast food wizard DOM
    function createFoodPanel() {
      if (document.getElementById('sups-food-root')) return;

      const root = document.createElement('div');
      root.id = 'sups-food-root';

      root.innerHTML = `
        <div class="sups-floating-pill sups-food-pill" id="supsFoodLauncher" title="رزرو سریع ژتون تغذیه">
          <span class="sups-pill-icon">🍱</span>
          <span class="sups-pill-text">رزرو سریع تغذیه</span>
        </div>

        <div class="sups-food-panel" id="supsFoodPanel" style="display: none;">
          <div class="sups-food-header">
            <div class="sups-food-title-wrap">
              <span class="sups-food-title">sups shirazu</span>
              <span class="sups-credit-tag" id="supsFoodCreditTag">اعتبار: --</span>
            </div>
            <button class="sups-btn-icon" id="supsFoodCloseBtn" title="بستن / کوچک کردن">✕</button>
          </div>

          <!-- Week Navigation Header (Previous Week / Next Week) -->
          <div class="sups-week-nav-bar">
            <button type="button" class="sups-week-nav-btn" id="supsPrevWeekBtn" title="هفته قبل">هفته قبل</button>
            <span class="sups-week-range-text" id="supsWeekRangeText">هفته انتخابی</span>
            <button type="button" class="sups-week-nav-btn" id="supsNextWeekBtn" title="هفته بعد">هفته بعد</button>
          </div>

          <!-- 7-Column Grid Tabs (e.g. شنبه ۲۵, یک‌شنبه ۲۶) -->
          <div class="sups-food-days-tabs" id="supsFoodDaysTabs">
            <!-- Rendered dynamically -->
          </div>

          <div class="sups-food-day-content" id="supsFoodDayContent">
            <!-- Meal rows rendered dynamically for active day -->
          </div>

          <div class="sups-food-footer">
            <div class="sups-food-summary-box" id="supsFoodSummaryBox">
              <div class="sups-summary-row">
                <span>تعداد رزرو انتخابی:</span>
                <b id="supsSumCount">۰ وعده</b>
              </div>
              <div class="sups-summary-row">
                <span>جمع هزینه:</span>
                <b id="supsSumTotal">۰ ریال</b>
              </div>
              <div class="sups-summary-row" id="supsDeficitRow">
                <span>کسری اعتبار:</span>
                <b class="sups-deficit-val" id="supsSumDeficit">۰ ریال</b>
              </div>
            </div>

            <div class="sups-food-actions" id="supsFoodActions">
              <button class="sups-btn-submit" id="supsFinalSubmitBtn">ثبت نهایی رزروها</button>
              <button class="sups-btn-pay" id="supsPayRechargeBtn" style="display: none;">افزایش اعتبار و پرداخت</button>
              <button class="sups-btn-clear" id="supsClearSelectionsBtn" title="پاک کردن انتخاب‌ها">پاک‌سازی</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(root);

      const launcher = document.getElementById('supsFoodLauncher');
      const panel = document.getElementById('supsFoodPanel');
      const closeBtn = document.getElementById('supsFoodCloseBtn');

      launcher.addEventListener('click', () => {
        panel.style.display = 'flex';
        launcher.style.display = 'none';
        renderWizard();
      });

      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
        launcher.style.display = 'flex';
      });

      document.getElementById('supsFinalSubmitBtn').addEventListener('click', handleInstantSubmit);
      document.getElementById('supsPayRechargeBtn').addEventListener('click', handlePayAndRecharge);
      document.getElementById('supsClearSelectionsBtn').addEventListener('click', () => {
        if (confirm('تمام انتخاب‌های انجام‌شده پاک شوند؟')) {
          for (const k in selectedOrders) delete selectedOrders[k];
          saveOrders();
          renderWizard();
        }
      });

      // Next / Previous Week Navigation buttons
      document.getElementById('supsNextWeekBtn').addEventListener('click', () => {
        const nextBtn = document.getElementById('btnNextWeek');
        if (nextBtn) {
          nextBtn.click();
          setTimeout(() => {
            const days = parseWeekDays();
            activeDayIndex = findFirstModifiableDayIndex(days);
            renderWizard();
          }, 600);
        }
      });

      document.getElementById('supsPrevWeekBtn').addEventListener('click', () => {
        const prevBtn = document.getElementById('btnPrevWeek');
        if (prevBtn) {
          prevBtn.click();
          setTimeout(() => {
            const days = parseWeekDays();
            activeDayIndex = findFirstModifiableDayIndex(days);
            renderWizard();
          }, 600);
        }
      });

      // Load persistent orders and select first modifiable day
      loadSavedOrders(() => {
        const days = parseWeekDays();
        activeDayIndex = findFirstModifiableDayIndex(days);
        checkPostPaymentResume();
      });
    }

    function renderWizard() {
      const days = parseWeekDays();
      if (days.length === 0) return;

      const credit = getCurrentCredit();
      const creditTag = document.getElementById('supsFoodCreditTag');
      if (creditTag) creditTag.textContent = `موجودی: ${formatPriceRials(credit)}`;

      // Update week range label from page
      const edDesc = document.getElementById('edDesc');
      const rangeEl = document.getElementById('supsWeekRangeText');
      if (rangeEl && edDesc) {
        const match = edDesc.innerText.match(/از تاریخ\s+([^\s]+)\s+([\d/]+)\s+الی\s+تاریخ\s+([^\s]+)\s+([\d/]+)/);
        if (match) {
          rangeEl.textContent = `${englishToPersianDigits(match[2])} الی ${englishToPersianDigits(match[4])}`;
        } else {
          rangeEl.textContent = edDesc.innerText.replace('خرید ژتون از تاریخ', '').trim();
        }
      }

      // Render 7-column Grid Tabs
      const tabsContainer = document.getElementById('supsFoodDaysTabs');
      tabsContainer.innerHTML = '';
      days.forEach((day, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `sups-day-tab ${idx === activeDayIndex ? 'active' : ''}`;

        // Count selected meals for this specific day
        let dayCount = 0;
        for (let m = 0; m < 3; m++) {
          if (selectedOrders[`${day.progDate}_${m}`]) dayCount++;
        }

        btn.innerHTML = `
          <span class="day-short">${day.dayShortName}</span>
          <span class="day-num">${day.dayOfMonthPersian}</span>
          ${dayCount > 0 ? `<span class="day-badge">${englishToPersianDigits(dayCount)}</span>` : ''}
        `;
        btn.addEventListener('click', () => {
          activeDayIndex = idx;
          renderWizard();
        });
        tabsContainer.appendChild(btn);
      });

      // Render Active Day Meals
      const activeDay = days[activeDayIndex] || days[0];
      const content = document.getElementById('supsFoodDayContent');
      content.innerHTML = `
        <div class="sups-active-day-heading">
          <span>${activeDay.dayTitle}</span>
          <div class="sups-day-nav-btns">
            ${activeDayIndex > 0 ? `<button type="button" class="sups-nav-link" id="supsPrevDayBtn">روز قبل</button>` : ''}
            ${activeDayIndex < 6 ? `<button type="button" class="sups-nav-link" id="supsNextDayBtn">روز بعد</button>` : ''}
          </div>
        </div>
      `;

      const prevBtn = document.getElementById('supsPrevDayBtn');
      const nextBtn = document.getElementById('supsNextDayBtn');
      if (prevBtn) prevBtn.addEventListener('click', () => { activeDayIndex--; renderWizard(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { activeDayIndex++; renderWizard(); });

      // Check all 3 meals of the day
      const dayMealStatuses = MEALS.map(meal => getMealSlotStatus(activeDay, meal.index));
      const allUnscheduled = dayMealStatuses.every(st => st.isUnscheduled);

      // If the entire day has no meals scheduled
      if (allUnscheduled) {
        const emptyBanner = document.createElement('div');
        emptyBanner.className = 'sups-empty-day-banner';
        emptyBanner.innerHTML = '<span>امروز غذایی ندارد</span>';
        content.appendChild(emptyBanner);
        updateSummary();
        return;
      }

      // Render each meal
      MEALS.forEach((meal, mealIdx) => {
        const mealKey = `${activeDay.progDate}_${meal.index}`;
        const selected = selectedOrders[mealKey];
        const status = dayMealStatuses[mealIdx];

        // 1. Single line if meal is unscheduled ("تعریف نشده")
        if (status.isUnscheduled) {
          const row = document.createElement('div');
          row.className = 'sups-meal-single-line unscheduled';
          row.innerHTML = `
            <span class="meal-name">${meal.icon} ${meal.name}</span>
            <span class="meal-pill-tag gray">تعریف نشده</span>
          `;
          content.appendChild(row);
          return;
        }

        // 2. Single line if already reserved in SUPS portal
        if (status.isReserved) {
          const row = document.createElement('div');
          row.className = 'sups-meal-single-line reserved';
          row.innerHTML = `
            <span class="meal-name">${meal.icon} ${meal.name}</span>
            <span class="meal-pill-tag green">رزرو شده: ${status.text}</span>
          `;
          content.appendChild(row);
          return;
        }

        // 3. Single line if meal is expired (past date, or past 13:00 for tomorrow)
        if (status.isExpired) {
          const row = document.createElement('div');
          row.className = 'sups-meal-single-line expired';
          row.innerHTML = `
            <span class="meal-name">${meal.icon} ${meal.name}</span>
            <span class="meal-pill-tag red">پایان مهلت رزرو</span>
          `;
          content.appendChild(row);
          return;
        }

        // 4. Meal is open for reservation! Show interactive selection card
        const card = document.createElement('div');
        card.className = `sups-meal-card ${selected ? 'has-selection' : ''}`;

        card.innerHTML = `
          <div class="sups-meal-title-bar">
            <span class="sups-meal-title">${meal.icon} ${meal.name}</span>
            <span class="sups-meal-status-tag" id="statusTag_${mealKey}">
              ${selected ? `انتخاب: ${selected.foodName}` : 'بدون انتخاب'}
            </span>
          </div>

          <div class="sups-rest-buttons">
            ${RESTAURANTS.map(r => `
              <button type="button" class="sups-rest-btn ${(selected && selected.restaurantId === r.id) ? 'active' : ''}" data-rest="${r.id}">
                ${r.shortName}
              </button>
            `).join('')}
            <button type="button" class="sups-rest-btn sups-skip-btn ${(!selected) ? 'active' : ''}" data-skip="true">
              اسکیپ
            </button>
          </div>

          <div class="sups-food-options-box" id="foodBox_${mealKey}">
            <!-- Loaded dynamically when a restaurant is picked -->
          </div>
        `;

        content.appendChild(card);

        // Click handlers for Restaurant / Skip buttons
        const restBtns = card.querySelectorAll('.sups-rest-btn');
        restBtns.forEach(btn => {
          btn.addEventListener('click', async () => {
            const isSkip = btn.dataset.skip === 'true';
            const restId = parseInt(btn.dataset.rest, 10);

            restBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const foodBox = document.getElementById(`foodBox_${mealKey}`);
            const statusTag = document.getElementById(`statusTag_${mealKey}`);

            if (isSkip) {
              delete selectedOrders[mealKey];
              saveOrders();
              foodBox.innerHTML = '';
              statusTag.textContent = 'اسکیپ شده';
              card.classList.remove('has-selection');
              updateSummary();
              renderWizard();
              return;
            }

            // Load foods for selected restaurant
            foodBox.innerHTML = '<div class="sups-loading-text">در حال بارگذاری غذاها...</div>';
            const foods = await fetchFoods(activeDay.progDate, restId, meal.index);

            if (!foods || foods.length === 0) {
              foodBox.innerHTML = '<div class="sups-empty-food">غذایی در این سلف ارائه نشده است.</div>';
              return;
            }

            foodBox.innerHTML = '';
            foods.forEach(f => {
              const foodRow = document.createElement('div');
              const isPicked = selected && selected.foodId === f.foodId;
              foodRow.className = `sups-food-row ${isPicked ? 'selected' : ''}`;
              foodRow.innerHTML = `
                <span class="food-name">${f.rawTitle}</span>
                <span class="food-check">${isPicked ? '✓' : '+'}</span>
              `;
              foodRow.addEventListener('click', () => {
                selectedOrders[mealKey] = {
                  restaurantId: restId,
                  foodId: f.foodId,
                  foodName: f.rawTitle,
                  price: f.price,
                  progDate: activeDay.progDate,
                  dayName: activeDay.dayName,
                  mealName: meal.name,
                  mealIndex: meal.index
                };
                saveOrders();
                card.classList.add('has-selection');
                statusTag.textContent = `${f.rawTitle}`;
                renderWizard();
              });
              foodBox.appendChild(foodRow);
            });
          });
        });

        // If there's already a selected order with a restaurant, render its foods
        if (selected && selected.restaurantId) {
          const foodBox = document.getElementById(`foodBox_${mealKey}`);
          fetchFoods(activeDay.progDate, selected.restaurantId, meal.index).then(foods => {
            foodBox.innerHTML = '';
            foods.forEach(f => {
              const foodRow = document.createElement('div');
              const isPicked = selected.foodId === f.foodId;
              foodRow.className = `sups-food-row ${isPicked ? 'selected' : ''}`;
              foodRow.innerHTML = `
                <span class="food-name">${f.rawTitle}</span>
                <span class="food-check">${isPicked ? '✓' : '+'}</span>
              `;
              foodRow.addEventListener('click', () => {
                selectedOrders[mealKey] = {
                  restaurantId: selected.restaurantId,
                  foodId: f.foodId,
                  foodName: f.rawTitle,
                  price: f.price,
                  progDate: activeDay.progDate,
                  dayName: activeDay.dayName,
                  mealName: meal.name,
                  mealIndex: meal.index
                };
                saveOrders();
                renderWizard();
              });
              foodBox.appendChild(foodRow);
            });
          });
        }
      });

      updateSummary();
    }

    function updateSummary() {
      const orders = Object.values(selectedOrders);
      let totalCost = 0;
      orders.forEach(o => { totalCost += (o.price || 0); });

      const currentCredit = getCurrentCredit();
      const deficit = Math.max(0, totalCost - currentCredit);

      const countEl = document.getElementById('supsSumCount');
      const totalEl = document.getElementById('supsSumTotal');
      const deficitEl = document.getElementById('supsSumDeficit');
      const submitBtn = document.getElementById('supsFinalSubmitBtn');
      const payBtn = document.getElementById('supsPayRechargeBtn');

      if (countEl) countEl.textContent = `${englishToPersianDigits(orders.length)} وعده`;
      if (totalEl) totalEl.textContent = formatPriceRials(totalCost);
      if (deficitEl) deficitEl.textContent = formatPriceRials(deficit);

      if (deficit > 0) {
        const minPkg = getMinimumRechargePackage(deficit);
        submitBtn.style.display = 'none';
        payBtn.style.display = 'block';
        payBtn.textContent = `پرداخت و افزایش اعتبار (حداقل ${formatPriceRials(minPkg)})`;
      } else {
        payBtn.style.display = 'none';
        submitBtn.style.display = 'block';
        submitBtn.textContent = orders.length > 0 ? `ثبت نهایی ${englishToPersianDigits(orders.length)} رزرو` : 'ثبت نهایی رزروها';
      }
    }

    // Direct submit when credit is already sufficient
    async function handleInstantSubmit() {
      const orders = Object.values(selectedOrders);
      if (orders.length === 0) {
        alert('هیچ وعده‌ای برای رزرو انتخاب نشده است.');
        return;
      }

      if (!confirm(`آیا از ثبت ${orders.length} وعده انتخابی مطمئن هستید؟`)) {
        return;
      }

      await executeBatchOrders(orders);
    }

    // Save pending orders and launch SUPS native AddCredit portal
    function handlePayAndRecharge() {
      const orders = Object.values(selectedOrders);
      if (orders.length === 0) {
        alert('هیچ وعده‌ای برای رزرو انتخاب نشده است.');
        return;
      }

      // Mark that we are waiting for payment and persist selections
      chrome.storage.local.set({
        sups_saved_orders: selectedOrders,
        sups_pending_orders: orders,
        sups_waiting_payment: true,
        sups_order_timestamp: Date.now()
      }, () => {
        // Trigger site's native AddCredit function
        const addCreditBtn = document.getElementById('btnAddCredit');
        if (addCreditBtn) {
          addCreditBtn.click();
        } else if (typeof window.Perform === 'function') {
          window.Perform('AddCredit');
        } else {
          alert('انتخاب‌ها ذخیره شدند. لطفاً روی دکمه افزایش اعتبار کلیک نمایید.');
        }
      });
    }

    // Check if user came back from payment
    function checkPostPaymentResume() {
      chrome.storage.local.get(['sups_pending_orders', 'sups_waiting_payment', 'sups_order_timestamp', 'sups_saved_orders'], (data) => {
        if (!data || !data.sups_waiting_payment || !data.sups_pending_orders || data.sups_pending_orders.length === 0) {
          return;
        }

        const ageMs = Date.now() - (data.sups_order_timestamp || 0);
        // Valid if within 2 hours
        if (ageMs > 2 * 60 * 60 * 1000) {
          chrome.storage.local.remove(['sups_pending_orders', 'sups_waiting_payment', 'sups_order_timestamp']);
          return;
        }

        const orders = data.sups_pending_orders;
        showPostPaymentModal(orders);
      });
    }

    function showPostPaymentModal(orders) {
      const modal = document.createElement('div');
      modal.className = 'sups-modal-overlay';
      modal.innerHTML = `
        <div class="sups-modal-card">
          <div class="sups-modal-header">
            <h3>💳 رزرو خودکار پس از پرداخت</h3>
          </div>
          <div class="sups-modal-body">
            <p>تعداد <b>${englishToPersianDigits(orders.length)}</b> وعده از قبل انتخاب‌شده آماده ثبت نهایی است.</p>
            <p>موجودی فعلی: <b>${formatPriceRials(getCurrentCredit())}</b></p>
            <p>آیا مایلید تمام رزروها به‌صورت خودکار ثبت شوند؟</p>
          </div>
          <div class="sups-modal-actions">
            <button class="sups-btn-submit" id="supsModalAutoRunBtn">بله، ثبت خودکار همه</button>
            <button class="sups-btn-cancel" id="supsModalCancelBtn">انصراف و حذف</button>
          </div>
          <div class="sups-modal-progress" id="supsModalProgress" style="display: none;"></div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('supsModalCancelBtn').addEventListener('click', () => {
        chrome.storage.local.remove(['sups_pending_orders', 'sups_waiting_payment', 'sups_order_timestamp']);
        modal.remove();
      });

      document.getElementById('supsModalAutoRunBtn').addEventListener('click', async () => {
        const btnRun = document.getElementById('supsModalAutoRunBtn');
        const btnCancel = document.getElementById('supsModalCancelBtn');
        const progDiv = document.getElementById('supsModalProgress');
        btnRun.style.display = 'none';
        btnCancel.style.display = 'none';
        progDiv.style.display = 'block';

        await executeBatchOrders(orders, (msg) => {
          progDiv.textContent = msg;
        });

        // Clear state
        chrome.storage.local.remove(['sups_pending_orders', 'sups_waiting_payment', 'sups_order_timestamp', 'sups_saved_orders']);
        for (const k in selectedOrders) delete selectedOrders[k];

        progDiv.textContent = 'رزروها با موفقیت انجام شد! در حال بارگذاری مجدد...';
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      });
    }

    async function executeBatchOrders(orders, onProgress) {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < orders.length; i++) {
        const item = orders[i];
        const statusMsg = `در حال ثبت وعده ${englishToPersianDigits(i + 1)} از ${englishToPersianDigits(orders.length)}: ${item.dayName} - ${item.mealName}...`;
        if (onProgress) onProgress(statusMsg);

        try {
          const buyUrl = `/SfxWeb/Script/AjaxMember.aspx?Act=BuyChipsWeek&Restaurant=${item.restaurantId}&ProgDate=${item.progDate}&Meal=${item.mealIndex}&Food=${item.foodId}&Dessert=&Start=&End=&Rand=${Math.random()}`;
          const res = await fetch(buyUrl, {
            method: 'GET',
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
          });
          const ret = await res.text();
          const spl = ret.split('*$');

          if (spl[0] === 'ok') {
            successCount++;
            if (spl[1]) {
              const remain = spl[1].split('@%@')[0];
              const lblCredit = document.getElementById('lblCredit');
              if (lblCredit && remain) lblCredit.innerText = remain;
            }
          } else {
            failCount++;
            console.warn('Booking rejected:', spl[3] || ret);
          }
        } catch (e) {
          failCount++;
          console.error('Order network error:', e);
        }

        // Small delay between requests to prevent server throttle
        await new Promise(r => setTimeout(r, 350));
      }

      playSuccessChime();
      chrome.runtime.sendMessage({
        action: 'notify',
        title: '🍱 رزرو ژتون تغذیه پایان یافت',
        body: `${successCount} وعده با موفقیت ثبت شد.`
      });

      // Clear orders that were successfully reserved
      chrome.storage.local.remove(['sups_pending_orders', 'sups_waiting_payment', 'sups_order_timestamp', 'sups_saved_orders']);
      for (const k in selectedOrders) delete selectedOrders[k];

      if (!onProgress) {
        alert(`عملیات رزرو به پایان رسید:\nموفق: ${successCount}\nناموفق: ${failCount}`);
        window.location.reload();
      }
    }

    createFoodPanel();
  }

  // =============================================================
  // Initialization Router
  // =============================================================
  function initRouter() {
    if (isPoolPage) {
      initPoolBot();
    } else if (isFoodPage) {
      initFoodBot();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter);
  } else {
    initRouter();
  }
})();
