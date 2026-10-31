// =========================================================================
// 🏫 نبراس — التسكين والتوزيع الآلي للفصول (1.2.94)
//
// تدفق العملية: (1) قراءة ملف Excel وفحصه (2) قراءة طلاب الصفوف المعنيّة من الموقع للقراءة فقط (3) بناء خطة النقل وفحصها
// (modules/assign_plan.js: صف/فصل غير موجود، طالب في صف آخر، تكرار، سعة 50) (4) معاينة أو تأكيد (5) نقل مجموعة مجموعة
// (6) قراءة الفصول من جديد ومطابقة كل طالب بما طُلب (7) تقرير نتائج Excel لكل طالب.
// منطق الصفحة (اختيار القوائم وتعليم الصفوف والحفظ) هو نفسه الذي أُثبتت صحته في إصلاحات 1–5 ولم يُغيَّر؛ أُضيفت حوله الخطة والتحقق.
// =========================================================================

(function () {
    'use strict';

    if (window.__NeprasAutoAssign_module_loaded__) {
        console.log('[نبراس] موديل التسكين محمل مسبقاً.');
        return;
    }
    window.__NeprasAutoAssign_module_loaded__ = true;

    /////////////////////////////
    // 🎯 SELECTORS
    /////////////////////////////
    const SELECTORS = {
        table: '#DataTables_Table_0',
        tableBody: '#DataTables_Table_0 tbody',
        tableRows: '#DataTables_Table_0 tbody tr',
        tableProcessing: '#DataTables_Table_0_processing',
        tableInfo: '#DataTables_Table_0_info',
        tableLength: "select[name*='_length'], #DataTables_Table_0_length select",
        tableEmptyCell: '#DataTables_Table_0 td.dataTables_empty',
        paginateFirst: '#DataTables_Table_0_paginate .first',
        paginateNext: '#DataTables_Table_0_paginate .next',
        levelControl: "select[formcontrolname='levelControl'], select[id*='level'], select[name*='level']",
        classControl: "select[formcontrolname='classControl'], select[id*='class'], select[name*='class']",
        targetClassControl: "select[formcontrolname='targetclassControl']",
        rowCheckbox: "input[type='checkbox']",
        saveButton: 'div.buttonBlock a.btn-success, button.btn-success, a.btn-success',
        alertBoxes: '.alert, .swal2-popup, .toast, .notification',
        successAlert: 'div.alert-success, .swal2-success-display, .toast-success',
        errorAlert: 'div.alert-danger, .swal2-error, .toast-error'
    };

    const MAX_PAGINATION_PAGES = 300;

    /////////////////////////////
    // ⚙️ CONFIG
    /////////////////////////////
    const CONFIG = {
        // autoassign-fix-4: تمت مضاعفتها تقريبًا لتطابق نسخة مستقلة أثبتّ أنها
        // تعمل فعليًا على الموقع الحي — النسخة الموحّدة أثقل بكثير (عشرات
        // الآلاف من الأسطر وموديولات إضافية محمّلة على نفس الصفحة)، فمن
        // المرجّح أن دورة Angular لاكتشاف التغييرات تحتاج وقتاً أطول لتستقر
        // من النسخة المستقلة الأخف قبل أن نُكمل ونعتمد على القيمة المضبوطة.
        WAIT_AFTER_DROPDOWN_MS: 700,
        WAIT_AFTER_PAGE_LOAD_MS: 800,
        WAIT_AFTER_SAVE_MS: 1200,
        TIMEOUT_SAVE_MS: 30000,
        TIMEOUT_TABLE_LOAD_MS: 45000,
        TIMEOUT_DROPDOWN_LOAD_MS: 25000,
        TOAST_DISPLAY_MS: 5000,
        SAVE_RETRY_COUNT: 2,
        SAVE_RETRY_DELAY_MS: 1200,
        LOG_MAX_LINES: 1000,
        studentCodeColumnIndex: 1
    };

    const SCRIPT_VERSION = '2.0';

    /////////////////////////////
    // 📦 STATE
    /////////////////////////////
    let headers = { code: '', targetClass: '', level: '' };
    let excelRows = [];
    let excelHeaders = [];
    let lastRun = null; // { plan, issues, exec: Map, verify, preview } لآخر معاينة أو تنفيذ (مصدر تقرير النتائج)
    let busy = false;
    let stopRequested = false;
    let pauseRequested = false;
    let stats = { totalPlanned: 0, processed: 0, successes: 0, errors: 0, startTime: null };

    /////////////////////////////
    // 🛠️ UTILITIES & NORMALIZATION
    /////////////////////////////
    function now() { return new Date().toLocaleTimeString('ar-EG'); }
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    function logToConsole(...args) { console.log('[نبراس - تسكين]', ...args); }

    // تحويل الأرقام العربية إلى إنجليزية وتنظيف كود الطالب
    function normalizeStudentCode(code) {
        if (code == null) return '';
        return NeprasEgypt.toLatinDigits(code) // الأرقام من modules/egypt_ids.js (مصدر واحد)
            .replace(/\.0+$/, '')
            .replace(/\s+/g, '')
            .trim();
    }

    // نفس التوحيد المستعمل في مطابقة الخطة (يشمل الأرقام العربية)، فيتفق اختيار القوائم في الصفحة مع ما حسبته الخطة.
    function normText(text) {
        return window.NeprasAssignPlan ? window.NeprasAssignPlan.normText(text) : String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function isGlobalStopRequested() {
        return stopRequested || window.__NEPRAS_STOP_ALL_REQUESTED__ === true;
    }

    function handleError(err, context = '') {
        console.error('[نبراس - تسكين خطأ]', context, err);
        addLog(`❌ خطأ ${context ? `(${context})` : ''}: ${err && err.message ? err.message : err}`, 'error');
        stats.errors++;
        updateStatsUI();
        try {
            const m = window.NeprasMessages.errorToMessage(err, context);
            window.NeprasUI.toast({
                kind: 'error', title: m.title, message: m.message, duration: 0, id: 'aa-error',
                actions: [{ label: 'نسخ بيانات المشكلة', icon: 'copy', keepOpen: true, onClick: () => window.NeprasUI.copyText(window.NeprasUI.diagnostics(m.technical)) }]
            });
        } catch (_) {
            showToast(`تعذر إكمال العملية ${context || ''}`, 'error', { persistent: true });
        }
    }

    /////////////////////////////
    // 🔔 TOASTS (تكامل مع نبراس)
    /////////////////////////////
    // الإشعارات تُرسم عبر نظام الرسائل الموحّد (ui/nepras-ui.js): تختفي تلقائيًا، وتتراكم حتى ثلاث، والخطأ يبقى.
    function showToast(message, type = 'info', options = {}) {
        const L = window.NeprasLegacy;
        if (!L) return null;
        return L.notice(message, type === 'loading' ? 'info' : type, undefined, { persistent: !!options.persistent });
    }

    /////////////////////////////
    // 🎨 اللوحة (NeprasPanel): هيكل موحّد مبني على نظام الأزرار والألوان نفسه (المرحلة 5).
    // كل معرّفات العناصر (aa-*, col-*, excelFileAA) كما كانت — بقية الملف يقرأها بلا تغيير.
    /////////////////////////////
    function h(tag, cls, attrs, kids) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (attrs) for (const [k, v] of Object.entries(attrs)) {
            if (v === false || v == null) continue;
            if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
        }
        if (kids) for (const c of [].concat(kids)) if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        return n;
    }

    function field(id, label) {
        const sel = h('select', 'n-input', { id, disabled: true });
        sel.appendChild(h('option', null, { text: 'ارفع الملف أولاً' }));
        return h('div', 'n-panel__field', null, [h('label', null, { for: id, text: label }), sel]);
    }

    function checkRow(id, label, checked) {
        const box = h('input', null, { type: 'checkbox', id });
        if (checked) box.checked = true;
        const lab = h('label', 'n-panel__check', null, [box, h('span', null, { text: label })]);
        return lab;
    }

    let neprasPanel = null;

    function buildUI() {
        if (neprasPanel) { neprasPanel.show(); return; }

        neprasPanel = window.NeprasPanel.create({
            id: 'nepras-aa-panel', icon: 'school',
            title: (globalThis.NeprasBrand?.tools?.autoAssign || 'التسكين والتوزيع الآلي للفصول'),
            subtitle: `إصدار ${(globalThis.chrome?.runtime?.getManifest?.() || {}).version || SCRIPT_VERSION}`,   // إصدار الإضافة لا رقم المحرك الداخلي
            onMinimize: (on) => { const btn = document.getElementById('aa-minimize'); if (btn) window.NeprasButtons.setIcon(btn, on ? 'expand' : 'chevron-down'); },
            actions: [
                { id: 'aa-export', icon: 'sheet', label: 'تنزيل تقرير النتائج Excel', onClick: () => exportResultsReport() },
                { id: 'aa-export-only', icon: 'download', label: 'تنزيل قوائم فصول المدرسة Excel (عامودين)', onClick: () => exportClassListsOnly() },
                { id: 'aa-export-log', icon: 'file-text', label: 'تصدير سجل العملية', onClick: () => exportOperationLog() },
                { id: 'aa-reset', icon: 'refresh', label: 'إعادة تعيين', onClick: () => resetUI() },
                { id: 'aa-minimize', icon: 'chevron-down', label: 'تصغير/تكبير', onClick: () => toggleMinimize() },
                { id: 'aa-close', icon: 'close', label: 'إغلاق', onClick: () => neprasPanel.hide() },
            ],
        });
        // أزرار التصدير وإعادة التعيين تظهر فقط بعد وجود عملية أو تقرير (كما كانت سلوكًا)؛
        // hidden لا style.display كي لا تبقى أي أنماط inline داخل اللوحة.
        neprasPanel.actionButtons['aa-export'].hidden = true;
        neprasPanel.actionButtons['aa-reset'].hidden = true;

        const body = neprasPanel.body;
        body.textContent = '';

        const fileInput = h('input', 'n-input', { id: 'excelFileAA', type: 'file', accept: '.xlsx,.xls' });
        body.appendChild(h('div', 'n-panel__row', null, [fileInput]));

        body.appendChild(h('div', 'n-panel__grid3', null, [
            field('col-student', 'عمود كود الطالب'),
            field('col-class', 'عمود الفصل الهدف'),
            field('col-level', 'عمود الصف'),
        ]));
        body.appendChild(h('div', 'n-panel__hint', { id: 'aa-file-summary' }));

        const startBtn = h('button', 'n-btn n-btn--primary n-btn--block', { id: 'aa-start', type: 'button', disabled: true }, [
            (() => { const i = document.createElement('i'); i.setAttribute('data-icon', 'play'); return i; })(),
            h('span', 'n-btn__label', { text: 'بدء التسكين' }),
        ]);
        const previewBtn = h('button', 'n-btn n-btn--secondary n-btn--block', { id: 'aa-preview', type: 'button', disabled: true }, [
            (() => { const i = document.createElement('i'); i.setAttribute('data-icon', 'search'); return i; })(),
            h('span', 'n-btn__label', { text: 'معاينة قبل التنفيذ (لا يتغير شيء)' }),
        ]);
        const pauseBtn = h('button', 'n-btn n-btn--secondary', { id: 'aa-pause', type: 'button', hidden: true }, [
            (() => { const i = document.createElement('i'); i.setAttribute('data-icon', 'stop'); return i; })(),
            h('span', 'n-btn__label', { text: 'إيقاف مؤقت' }),
        ]);
        const stopBtn = h('button', 'n-btn n-btn--danger', { id: 'aa-stop', type: 'button', hidden: true }, [
            (() => { const i = document.createElement('i'); i.setAttribute('data-icon', 'stop'); return i; })(),
            h('span', 'n-btn__label', { text: 'إيقاف نهائي' }),
        ]);
        body.appendChild(h('div', 'n-panel__row', null, [previewBtn, startBtn]));
        body.appendChild(h('div', 'n-panel__row', null, [pauseBtn, stopBtn]));

        body.appendChild(h('div', 'n-panel__box', null, [
            checkRow('auto-export-checkbox', 'تنزيل تقرير النتائج تلقائيًا بعد الانتهاء من التسكين', true),
            checkRow('auto-export-lists-checkbox', 'تنزيل قوائم الفصول المحدّثة (عامودين) بعد الانتهاء', false),
        ]));

        const progHead = h('div', 'n-panel__progress-head', null, [
            h('span', null, { id: 'aa-progress-text', text: 'جاهز — ارفع ملف التوزيع ثم عاين قبل التنفيذ' }),
            h('b', null, { id: 'aa-progress-percent', text: '0%' }),
        ]);
        const bar = h('div', 'n-panel__bar', null, [h('i', null, { id: 'aa-progress-bar' })]);
        body.append(progHead, bar);

        const statBox = (id, label, cls) => h('div', cls, null, [h('span', null, { text: label + ': ' }), h('b', null, { id, text: '0' })]);
        body.appendChild(h('div', 'n-panel__stats', null, [
            statBox('aa-stat-total', 'المخطط', 'total'), statBox('aa-stat-processed', 'المعالج', 'processed'),
            statBox('aa-stat-success', 'النجاح', 'success'), statBox('aa-stat-error', 'الأخطاء', 'error'),
        ]));

        const logViewer = h('div', 'n-panel__log', { id: 'aa-logviewer' }, [
            h('div', 'n-panel__log-head', null, [h('span', null, { text: 'سجل العمليات' }), h('span', null, { text: `المحرك ${SCRIPT_VERSION}` })]),
        ]);
        body.appendChild(logViewer);

        window.NeprasButtons.hydrate(neprasPanel.root);

        fileInput.addEventListener('change', handleFile);
        ['col-student', 'col-class', 'col-level'].forEach(id => document.getElementById(id).addEventListener('change', refreshFileSummary));
        startBtn.addEventListener('click', () => runFlow(false));
        previewBtn.addEventListener('click', () => runFlow(true));
        pauseBtn.addEventListener('click', togglePause);
        stopBtn.addEventListener('click', requestStop);

        neprasPanel.show();
        addLog('الواجهة جاهزة — ارفع ملف الإكسيل لاختيار الأعمدة ثم اضغط معاينة', 'success');
    }

    function requestStop() {
        if (!busy) return;
        stopRequested = true;
        pauseRequested = false;
        addLog('🛑 طلب إيقاف نهائي للعملية', 'warn');
        showToast('🛑 تم طلب الإيقاف. سيتم التوقف فور انتهاء العملية الحالية.', 'warning');
    }

    // السحب صار جزءًا من NeprasPanel نفسه (ui/panel.js) — لا حاجة لنسخة محلية هنا.

    /////////////////////////////
    // 📝 LOGS & STATS
    /////////////////////////////
    function addLog(text, level = 'info') {
        const viewer = document.getElementById('aa-logviewer');
        if (!viewer) return;
        const line = document.createElement('div');
        line.className = 'nepras-aa-log-line ' + (level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'success' ? 'success' : 'info');
        const timeEl = document.createElement('small');
        timeEl.className = 'nepras-aa-log-time';
        timeEl.textContent = now();
        line.appendChild(timeEl);
        line.appendChild(document.createTextNode(' — ' + text));
        viewer.appendChild(line);
        while (viewer.querySelectorAll('.nepras-aa-log-line').length > CONFIG.LOG_MAX_LINES) {
            const first = viewer.querySelector('.nepras-aa-log-line');
            if (first) first.remove(); else break;
        }
        viewer.scrollTop = viewer.scrollHeight;
        logToConsole(text);
    }

    function updateStatsUI() {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setVal('aa-stat-total', stats.totalPlanned || 0);
        setVal('aa-stat-processed', stats.processed || 0);
        setVal('aa-stat-success', stats.successes || 0);
        setVal('aa-stat-error', stats.errors || 0);
    }

    function setProgress(percent, text) {
        const bar = document.getElementById('aa-progress-bar');
        const txt = document.getElementById('aa-progress-text');
        const pctEl = document.getElementById('aa-progress-percent');
        const safe = Math.max(0, Math.min(100, Math.round(percent)));
        if (bar) bar.style.width = safe + '%';
        if (pctEl) pctEl.innerText = safe + '%';
        if (txt && text) txt.innerText = text;
    }

    /////////////////////////////
    // ⚡ HIGH-PERFORMANCE DATATABLES
    /////////////////////////////
    // تحسين سرعة التصفح عبر رفع سعة الصفحة لأقصى حد متاح (50 أو 100) بدلاً من 10
    async function optimizeDataTablesPageSize() {
        try {
            const lengthSelect = document.querySelector(SELECTORS.tableLength);
            if (lengthSelect && lengthSelect.options.length > 0) {
                const opts = Array.from(lengthSelect.options);
                const target = opts.find(o => o.value === '100') ||
                               opts.find(o => o.value === '50') ||
                               opts.find(o => o.value === '-1') ||
                               opts[opts.length - 1];
                if (target && lengthSelect.value !== target.value) {
                    lengthSelect.value = target.value;
                    lengthSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await wait(300);
                    await waitForStudentTableLoad();
                    await waitForTableStable();
                }
            }
        } catch (_) {}
    }

    async function waitForStudentTableLoad() {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            let lastRowCount = -1;
            let stableCount = 0;
            const interval = setInterval(() => {
                if (isGlobalStopRequested()) {
                    clearInterval(interval);
                    return resolve(false);
                }
                try {
                    const processingDiv = document.querySelector(SELECTORS.tableProcessing);
                    const tableBody = document.querySelector(SELECTORS.tableBody);
                    const infoDiv = document.querySelector(SELECTORS.tableInfo);
                    const isLoading = processingDiv && (processingDiv.style.display !== 'none' || window.getComputedStyle(processingDiv).display !== 'none');
                    const hasRows = tableBody && tableBody.rows.length > 0;
                    const isEmptyExplicit = infoDiv && infoDiv.innerText && infoDiv.innerText.includes('0 to 0 of 0');

                    if (isLoading) {
                        lastRowCount = -1;
                        stableCount = 0;
                        return;
                    }

                    if (hasRows || isEmptyExplicit) {
                        const currentCount = hasRows ? tableBody.rows.length : 0;
                        if (currentCount === lastRowCount && currentCount > 0) {
                            stableCount++;
                            if (stableCount >= 2) {
                                clearInterval(interval);
                                resolve(true);
                                return;
                            }
                        } else {
                            lastRowCount = currentCount;
                            stableCount = 0;
                        }
                    } else {
                        lastRowCount = -1;
                        stableCount = 0;
                    }

                    if (Date.now() - start > CONFIG.TIMEOUT_TABLE_LOAD_MS) {
                        clearInterval(interval);
                        resolve(false);
                    }
                } catch (e) {
                    clearInterval(interval);
                    reject(e);
                }
            }, 100);
        });
    }

    async function waitForTableStable(maxChecks = 8, stableCount = 2) {
        return new Promise((resolve) => {
            let lastHash = '';
            let stableHits = 0;
            let checks = 0;

            const interval = setInterval(() => {
                if (isGlobalStopRequested()) {
                    clearInterval(interval);
                    return resolve(true);
                }
                checks++;
                try {
                    const rows = document.querySelectorAll(SELECTORS.tableRows);
                    const currentHash = Array.from(rows).map(r => r.innerText).join('|');
                    if (currentHash === lastHash && currentHash.length > 0) {
                        stableHits++;
                        if (stableHits >= stableCount) {
                            clearInterval(interval);
                            resolve(true);
                            return;
                        }
                    } else {
                        lastHash = currentHash;
                        stableHits = 0;
                    }

                    if (checks >= maxChecks) {
                        clearInterval(interval);
                        resolve(true);
                    }
                } catch (_) {
                    clearInterval(interval);
                    resolve(true);
                }
            }, 120);
        });
    }

    /////////////////////////////
    // 📂 EXCEL FILE HANDLING
    /////////////////////////////
    async function handleFile(e) {
        try {
            const file = e.target.files[0];
            if (!file) return;

            try {
                await neprasEnsureLib('xlsx');
            } catch (_) {
                showToast('⚠️ تعذر تحميل مكتبة Excel', 'warning');
                return;
            }

            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            excelRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (!excelRows.length) {
                showToast('⚠️ الملف المرفوع فارغ', 'warning');
                return;
            }

            excelHeaders = Object.keys(excelRows[0]);
            const detected = planApi().detectColumns(excelHeaders);
            populateDropdowns(excelHeaders, detected);

            addLog(`✅ تم قراءة ${excelRows.length} صف من ملف Excel (${sheetName})`, 'success');
            if (workbook.SheetNames.length > 1) addLog(`ℹ️ في الملف ${workbook.SheetNames.length} أوراق: تُقرأ الورقة الأولى فقط (${sheetName})`, 'warn');
            detected.ambiguous.forEach(a => addLog(`⚠️ أكثر من عمود يصلح لـ«${ROLE_LABEL[a.role]}» (${a.candidates.join('، ')}): تأكد من العمود المختار`, 'warn'));
            ['code', 'targetClass', 'level'].filter(r => !detected[r]).forEach(r => addLog(`⚠️ لم يُعرف عمود «${ROLE_LABEL[r]}» تلقائيًا: اخترْه من القائمة`, 'warn'));
            showToast(`✅ تمت قراءة ${excelRows.length} صف من الملف`, 'success');
            refreshFileSummary();
        } catch (err) {
            handleError(err, 'handleFile');
        }
    }

    const ROLE_LABEL = { code: 'كود الطالب', targetClass: 'الفصل الهدف', level: 'الصف' };

    // خيارات الأعمدة بعناصر DOM (لا innerHTML) والمكتشف تلقائيًا محدد؛ ما لم يُكتشف يبقى على «اختر العمود» ليختاره المستخدم.
    function populateDropdowns(hdrs, detected) {
        const fill = (id, chosen) => {
            const select = document.getElementById(id);
            if (!select) return;
            select.textContent = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'اختر العمود';
            select.appendChild(placeholder);
            hdrs.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            });
            select.value = chosen && hdrs.includes(chosen) ? chosen : '';
            select.disabled = false;
        };
        fill('col-student', detected.code);
        fill('col-class', detected.targetClass);
        fill('col-level', detected.level);
    }

    /////////////////////////////
    // 🌐 DROPDOWN & SELECTION ENGINE
    /////////////////////////////
    async function waitForDropdownPopulation(selector, timeout = CONFIG.TIMEOUT_DROPDOWN_LOAD_MS) {
        return new Promise((resolve) => {
            const start = Date.now();
            const interval = setInterval(() => {
                if (isGlobalStopRequested()) { clearInterval(interval); return resolve(true); }
                const selectElement = document.querySelector(selector);
                if (selectElement && selectElement.options.length > 1) {
                    clearInterval(interval);
                    resolve(true);
                    return;
                }
                if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 100);
        });
    }

    // autoassign-fix-5: معامل اختياري { force } — يعيد إطلاق حدث change حتى لو كانت القيمة
    // الظاهرة مطابقة أصلًا. يُستخدم فقط عند إعادة بناء عرض الفصل الأصلي بعد الحفظ (انظر
    // restoreSourceView)، لأن الموقع قد يُفرّغ الجدول دون أن تتغير القيمة الظاهرة في القائمة.
    function selectDropdownValue(selector, value, opts = {}) {
        const force = !!(opts && opts.force);
        return new Promise((resolve, reject) => {
            try {
                // autoassign-fix-3: إن وُجد أكثر من عنصر مطابق لنفس الـ selector (شائع في
                // تخطيطات Bootstrap المتجاوبة التي تكرر نفس formcontrolname لنسخة
                // موبايل مخفية بجانب نسخة الديسكتوب)، نفضّل العنصر الظاهر فعليًا على
                // الشاشة بدل أول عنصر في ترتيب الـ DOM — التعامل مع عنصر مخفي يفسّر
                // بالضبط سبب بقاء الحقل الحقيقي على "ng-pristine" رغم أن الكود يعتقد
                // أنه اختار بنجاح.
                const candidates = Array.from(document.querySelectorAll(selector));
                const selectElement = candidates.find(el => el.offsetParent !== null) || candidates[0];
                if (!selectElement) return resolve(false);

                const opt = Array.from(selectElement.options).find(o =>
                    o.value == value || normText(o.text) === normText(value) || normText(o.value) === normText(value)
                );

                if (!opt) return resolve(false);

                if (!force && selectElement.value == opt.value) {
                    return resolve(true);
                }

                // autoassign-fix-4: رجعنا لنفس آلية التفاعل الموجودة بالضبط في النسخة
                // المستقلة المؤكَّد نجاحها على الموقع الحي (value + change فقط، بلا
                // focus/mousedown/blur) — تلك الإضافات في المحاولة السابقة كانت تخمينًا
                // غير مثبت، وأبقاؤها بلا دليل يزيد فرص كسر آلية أثبتت أنها تعمل فعلاً.
                opt.selected = true;
                selectElement.value = opt.value;
                selectElement.dispatchEvent(new Event('change', { bubbles: true }));

                setTimeout(() => {
                    // autoassign-fix-2: لا نفترض النجاح لمجرد أننا أطلقنا الحدث — هذا
                    // بالضبط كان الخلل: الدالة كانت تُرجع true بشرط وجود <option> مطابق
                    // في القائمة، بصرف النظر عن كون القيمة "ثبتت" فعليًا على عنصر
                    // الصفحة الحقيقي أم لا. نتحقق الآن من القيمة الفعلية بعد الانتظار.
                    // autoassign-fix-4: مدة الانتظار هنا رُفعت إلى 1200ms لتطابق
                    // النسخة المستقلة المؤكَّدة (كانت 600ms) — الفارق الحقيقي بين
                    // النسختين في المقارنة المباشرة كان التوقيت بالدرجة الأولى، لا آلية
                    // إطلاق الحدث نفسها.
                    resolve(selectElement.value == opt.value);
                }, 1200);
            } catch (e) {
                reject(e);
            }
        });
    }

    // autoassign-fix-2: يتحقق أيضًا من عدم ظهور رسالة "حقل مطلوب" بجوار الحقل —
    // بعض النماذج تُبقي القيمة الظاهرة فارغة وتُعلّم الحقل كغير صالح حتى لو
    // قَبِل الـ DOM قيمة value برمجيًا، وهذا يطابق تمامًا ما ظهر في اللقطة
    // (القائمة العليا "الفصل المراد تسكينه" بقيت على "اختر--" مع علامة "حقل مطلوب").
    // autoassign-fix-3: يفحص العنصر الظاهر فعليًا (نفس منطق selectDropdownValue)
    // ويتحقق من عدة مستويات آباء لأن رسالة "حقل مطلوب" الحقيقية تظهر كـ
    // <div class="validateBox"> شقيقة للـ select داخل حاوية Bootstrap (مثل
    // col-lg-4) لا تحمل أي من أسماء الكلاسات العامة المفترضة سابقًا.
    function hasRequiredFieldWarning(selector) {
        try {
            const candidates = Array.from(document.querySelectorAll(selector));
            const el = candidates.find(e => e.offsetParent !== null) || candidates[0];
            if (!el) return false;
            let container = el.parentElement;
            for (let i = 0; i < 4 && container; i++) {
                if (container.innerText && container.innerText.includes('حقل مطلوب')) return true;
                container = container.parentElement;
            }
            return false;
        } catch (_) {
            return false;
        }
    }

    // autoassign-fix-2: يعيد المحاولة عدة مرات مع تحقق فعلي بعد كل محاولة، بدل
    // الاكتفاء بمحاولة واحدة والافتراض أنها نجحت — هذا هو الإصلاح الفعلي لمشكلة
    // "الفصل المراد تسكينه لم يُحدَّد فعليًا فيتوقف الحفظ بصمت حتى مهلة 30 ثانية".
    async function selectDropdownValueVerified(selector, value, attempts = 4, delayMs = 500) {
        for (let i = 0; i < attempts; i++) {
            if (isGlobalStopRequested()) return false;
            const ok = await selectDropdownValue(selector, value);
            if (ok && !hasRequiredFieldWarning(selector)) return true;
            await wait(delayMs);
        }
        return false;
    }

    // autoassign-fix-5: هل يعرض الجدول الآن صفوف طلاب حقيقية (خلية كود مقروءة)؟
    // صف "No data available" يحتوي خلية واحدة فقط فلا يُحسب.
    function countReadableStudentRows() {
        let c = 0;
        document.querySelectorAll(SELECTORS.tableRows).forEach(r => {
            const cell = r.cells[CONFIG.studentCodeColumnIndex];
            if (cell && normalizeStudentCode(cell.innerText)) c++;
        });
        return c;
    }

    // autoassign-fix-5: أمان ضد "التسكين في فصل خاطئ" — لو فشل حفظ مجموعة (فصل ممتلئ مثلًا) وبقيت
    // مربعات اختيار طلابها محددة في الجدول، فسيُحفظ هؤلاء الطلاب مع المجموعة التالية إلى
    // فصلها هي. لذلك نلغي أي تحديد قديم (بـ click() الحقيقي ليصل لنموذج Angular) قبل تعليم
    // طلاب المجموعة الحالية وبعد أي فشل حفظ.
    function uncheckStaleSelections() {
        let n = 0;
        document.querySelectorAll(SELECTORS.tableRows).forEach(r => {
            const cb = r.querySelector(SELECTORS.rowCheckbox);
            if (cb && cb.checked) { cb.click(); n++; }
        });
        return n;
    }

    // ينتظر حتى يمتلئ الجدول فعليًا بصفوف طلاب ويثبت عددها (وليس فقط "ظهر صف ما").
    async function waitForReadableStudentRows(timeoutMs = 12000) {
        const start = Date.now();
        let last = -1, stable = 0;
        while (Date.now() - start < timeoutMs) {
            if (isGlobalStopRequested()) return false;
            const processingDiv = document.querySelector(SELECTORS.tableProcessing);
            const loading = processingDiv && window.getComputedStyle(processingDiv).display !== 'none';
            const n = loading ? 0 : countReadableStudentRows();
            if (n > 0 && n === last) {
                if (++stable >= 2) return true;
            } else {
                stable = 0;
                last = n;
            }
            await wait(250);
        }
        return false;
    }

    // autoassign-fix-5 (الإصلاح الجذري لمشكلة "يُسكَّن أول طالب فقط"):
    // بعد كل حفظ ناجح تُعيد صفحة الوزارة ضبط النموذج فيفرغ الجدول ويُمسح اختيار الصف/الفصل
    // (السجل يُظهر بالضبط: صفوف ممسوحة=1، أكواد مقروءة=0 لكل مجموعة تلي الأولى). الكود كان
    // يختار الصف والفصل الأصلي مرة واحدة فقط قبل أول مجموعة ثم يفترض بقاءهما، فتفشل كل
    // مجموعة تالية في نفس الفصل. هذه الدالة تعيد اختيار الصف والفصل الأصلي وتنتظر حتى
    // يمتلئ الجدول فعلًا، مع محاولات إضافية بإجبار إطلاق حدث التغيير إن لم يمتلئ.
    async function restoreSourceView(level, sourceClsValue) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            if (isGlobalStopRequested()) return false;
            const force = attempt > 1;
            await selectDropdownValue(SELECTORS.levelControl, level, { force });
            await waitForTableStable();
            await waitForDropdownPopulation(SELECTORS.classControl);
            await selectDropdownValue(SELECTORS.classControl, sourceClsValue, { force });
            await waitForStudentTableLoad();
            await waitForTableStable();
            if (await waitForReadableStudentRows(attempt === 1 ? 10000 : 15000)) {
                await optimizeDataTablesPageSize();
                return true;
            }
            addLog(`⚠️ الجدول ما زال فارغًا بعد إعادة اختيار الصف والفصل الأصلي (محاولة ${attempt}/3)`, 'warn');
        }
        return false;
    }

    // وصف مختصر لحالة الفلاتر الحالية — يُطبع فقط في رسائل التشخيص.
    function describeFilters() {
        const val = (sel) => {
            try {
                const c = Array.from(document.querySelectorAll(sel));
                const el = c.find(e => e.offsetParent !== null) || c[0];
                if (!el) return 'غير موجود';
                const o = el.options[el.selectedIndex];
                return o ? o.text.trim() : '؟';
            } catch (_) { return '؟'; }
        };
        return `الصف=[${val(SELECTORS.levelControl)}] الفصل الأصلي=[${val(SELECTORS.classControl)}] الفصل الهدف=[${val(SELECTORS.targetClassControl)}]`;
    }

    /////////////////////////////
    // 👥 SCRAPING STUDENTS
    /////////////////////////////
    async function getAllStudentsOnAllPages() {
        const all = [];
        const codeIdx = CONFIG.studentCodeColumnIndex;
        const nameIdx = codeIdx + 1;

        await optimizeDataTablesPageSize();

        const firstBtn = document.querySelector(SELECTORS.paginateFirst);
        if (firstBtn && !firstBtn.classList.contains('disabled')) {
            firstBtn.click();
            await waitForStudentTableLoad();
            await waitForTableStable();
        }

        let pageGuard = 0;
        while (true) {
            if (isGlobalStopRequested()) break;
            pageGuard++;
            if (pageGuard > MAX_PAGINATION_PAGES) {
                addLog(`⚠️ تم بلوغ الحد الأقصى للصفحات (${MAX_PAGINATION_PAGES})`, 'warn');
                break;
            }
            await waitForStudentTableLoad();
            await waitForTableStable();

            const rows = document.querySelectorAll(SELECTORS.tableRows);
            Array.from(rows).forEach(r => {
                const codeCell = r.cells[codeIdx];
                const nameCell = r.cells[nameIdx];
                if (codeCell && nameCell) {
                    const rawCode = codeCell.innerText.trim();
                    const clean = normalizeStudentCode(rawCode);
                    if (clean) {
                        all.push({
                            code: clean,
                            rawCode: rawCode,
                            name: nameCell.innerText.trim()
                        });
                    }
                }
            });

            const nextBtn = document.querySelector(SELECTORS.paginateNext);
            if (nextBtn && !nextBtn.classList.contains('disabled')) {
                nextBtn.click();
                await waitForStudentTableLoad();
                await waitForTableStable();
            } else {
                break;
            }
        }

        // v1.0.2: هذه الدالة تتنقّل عبر كل صفحات الجدول لجمع البيانات، وكانت
        // تترك الجدول على آخر صفحة وصلت إليها. أي كود يعمل بعدها مباشرة
        // (مثل حلقة تعليم الفصل المستهدف لكل طالب) كان يقرأ صفوف تلك الصفحة
        // الأخيرة الخطأ بدل الصفحة الأولى، فلا يجد أي تطابق بالأكواد رغم أن
        // الطالب المطلوب موجود فعليًا في صفحة أخرى. نعيد الجدول لأول صفحة
        // دائمًا قبل الخروج لضمان حالة معروفة وموحّدة لأي استخدام لاحق.
        const resetToFirst = document.querySelector(SELECTORS.paginateFirst);
        if (resetToFirst && !resetToFirst.classList.contains('disabled')) {
            resetToFirst.click();
            await waitForStudentTableLoad();
            await waitForTableStable();
        }

        return all;
    }

    /////////////////////////////
    // 💾 SAVE VERIFICATION
    /////////////////////////////
    // تنبيهات الصفحة الموجودة قبل ضغط «حفظ» (نصها بجانب العنصر): رسالة نجاح أو خطأ قديمة من حفظ سابق لا تُحسب تأكيدًا لهذا الحفظ.
    function snapshotAlerts() {
        const seen = new Map();
        document.querySelectorAll(`${SELECTORS.successAlert}, ${SELECTORS.errorAlert}, ${SELECTORS.alertBoxes}`).forEach(el => seen.set(el, el.innerText || ''));
        return seen;
    }

    // التنبيه «جديد» إن لم يكن في اللقطة أو تغيّر نصه بعدها.
    function isFreshAlert(el, baseline) {
        return !!el && (!baseline || !baseline.has(el) || baseline.get(el) !== (el.innerText || ''));
    }

    async function waitForSaveCompletionWithRetry(baseline, retryLeft = CONFIG.SAVE_RETRY_COUNT) {
        try {
            await waitForSaveCompletion(baseline);
            return true;
        } catch (err) {
            if (retryLeft > 0 && !isGlobalStopRequested()) {
                addLog(`⚠️ إعادة محاولة تأكيد الحفظ (${retryLeft} متبقية)`, 'warn');
                await wait(CONFIG.SAVE_RETRY_DELAY_MS);
                return waitForSaveCompletionWithRetry(baseline, retryLeft - 1);
            } else {
                throw err;
            }
        }
    }

    function waitForSaveCompletion(baseline) {
        showToast('... ننتظر تأكيد الحفظ ...', 'loading');
        return new Promise((resolve, reject) => {
            let observer;
            const timeoutId = setTimeout(() => {
                if (observer) observer.disconnect();
                reject(new Error('انتهت مهلة انتظار تأكيد الحفظ'));
            }, CONFIG.TIMEOUT_SAVE_MS);

            const check = () => {
                const successAlert = Array.from(document.querySelectorAll(SELECTORS.successAlert)).find(el => isFreshAlert(el, baseline)) || null;
                const noDataRow = document.querySelector(SELECTORS.tableEmptyCell);
                const errorAlert = Array.from(document.querySelectorAll(SELECTORS.errorAlert)).find(el => isFreshAlert(el, baseline)) || null;
                const fullClassIndicators = Array.from(document.querySelectorAll(SELECTORS.alertBoxes))
                    .filter(el => isFreshAlert(el, baseline))
                    .filter(el => {
                        const text = el.innerText || '';
                        return text.includes('ممتلئ') || text.includes('full') || text.includes('لا يمكن') ||
                               text.includes('exceed') || text.includes('يتجاوز') || text.includes('أكبر من 50') || text.includes('عدد طلاب الفصل رقم');
                    });

                if (successAlert) {
                    if ((successAlert.innerText && (successAlert.innerText.includes('تم') || successAlert.innerText.includes('success'))) || document.querySelector('.swal2-success-display')) {
                        clearTimeout(timeoutId);
                        if (observer) observer.disconnect();
                        setTimeout(() => resolve(true), 600);
                        return true;
                    }
                }

                if (errorAlert || fullClassIndicators.length > 0) {
                    const errMsg = errorAlert ? errorAlert.innerText : fullClassIndicators[0].innerText;
                    clearTimeout(timeoutId);
                    if (observer) observer.disconnect();
                    if (fullClassIndicators.length > 0) {
                        const okButton = fullClassIndicators[0].querySelector('.swal2-confirm, .close, .swal2-close');
                        if (okButton) okButton.click();
                    }
                    reject(new Error('رسالة خطأ أثناء الحفظ: ' + (errMsg || '')));
                    return true;
                }

                if (noDataRow) {
                    clearTimeout(timeoutId);
                    if (observer) observer.disconnect();
                    resolve(true);
                    return true;
                }

                // autoassign-fix-2: يكتشف بالضبط الحالة التي ظهرت في اللقطة — الحفظ
                // ضُغط بينما حقل "الفصل المراد تسكينه" ما زال فارغاً وعليه "حقل مطلوب"،
                // فلا يظهر أي تنبيه نجاح ولا خطأ من الموقع والعملية تنتظر 30 ثانية بلا
                // فائدة. نفشل فورًا برسالة واضحة بدل الانتظار الأعمى.
                if (hasRequiredFieldWarning(SELECTORS.targetClassControl)) {
                    clearTimeout(timeoutId);
                    if (observer) observer.disconnect();
                    reject(new Error('لم يتم الحفظ: حقل "الفصل المراد تسكينه" ما زال يظهر عليه "حقل مطلوب" — لم يُضبط فعليًا رغم محاولة الكود'));
                    return true;
                }
                return false;
            };

            if (check()) return;
            observer = new MutationObserver(() => check());
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        });
    }

    /////////////////////////////
    // 🔭 قراءة لقطة من الموقع (للقراءة فقط: تختار الصف والفصل وتقرأ الجدول ولا تحفظ شيئًا)
    /////////////////////////////
    function pickSelect(selector) {
        const candidates = Array.from(document.querySelectorAll(selector));
        return candidates.find(el => el.offsetParent !== null) || candidates[0] || null;
    }

    // خيارات قائمة بلا العنصر النائب («اختر» أو القيمة -1).
    function readSelectOptions(selector) {
        const el = pickSelect(selector);
        if (!el) return [];
        return Array.from(el.options)
            .map(o => ({ value: String(o.value), text: (o.text || '').trim() }))
            .filter(o => o.value !== '' && o.value !== '-1' && !/^(اختر|--)/.test(o.text));
    }

    function optionsSignature(opts) {
        return opts.map(o => `${o.value}=>${o.text}`).join('|');
    }

    // بعد اختيار صف جديد تستبدل الصفحة قائمة الفصول بعد استجابة الخادم؛ لا نقرأها قبل أن تتغير (أو تمضي مهلة الاستقرار).
    async function waitForClassOptions(prevSignature, timeoutMs = 3000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (isGlobalStopRequested()) break;
            const sig = optionsSignature(readSelectOptions(SELECTORS.classControl));
            if (sig && sig !== prevSignature) break;
            await wait(150);
        }
        await wait(CONFIG.WAIT_AFTER_DROPDOWN_MS);
        return readSelectOptions(SELECTORS.classControl);
    }

    /**
     * يقرأ طلاب كل فصول الصفوف المطلوبة. levelValues: Set قيم الصفوف (أو null للكل).
     * onlyClasses: Set مفاتيح `${الصف}\u0001${الفصل}` (أو `${الصف}\u0001*` لكل فصول الصف) لتضييق القراءة عند التحقق بعد التنفيذ.
     * يعيد لقطة بالشكل الذي تقبله NeprasAssignPlan.buildPlan. الفصل الذي تعذّرت قراءته يُسجَّل في failedClasses ولا يُخفى.
     */
    async function scanLevels(levelValues, opts = {}) {
        const only = opts.onlyClasses || null;
        const snapshot = { levels: [], stopped: false };
        const levelOpts = readSelectOptions(SELECTORS.levelControl).filter(o => !levelValues || levelValues.has(o.value));
        let prevClassSig = optionsSignature(readSelectOptions(SELECTORS.classControl));
        let prevCodes = '';

        for (const lv of levelOpts) {
            if (isGlobalStopRequested()) { snapshot.stopped = true; break; }
            const level = { value: lv.value, text: lv.text, classes: [], targetOptions: null, failedClasses: [] };
            snapshot.levels.push(level);

            const levelOk = await selectDropdownValue(SELECTORS.levelControl, lv.value, { force: true });
            if (!levelOk) { level.failedClasses.push('(تعذّر اختيار الصف)'); continue; }
            await waitForTableStable();
            const classOpts = await waitForClassOptions(prevClassSig);
            prevClassSig = optionsSignature(classOpts);

            for (const c of classOpts) {
                if (only && !only.has(`${lv.value}\u0001${c.value}`) && !only.has(`${lv.value}\u0001*`)) continue;
                if (isGlobalStopRequested()) { snapshot.stopped = true; break; }
                if (opts.label) setProgress(opts.percent ?? 0, `${opts.label}: ${lv.text} / ${c.text}`);

                const classOk = await selectDropdownValue(SELECTORS.classControl, c.value, { force: true });
                if (!classOk) { level.failedClasses.push(c.text); continue; }
                await waitForStudentTableLoad();
                await waitForTableStable();
                let students = await getAllStudentsOnAllPages();

                // قراءة قديمة: فصلان متتاليان بالأكواد نفسها = الجدول لم يتحدث بعد، فنعيد القراءة بعد مهلة.
                let sig = students.map(s => s.code).join(',');
                if (sig && sig === prevCodes) {
                    await wait(CONFIG.WAIT_AFTER_PAGE_LOAD_MS * 2);
                    await waitForStudentTableLoad();
                    await waitForTableStable();
                    students = await getAllStudentsOnAllPages();
                    sig = students.map(s => s.code).join(',');
                    if (sig === prevCodes) addLog(`⚠️ فصل "${c.text}" ظهر بنفس طلاب الفصل السابق بعد إعادة القراءة — راجع الصفحة يدويًا`, 'warn');
                }
                prevCodes = sig;

                level.classes.push({ value: c.value, text: c.text, students: students.map(s => ({ code: s.code, name: s.name })) });
                if (!level.targetOptions) {
                    const targets = readSelectOptions(SELECTORS.targetClassControl);
                    if (targets.length) level.targetOptions = targets;
                }
            }
            if (snapshot.stopped) break;
        }
        return snapshot;
    }

    /////////////////////////////
    // 🚚 تنفيذ نقل مجموعة واحدة
    /////////////////////////////
    /**
     * ينقل طلاب مجموعة واحدة (صف + فصل أصلي ← فصل هدف) ويعيد { moved: [أكواد], failed: Map(كود ← سبب), retryable, viewFailed }.
     * view: حالة العرض الحالية { level, from, dirty }؛ تصير dirty بعد أي حفظ لأن الموقع يُفرغ الجدول ويمسح الفلاتر.
     * القاعدة التي لا تتغير (من إصلاحات 2–5 السابقة): نفعّل مربعات اختيار صفوف المجموعة فقط بعد ضبط الفصل الهدف فعليًا،
     * ونلغي أي تحديد قديم قبل التعليم وبعد أي فشل حفظ، ونعيد عرض الفصل الأصلي بعد كل حفظ.
     */
    async function moveGroup(group, view, hooks = {}) {
        // final: أكواد فشلت فشلًا لا تنفع فيه إعادة المحاولة (غير موجودة في الفصل الأصلي وقت التنفيذ أو بلا مربع اختيار).
        const result = { moved: [], failed: new Map(), final: new Set(), retryable: false, viewFailed: false };
        const remaining = new Set(group.moves.map(m => m.code));
        const failAll = (reason, retryable) => {
            remaining.forEach(code => { result.failed.set(code, reason); if (!retryable) result.final.add(code); });
            remaining.clear();
            if (retryable) result.retryable = true;
        };

        if (view.dirty || view.level !== group.levelValue || view.from !== group.fromValue) {
            const restored = await restoreSourceView(group.levelValue, group.fromValue);
            if (!restored) {
                result.viewFailed = true;
                addLog(`⚠️ تعذّر عرض طلاب الفصل الأصلي "${group.fromText}" — ${describeFilters()}`, 'warn');
                failAll(`تعذّر عرض الفصل الأصلي "${group.fromText}" في الصفحة`, true);
                return result;
            }
            view.level = group.levelValue; view.from = group.fromValue; view.dirty = false;
        }

        // الفصل الهدف قائمة واحدة على مستوى الصفحة (لا قائمة داخل كل صف): نضبطها وتتحقق الدالة من ثبات القيمة.
        const targetSelected = await selectDropdownValueVerified(SELECTORS.targetClassControl, group.toValue);
        if (!targetSelected) {
            addLog(`⚠️ تعذّر ضبط "الفصل المراد تسكينه" (${group.toText}) على الصفحة بعد عدة محاولات — ${describeFilters()}`, 'warn');
            failAll(`تعذّر ضبط "الفصل المراد تسكينه" (${group.toText}) على الصفحة`, true);
            return result;
        }
        await wait(CONFIG.WAIT_AFTER_DROPDOWN_MS);

        const firstBtn = document.querySelector(SELECTORS.paginateFirst);
        if (firstBtn && !firstBtn.classList.contains('disabled')) {
            firstBtn.click();
            await waitForStudentTableLoad();
            await waitForTableStable();
        }

        let pageGuard = 0;
        while (remaining.size > 0 && !isGlobalStopRequested()) {
            if (++pageGuard > MAX_PAGINATION_PAGES) {
                addLog(`⚠️ تم بلوغ الحد الأقصى للصفحات أثناء البحث عن طلاب فصل ${group.toText}`, 'warn');
                break;
            }
            while (pauseRequested && !isGlobalStopRequested()) await wait(500);

            await waitForStudentTableLoad();
            await waitForTableStable();

            const staleChecked = uncheckStaleSelections();
            if (staleChecked > 0) addLog(`🧹 أُلغي تحديد ${staleChecked} صف كان محددًا مسبقًا (لمنع تسكينهم في فصل خاطئ)`, 'warn');

            const pageCodes = [];
            for (const row of Array.from(document.querySelectorAll(SELECTORS.tableRows))) {
                const codeCell = row.cells[CONFIG.studentCodeColumnIndex];
                if (!codeCell) continue;
                const code = normalizeStudentCode(codeCell.innerText);
                if (!code || !remaining.has(code)) continue;
                const checkbox = row.querySelector(SELECTORS.rowCheckbox);
                if (!checkbox) { result.failed.set(code, 'لم يُعثر على مربع اختيار صف الطالب'); result.final.add(code); remaining.delete(code); continue; }
                if (!checkbox.checked) checkbox.click();
                pageCodes.push(code);
                remaining.delete(code);
            }

            if (pageCodes.length > 0) {
                const saveBtn = document.querySelector(SELECTORS.saveButton);
                if (!saveBtn) {
                    addLog(`⚠️ لم يُعثر على زر الحفظ بعد تعليم ${pageCodes.length} طالب لفصل ${group.toText}`, 'warn');
                    uncheckStaleSelections();
                    pageCodes.forEach(c => result.failed.set(c, 'لم يُعثر على زر الحفظ في الصفحة'));
                    failAll('توقفت المجموعة: زر الحفظ غير موجود', false);
                    break;
                }
                const baseline = snapshotAlerts();
                saveBtn.click();
                view.dirty = true;
                try {
                    await waitForSaveCompletionWithRetry(baseline);
                } catch (saveErr) {
                    const reason = saveErr && saveErr.message ? saveErr.message : String(saveErr);
                    addLog(`❌ فشل حفظ ${pageCodes.length} طالب إلى فصل ${group.toText}: ${reason}`, 'error');
                    uncheckStaleSelections();
                    pageCodes.forEach(c => result.failed.set(c, reason));
                    result.retryable = true;
                    failAll('توقفت المجموعة بعد فشل حفظ سابق في الفصل نفسه', true);
                    break;
                }
                result.moved.push(...pageCodes);
                addLog(`✅ تم حفظ تسكين ${pageCodes.length} طالب في فصل ${group.toText}`, 'success');
                if (hooks.onSaved) hooks.onSaved(pageCodes.length);

                // بعد الحفظ يُفرَّغ الجدول وتُمسح الفلاتر: إن بقي طلاب لهذه المجموعة نعيد عرض الفصل الأصلي وضبط الهدف.
                if (remaining.size > 0) {
                    const restored = await restoreSourceView(group.levelValue, group.fromValue);
                    if (!restored) {
                        result.viewFailed = true;
                        addLog(`⚠️ تعذّرت إعادة عرض الفصل الأصلي "${group.fromText}" بعد الحفظ — ${describeFilters()}`, 'warn');
                        failAll(`تعذّرت إعادة عرض الفصل الأصلي "${group.fromText}" بعد الحفظ`, true);
                        break;
                    }
                    view.dirty = false;
                    const reSelected = await selectDropdownValueVerified(SELECTORS.targetClassControl, group.toValue);
                    if (!reSelected) {
                        failAll(`تعذّر إعادة ضبط "الفصل المراد تسكينه" (${group.toText}) بعد الحفظ`, true);
                        break;
                    }
                    await wait(CONFIG.WAIT_AFTER_DROPDOWN_MS);
                }
                continue; // نعيد الفحص من الصفحة الأولى
            }

            if (remaining.size === 0) break;
            const nextBtn = document.querySelector(SELECTORS.paginateNext);
            if (nextBtn && !nextBtn.classList.contains('disabled')) {
                nextBtn.click();
                await waitForStudentTableLoad();
                await waitForTableStable();
            } else {
                break;
            }
        }

        if (remaining.size > 0 && !isGlobalStopRequested()) {
            addLog(`⚠️ ${remaining.size} كود لم يُعثر عليه في فصل "${group.fromText}" وقت التنفيذ: ${[...remaining].join('، ')}`, 'warn');
            failAll(`لم يُعثر عليه في الفصل الأصلي "${group.fromText}" وقت التنفيذ`, false);
        }
        return result;
    }

    /////////////////////////////
    // 🚀 قراءة الملف والتخطيط والتنفيذ والتحقق
    /////////////////////////////
    function planApi() {
        const api = window.NeprasAssignPlan;
        if (!api) throw new Error('وحدة منطق التسكين غير محمّلة. حدّث الصفحة وأعد المحاولة.');
        return api;
    }

    // أعمدة الملف المختارة في اللوحة + قراءة الصفوف. يعيد null مع إشعار إن نقص شيء.
    function readParsedFile() {
        headers.code = (document.getElementById('col-student')?.value) || '';
        headers.targetClass = (document.getElementById('col-class')?.value) || '';
        headers.level = (document.getElementById('col-level')?.value) || '';
        if (!headers.code || !headers.targetClass || !headers.level) {
            addLog('⚠️ يرجى اختيار أعمدة (كود الطالب، الفصل الهدف، الصف) أولاً', 'warn');
            showToast('⚠️ اختر الأعمدة المطلوبة', 'warning');
            return null;
        }
        if (new Set([headers.code, headers.targetClass, headers.level]).size < 3) {
            addLog('⚠️ اخترتَ العمود نفسه لأكثر من غرض', 'warn');
            showToast('⚠️ لكل غرض عمود مختلف', 'warning');
            return null;
        }
        const parsed = planApi().parseEntries(excelRows, headers);
        if (!parsed.entries.length) {
            addLog('⚠️ لا توجد سجلات صالحة للتسكين بعد فحص الملف', 'warn');
            showToast('⚠️ لا توجد سجلات صالحة', 'warning');
            return null;
        }
        return parsed;
    }

    function fileSummaryText(parsed) {
        const errors = parsed.issues.filter(i => i.severity === 'error').length;
        const dups = parsed.issues.filter(i => i.kind === 'duplicate').length;
        const parts = [`${parsed.entries.length} سجل صالح من ${parsed.totalRows} صف`];
        if (errors) parts.push(`${errors} صف مستبعد لعيب فيه`);
        if (dups) parts.push(`${dups} مكرر حُسب مرة واحدة`);
        return parts.join(' — ');
    }

    function refreshFileSummary() {
        const box = document.getElementById('aa-file-summary');
        const startBtn = document.getElementById('aa-start');
        const previewBtn = document.getElementById('aa-preview');
        if (!box) return;
        const ready = !!(excelRows.length && document.getElementById('col-student')?.value && document.getElementById('col-class')?.value && document.getElementById('col-level')?.value);
        if (!ready) { box.textContent = ''; if (startBtn) startBtn.disabled = true; if (previewBtn) previewBtn.disabled = true; return; }
        const cols = { code: document.getElementById('col-student').value, targetClass: document.getElementById('col-class').value, level: document.getElementById('col-level').value };
        const parsed = planApi().parseEntries(excelRows, cols);
        box.textContent = fileSummaryText(parsed);
        const usable = !busy && parsed.entries.length > 0 && new Set(Object.values(cols)).size === 3;
        if (startBtn) startBtn.disabled = !usable;
        if (previewBtn) previewBtn.disabled = !usable;
    }

    function setBusyUI(on) {
        busy = on;
        const pauseBtn = document.getElementById('aa-pause');
        const stopBtn = document.getElementById('aa-stop');
        if (pauseBtn) pauseBtn.hidden = !on;
        if (stopBtn) stopBtn.hidden = !on;
        if (!on && pauseBtn) { window.NeprasButtons.setIcon(pauseBtn, 'stop'); window.NeprasButtons.setLabel(pauseBtn, 'إيقاف مؤقت'); }
        refreshFileSummary();
        if (neprasPanel) neprasPanel.actionButtons['aa-reset'].hidden = on;
    }

    // حوار للمستخدم بنص متعدد الأسطر. يعيد true/false في حوار التأكيد.
    async function askUser(kind, title, lines, { confirm = false, okText } = {}) {
        const message = lines.join('\n');
        const D = window.neprasDialog;
        if (!D) return confirm ? window.confirm(`${title}\n\n${message}`) : (window.alert(`${title}\n\n${message}`), true);
        const options = { title, type: kind, okText };
        return confirm ? D.confirm(message, options) : D.open({ ...options, message });
    }

    function planLines(plan, issues) {
        const prefix = { ok: '• ', warn: 'تنبيه: ', error: 'مشكلة: ' };
        return planApi().describePlan(plan, issues).map(l => prefix[l.kind] + l.text);
    }

    function logPlan(plan, issues) {
        planApi().describePlan(plan, issues).forEach(l => addLog(l.text, l.kind === 'ok' ? 'info' : 'warn'));
    }

    async function waitWhilePaused() {
        while (pauseRequested && !isGlobalStopRequested()) {
            await wait(500);
        }
    }

    // يسجّل نتيجة طالب ويصحّح العدّادات إن تغيّرت حالته (نجحت إعادة المحاولة بعد فشل).
    function recordExec(exec, code, status, reason) {
        const prev = exec.get(code);
        if (prev && prev.status === status) return;
        if (prev) { if (prev.status === 'failed') stats.errors--; else stats.successes--; }
        else stats.processed++;
        if (status === 'failed') stats.errors++; else stats.successes++;
        exec.set(code, { status, reason: reason || '' });
    }

    function levelsOfPlan(plan) {
        return new Set(plan.groups.map(g => String(g.levelValue)));
    }

    // الفصول المعنيّة بالتحقق: الأصلية والهدف لكل مجموعة (أو كل فصول الصف إن لم يُعرف الهدف).
    function involvedClasses(plan) {
        const involved = new Set();
        for (const g of plan.groups) {
            involved.add(`${g.levelValue}\u0001${g.fromValue}`);
            involved.add(g.toClassValue != null ? `${g.levelValue}\u0001${g.toClassValue}` : `${g.levelValue}\u0001*`);
        }
        return involved;
    }

    async function buildPlanFromSite(parsed) {
        const api = planApi();
        const siteLevels = readSelectOptions(SELECTORS.levelControl);
        if (!siteLevels.length) throw new Error('لا توجد قائمة صفوف في الصفحة. افتح صفحة «توزيع وتسكين الطلاب» وانتظر اكتمال تحميلها');

        const needed = new Set();
        for (const level of new Set(parsed.entries.map(e => e.level))) {
            const r = api.resolveOption(siteLevels, level, api.levelKey);
            if (r.option) needed.add(r.option.value);
        }
        addLog(`🔎 قراءة طلاب ${needed.size} صف من الموقع (قراءة فقط، لا يتغير شيء)...`, 'info');
        const snapshot = await scanLevels(needed, { label: 'قراءة', percent: 3 });
        if (snapshot.stopped) return { stopped: true };
        let plan = api.buildPlan({ entries: parsed.entries, snapshot, capacity: api.SITE_CLASS_CAPACITY });

        // كود غير موجود في صفّه: نفحص بقية الصفوف ليُعرف هل هو في صف آخر (خطأ شائع في عمود الصف).
        if (plan.notFound.length && siteLevels.length > needed.size) {
            addLog(`🔎 ${plan.notFound.length} كود لم يوجد في صفّه: نقرأ بقية الصفوف لمعرفة هل هو في صف آخر...`, 'info');
            const rest = new Set(siteLevels.map(o => o.value).filter(v => !needed.has(v)));
            const more = await scanLevels(rest, { label: 'قراءة', percent: 3 });
            if (more.stopped) return { stopped: true };
            snapshot.levels.push(...more.levels);
            plan = api.buildPlan({ entries: parsed.entries, snapshot, capacity: api.SITE_CLASS_CAPACITY });
        }
        return { plan, snapshot };
    }

    async function runFlow(preview) {
        if (busy) return;
        const parsed = readParsedFile();
        if (!parsed) return;

        try { window.neprasResetGlobalStop?.(); } catch (_) {}
        stopRequested = false;
        pauseRequested = false;
        stats = { totalPlanned: 0, processed: 0, successes: 0, errors: 0, startTime: Date.now() };
        updateStatsUI();
        setBusyUI(true);
        lastRun = null;

        try {
            const api = planApi();
            addLog(preview ? '🔍 بدء المعاينة (لن يُحفظ أي تغيير في الموقع)' : '🚀 بدء التسكين: فحص الصفحة وبناء الخطة أولًا', 'info');
            setProgress(2, 'قراءة الصفوف والفصول من الموقع...');

            const built = await buildPlanFromSite(parsed);
            if (built.stopped) {
                addLog('🛑 أُوقفت العملية أثناء القراءة. لم يتغير شيء في الموقع.', 'warn');
                setProgress(0, 'أُوقفت العملية قبل أي تغيير');
                showToast('🛑 أُوقفت العملية. لم يتغير شيء في الموقع.', 'warning');
                return;
            }
            const { plan } = built;
            const run = { plan, issues: parsed.issues, exec: new Map(), verify: null, preview };
            lastRun = run;
            stats.totalPlanned = plan.moves.length;
            updateStatsUI();
            logPlan(plan, parsed.issues);
            if (neprasPanel) neprasPanel.actionButtons['aa-export'].hidden = false;

            if (!plan.moves.length) {
                setProgress(100, 'لا يوجد طلاب يحتاجون النقل');
                await askUser('warning', 'لا يوجد ما يُنقل', [...planLines(plan, parsed.issues), '', 'تفاصيل كل كود في «تنزيل تقرير النتائج».']);
                return;
            }

            if (preview) {
                setProgress(100, `المعاينة: ${plan.moves.length} طالب سيُنقلون`);
                await askUser('info', 'نتيجة المعاينة (لم يتغير شيء)', [...planLines(plan, parsed.issues), '', 'لتنفيذ التسكين اضغط «بدء التسكين»، ولتفاصيل كل طالب اضغط «تنزيل تقرير النتائج».']);
                return;
            }

            const proceed = await askUser('warning', 'تأكيد بدء التسكين', [
                ...planLines(plan, parsed.issues), '',
                'سيُحفظ النقل على موقع الوزارة مباشرة، وبعده تُقرأ الفصول من جديد للتأكد من كل طالب.'
            ], { confirm: true, okText: 'نعم، ابدأ التسكين' });
            if (!proceed) {
                addLog('🚫 تم إلغاء العملية بناءً على رغبة المستخدم. لم يتغير شيء.', 'info');
                setProgress(0, 'أُلغيت العملية قبل أي تغيير');
                return;
            }

            await executePlan(run, api);
        } catch (err) {
            handleError(err, preview ? 'previewAssignment' : 'startAssignment');
        } finally {
            stopRequested = false;
            pauseRequested = false;
            setBusyUI(false);
        }
    }

    async function executePlan(run, api) {
        const { plan, exec } = run;
        const view = { level: null, from: null, dirty: true };
        const deferred = [];
        let aborted = false;
        let viewFailures = 0;
        const hooks = { onSaved: () => { updateStatsUI(); setProgress((stats.processed / Math.max(1, stats.totalPlanned)) * 90, `تم نقل ${stats.successes} من ${stats.totalPlanned} طالب`); } };

        const apply = (group, res) => {
            res.moved.forEach(code => recordExec(exec, code, 'saved'));
            res.failed.forEach((reason, code) => recordExec(exec, code, 'failed', reason));
            const left = group.moves.filter(m => res.failed.has(m.code) && !res.final.has(m.code));
            if (res.retryable && left.length) deferred.push({ ...group, moves: left });
            updateStatsUI();
        };

        addLog(`🚀 تنفيذ ${plan.moves.length} نقلة في ${plan.groups.length} مجموعة`, 'info');
        for (let gi = 0; gi < plan.groups.length; gi++) {
            if (isGlobalStopRequested() || aborted) break;
            await waitWhilePaused();
            const g = plan.groups[gi];
            addLog(`📤 (${gi + 1}/${plan.groups.length}) ${g.moves.length} طالب: ${g.levelText} / ${g.fromText} ← ${g.toText}${g.capacityRisk ? ' (الفصل الهدف قد لا يتسع)' : ''}`, 'info');
            const res = await moveGroup(g, view, hooks);
            apply(g, res);
            viewFailures = res.viewFailed ? viewFailures + 1 : 0;
            if (viewFailures >= 3) {
                aborted = true;
                addLog('⛔ تعذّر عرض الفصول في الصفحة ثلاث مرات متتالية: تُوقف العملية بدل المحاولة العمياء. حدّث الصفحة ثم أعد التشغيل (الباقي سيُعرف من التقرير).', 'error');
            }
        }

        // مرور ثانٍ للمجموعات التي فشلت بسبب الحفظ أو العرض: قد يكون ما نُقل قبلها أفرغ فصلًا هدفًا.
        if (deferred.length && !isGlobalStopRequested() && !aborted) {
            addLog(`🔁 إعادة محاولة ${deferred.length} مجموعة فشلت (قد يكون النقل السابق أخلى مكانًا)`, 'info');
            for (const g of deferred) {
                if (isGlobalStopRequested()) break;
                await waitWhilePaused();
                view.dirty = true;
                const res = await moveGroup(g, view, hooks);
                res.moved.forEach(code => recordExec(exec, code, 'saved'));
                res.failed.forEach((reason, code) => recordExec(exec, code, 'failed', reason));
                updateStatsUI();
            }
        }

        const stopped = isGlobalStopRequested();
        if (!stopped && !aborted) {
            setProgress(92, 'التحقق: قراءة الفصول من جديد للتأكد من كل طالب...');
            addLog('🔎 التحقق من النتيجة بقراءة الفصول المعنيّة من جديد...', 'info');
            const after = await scanLevels(levelsOfPlan(plan), { onlyClasses: involvedClasses(plan), label: 'تحقق', percent: 94 });
            if (after.stopped) addLog('🛑 أُوقف التحقق: التقرير يعتمد على ما أعلنه الموقع عند الحفظ فقط', 'warn');
            else run.verify = api.reconcile(plan, after);
        }

        await finishRun(run, { stopped, aborted });
    }

    async function finishRun(run, { stopped, aborted }) {
        const { plan, verify } = run;
        const saved = [...run.exec.values()].filter(e => e.status === 'saved').length;
        const failed = [...run.exec.values()].filter(e => e.status === 'failed').length;
        const notRun = plan.moves.length - saved - failed;
        const c = verify ? verify.counts : null;
        const confirmed = c ? c.moved : 0;
        const problems = c ? c.not_moved + c.elsewhere + c.unknown + c.changed : failed;

        const lines = [];
        const other = [];
        if (plan.summary.alreadyInPlace) other.push(`${plan.summary.alreadyInPlace} كانوا في فصلهم أصلًا`);
        const skipped = plan.summary.notFound + plan.summary.wrongLevel + plan.summary.unresolvedLevel + plan.summary.unresolvedTarget;
        if (skipped) other.push(`${skipped} سجل لم يُنفَّذ لأن كوده أو صفه أو فصله غير موجود في الموقع`);

        let kind = 'success';
        let title = 'اكتمل التسكين';
        if (stopped || aborted) {
            kind = 'warning';
            title = stopped ? 'أُوقف التسكين' : 'تُوقف التسكين لتعذّر عرض الصفحة';
            lines.push(`حُفظ نقل ${saved} طالب من ${plan.moves.length}، و${notRun + failed} لم يُنقلوا.`);
            lines.push('لم تُقرأ الفصول من جديد للتأكد، فالأعداد مما أعلنه الموقع عند الحفظ.');
        } else if (c) {
            lines.push(`نُقل وتأكّد من ${confirmed} طالب من ${plan.moves.length} بقراءة الفصول من جديد.`);
            if (c.not_moved) lines.push(`${c.not_moved} ما زالوا في فصلهم القديم.`);
            if (c.elsewhere) lines.push(`${c.elsewhere} موجودون في فصل غير المطلوب.`);
            if (c.unknown) lines.push(`${c.unknown} لم يُعثر عليهم في الفصلين بعد التنفيذ.`);
            if (c.changed) lines.push(`${c.changed} كانوا في فصلهم المطلوب ثم لم يعودوا فيه.`);
            if (problems || failed) {
                kind = 'warning';
                title = 'انتهى التسكين مع ملاحظات';
            } else if (skipped) {
                kind = 'warning';
                title = 'اكتمل نقل ما أمكن نقله';
            }
        } else {
            kind = 'warning';
            title = 'انتهى التسكين دون تحقق';
            lines.push(`أعلن الموقع حفظ ${saved} من ${plan.moves.length}، وفشل ${failed}. تعذّر التحقق بقراءة الفصول من جديد.`);
        }
        other.forEach(t => lines.push(t));
        if (failed) lines.push('الأسباب لكل طالب في «تنزيل تقرير النتائج».');

        const done = !(stopped || aborted);
        addLog(`${done ? '🏁' : '🛑'} ${title}: ${lines.join(' ')}`, kind === 'success' ? 'success' : 'warn');
        setProgress(done ? 100 : (stats.processed / Math.max(1, stats.totalPlanned)) * 90, title);
        showToast(`${kind === 'success' ? '✅' : '⚠️'} ${title}`, kind === 'success' ? 'success' : 'warning');
        updateStatsUI();

        const autoReport = document.getElementById('auto-export-checkbox');
        const autoLists = document.getElementById('auto-export-lists-checkbox');
        await askUser(kind, title, lines);
        if (autoReport && autoReport.checked) await exportResultsReport();
        if (autoLists && autoLists.checked && done) await exportClassLists();
    }

    /////////////////////////////
    // 📄 التقارير
    /////////////////////////////
    function reportSpecs(run) {
        const api = planApi();
        const rep = api.buildResultRows({ plan: run.plan, exec: run.exec, verify: run.verify, preview: run.preview });
        const summary = [
            ['نوع التقرير', run.preview ? 'معاينة قبل التنفيذ (لم يتغير شيء في الموقع)' : 'نتيجة تنفيذ التسكين'],
            ['التحقق بعد التنفيذ', run.preview ? 'غير مطلوب' : (run.verify ? 'تم بقراءة الفصول من جديد' : 'لم يتم')],
            ['سجلات الملف الصالحة', run.plan.summary.entries]
        ];
        Object.keys(rep.counts).forEach(k => summary.push([api.RESULT_LABEL[k], rep.counts[k]]));
        const fileErrors = run.issues.filter(i => i.severity === 'error').length;
        if (fileErrors) summary.push(['صفوف مستبعدة من الملف لعيب فيها', fileErrors]);

        const specs = [
            { name: 'ملخص', title: 'ملخص التسكين', headers: ['البند', 'العدد'], rows: summary, recordCount: summary.length, countLabel: 'عدد البنود', rightAlignCols: [0], printFit: true },
            { name: 'نتيجة كل طالب', title: 'نتيجة كل طالب', headers: rep.headers, rows: rep.rows, recordCount: rep.rows.length, countLabel: 'عدد الطلاب', rightAlignCols: [2], printFit: true }
        ];
        if (run.issues.length) {
            specs.push({
                name: 'مشكلات الملف', title: 'مشكلات في ملف Excel', headers: ['الصف في Excel', 'الكود', 'المشكلة', 'الأثر'],
                rows: run.issues.map(i => [String(i.rowNo), i.code, i.message, i.severity === 'error' ? 'استُبعد' : 'لا أثر']),
                recordCount: run.issues.length, countLabel: 'عدد المشكلات', rightAlignCols: [2], printFit: true
            });
        }
        if (run.plan.capacity.length) {
            specs.push({
                name: 'سعة الفصول', title: `سعة الفصول المتأثرة (الحد ${run.plan.capacityLimit})`, headers: ['الصف', 'الفصل', 'قبل', 'داخل', 'خارج', 'بعد', 'الحالة'],
                rows: run.plan.capacity.map(r => [r.levelText, r.classText, r.before, r.incoming, r.outgoing, r.after, r.over ? 'يتجاوز الحد' : 'ضمن الحد']),
                recordCount: run.plan.capacity.length, countLabel: 'عدد الفصول', rightAlignCols: [0], printFit: true
            });
        }
        return specs;
    }

    async function exportResultsReport() {
        try {
            if (!lastRun) { showToast('⚠️ لا يوجد تقرير بعد: ابدأ المعاينة أو التسكين أولًا', 'warning'); return; }
            const specs = reportSpecs(lastRun);
            const baseName = `${lastRun.preview ? 'معاينة_التسكين' : 'نتيجة_التسكين'}_${NeprasEgypt.todayStamp()}`;
            if (typeof neprasStudentBuildMultiSheetXlsx === 'function' && typeof downloadWorkbook === 'function') {
                await downloadWorkbook({ __neprasStudentXlsxBytes: neprasStudentBuildMultiSheetXlsx(specs) }, baseName, 'التسكين والتوزيع');
            } else {
                await neprasEnsureLib('xlsx');
                const wb = XLSX.utils.book_new();
                specs.forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]), s.name.substring(0, 31)));
                const blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                await window.neprasDialog.triggerDownload(blob, `${baseName}.xlsx`, { folder: 'التسكين والتوزيع' });
            }
            addLog('✅ تم تنزيل تقرير النتائج Excel', 'success');
        } catch (err) {
            handleError(err, 'exportResultsReport');
        }
    }

    // قراءة جداول الصفحة (طلاب كل الفصول) وبناء قوائم أحادية العمود بالمنشئ المنسّق نفسه: مسار احتياطي إن تعذّر مسار الواجهة البرمجية.
    async function exportClassListsFromPage() {
        const lists = window.NeprasClassLists;
        if (!lists || typeof neprasStudentBuildMultiSheetXlsx !== 'function' || typeof downloadWorkbook !== 'function') {
            throw new Error('محرك قوائم الفصول غير محمّل. حدّث الصفحة وأعد المحاولة.');
        }
        addLog('📄 قراءة قوائم الفصول من جداول الصفحة...', 'info');
        const snapshot = await scanLevels(null, { label: 'قراءة القوائم', percent: 10 });
        if (snapshot.stopped) throw new Error('تم إيقاف العملية.');
        const records = [];
        snapshot.levels.forEach(l => l.classes.forEach(c => c.students.forEach(s => records.push({ name: s.name, code: s.code, grade: l.text, class_number: c.text }))));
        if (!records.length) throw new Error('لم تُقرأ أي أسماء من جداول الصفحة.');
        const unread = snapshot.levels.flatMap(l => l.failedClasses.map(f => `${l.text}/${f}`));
        if (unread.length) addLog(`⚠️ تعذّرت قراءة: ${unread.join('، ')} — لن تظهر في الملف`, 'warn');

        // اسم المدرسة من الصفحة إن وُجد (القيمة «المدرسة» نائب لا اسم)، وما لا يُعرف من المحافظة والمديرية والإدارة يُطبع منقّطًا ليُكتب باليد.
        const pageSchool = (typeof getSchoolNameFromPage === 'function' ? String(getSchoolNameFromPage() || '').trim() : '');
        const ctx = { school: pageSchool && pageSchool !== 'المدرسة' ? pageSchool : '', academicYear: NeprasEgypt.academicYearLabel(), governorate: '', directorate: '', administration: '' };
        const specs = lists.groupStudentRecords(records).map(group => {
            const groupName = `${group.gradeText} - ${group.classNo === lists.NO_CLASS ? lists.NO_CLASS : `فصل ${group.classNo}`}`;
            return {
                name: groupName,
                title: `قائمة تلاميذ ${groupName}`,
                headers: ['م', 'كود التلميذ', 'اسم التلميذ'],
                rows: group.students.map((s, i) => [String(i + 1), s.code, s.name]),
                recordCount: group.students.length,
                countLabel: `العام الدراسي ${ctx.academicYear} — عدد التلاميذ`,
                infoLines: lists.schoolInfoLines(ctx),
                rightAlignCols: [2],
                printFit: true
            };
        });
        await downloadWorkbook({ __neprasStudentXlsxBytes: neprasStudentBuildMultiSheetXlsx(specs) }, `قوائم_فصول_المدرسة_${NeprasEgypt.todayStamp()}`, 'قوائم الفصول');
        return { ok: true, count: records.length, sheets: specs.length };
    }

    /**
     * قوائم فصول المدرسة (عامودين) بالمحرك المشترك مع «السجلات والكشوف»: بيانات الواجهة البرمجية (الكود والاسم وحالة القيد)
     * وترويسة المحافظة والمديرية والإدارة وقالب المستخدم المخصص إن وُجد، بلا تنقل بين القوائم المنسدلة ولا تغيير في فلاتر الصفحة.
     * إن تعذّر ذلك نقرأ جداول الصفحة (أبطأ، أسماء وأكواد فقط).
     */
    async function exportClassLists() {
        try {
            try { window.neprasResetGlobalStop?.(); } catch (_) {}
            stopRequested = false;
            const records = window.NeprasRecords;
            if (records && typeof records.runTwoColumnClassListsExport === 'function') {
                try {
                    const res = await records.runTwoColumnClassListsExport();
                    if (res && res.ok !== false) { addLog('✅ تم تنزيل قوائم فصول المدرسة (عامودين)', 'success'); return; }
                } catch (apiErr) {
                    const msg = apiErr && apiErr.message ? apiErr.message : String(apiErr);
                    if (/إلغاء|إيقاف/.test(msg)) { addLog('⏹ تم إيقاف تنزيل القوائم', 'warn'); return; }
                    addLog(`⚠️ تعذّر تنزيل القوائم من الواجهة البرمجية (${msg}) — نقرأ جداول الصفحة بدلًا منها`, 'warn');
                }
            }
            if (busy) { showToast('⚠️ توجد عملية تسكين جارية', 'warning'); return; }
            setBusyUI(true);
            try {
                showToast('📄 جاري قراءة قوائم الفصول من الصفحة...', 'loading');
                const res = await exportClassListsFromPage();
                addLog(`✅ تم تنزيل قوائم الفصول (${res.count} طالب في ${res.sheets} فصل)`, 'success');
            } finally {
                setBusyUI(false);
            }
        } catch (err) {
            handleError(err, 'exportClassLists');
        }
    }

    async function exportClassListsOnly() {
        await exportClassLists();
    }

    async function exportOperationLog() {
        try {
            const viewer = document.getElementById('aa-logviewer');
            if (!viewer) return;
            const lines = Array.from(viewer.querySelectorAll('.nepras-aa-log-line')).map(l => l.innerText);
            const content = [
                `سجل عملية نبراس - التسكين والتوزيع`,
                `تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}`,
                `--------------------------------------------------`,
                ...lines
            ].join('\n');

            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const rawLogName = `سجل_عملية_التسكين_${NeprasEgypt.todayStamp()}.txt`;
            if (window.neprasDialog?.triggerDownload) {
                await window.neprasDialog.triggerDownload(blob, rawLogName, { registerSuccess: false, folder: 'التسكين والتوزيع' });
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = rawLogName;
                a.click();
                URL.revokeObjectURL(url);
            }
            showToast('✅ تم تصدير سجل العملية', 'success');
        } catch (err) {
            handleError(err, 'exportOperationLog');
        }
    }

    /////////////////////////////
    // 🔄 RESET & TOGGLE
    /////////////////////////////
    function resetUI() {
        if (busy) { showToast('⚠️ أوقف العملية الجارية أولًا', 'warning'); return; }
        stats = { totalPlanned: 0, processed: 0, successes: 0, errors: 0, startTime: null };
        lastRun = null;
        excelRows = [];
        excelHeaders = [];
        headers = { code: '', targetClass: '', level: '' };
        stopRequested = false;
        pauseRequested = false;
        setProgress(0, 'تمت إعادة التعيين');
        updateStatsUI();

        const logViewer = document.getElementById('aa-logviewer');
        if (logViewer) {
            logViewer.textContent = '';
            const head = document.createElement('div');
            head.className = 'n-panel__log-head';
            const t1 = document.createElement('span'); t1.textContent = 'سجل العمليات';
            const t2 = document.createElement('span'); t2.textContent = `المحرك ${SCRIPT_VERSION}`;
            head.append(t1, t2);
            logViewer.appendChild(head);
        }

        if (neprasPanel) { neprasPanel.actionButtons['aa-export'].hidden = true; neprasPanel.actionButtons['aa-reset'].hidden = true; }
        const fileInput = document.getElementById('excelFileAA');
        if (fileInput) fileInput.value = '';

        ['col-student', 'col-class', 'col-level'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '';
                const opt = document.createElement('option'); opt.textContent = 'ارفع الملف أولاً';
                el.appendChild(opt); el.disabled = true;
            }
        });
        refreshFileSummary();

        addLog('تمت إعادة ضبط الواجهة', 'info');
    }

    function togglePause() {
        const btn = document.getElementById('aa-pause');
        if (!pauseRequested) {
            pauseRequested = true;
            if (btn) { window.NeprasButtons.setIcon(btn, 'play'); window.NeprasButtons.setLabel(btn, 'استئناف'); }
            addLog('تم إيقاف العملية مؤقتًا', 'info');
        } else {
            pauseRequested = false;
            if (btn) { window.NeprasButtons.setIcon(btn, 'stop'); window.NeprasButtons.setLabel(btn, 'إيقاف مؤقت'); }
            addLog('تم استئناف العملية', 'info');
        }
    }

    function toggleMinimize() {
        if (!neprasPanel) return;
        neprasPanel.setMinimized(!neprasPanel.isMinimized());
    }

    /////////////////////////////
    // 🌐 PUBLIC API & LISTENERS
    /////////////////////////////
    window.neprasAutoAssign = {
        openUI: () => buildUI(),
        closeUI: () => { neprasPanel?.hide(); },
        toggleUI: () => { neprasPanel ? neprasPanel.toggle() : buildUI(); },
        exportClassListsOnly,
        startAssignment: () => runFlow(false),
        previewAssignment: () => runFlow(true),
        resetUI
    };

    // الاستماع لرسائل Chrome Runtime
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
                if (!msg || typeof msg !== 'object') return;
                if (msg.action === 'NEPRAS_AUTO_ASSIGN_OPEN') {
                    buildUI();
                    sendResponse?.({ ok: true });
                } else if (msg.action === 'NEPRAS_AUTO_ASSIGN_EXPORT_CLASSES') {
                    exportClassListsOnly();
                    sendResponse?.({ ok: true });
                }
            });
        }
    } catch (_) {}

    // الاستماع لرسائل Window postMessage
    window.addEventListener('message', (event) => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        if (!event.data || typeof event.data !== 'object') return;
        if (event.data.action === 'NEPRAS_AUTO_ASSIGN_OPEN') {
            buildUI();
        } else if (event.data.action === 'NEPRAS_AUTO_ASSIGN_EXPORT_CLASSES') {
            exportClassListsOnly();
        }
    });

    logToConsole('تم تهيئة موديل التسكين بنجاح دون تعارض جاهز للاستدعاء.');

})();
