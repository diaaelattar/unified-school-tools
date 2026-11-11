// ============================================================
//  [نبراس] وحدة «منقّي أسماء الطلاب». أصلها إضافة مستقلة (v2.9) دُمجت في نبراس 1.2.78.
//  الفروق عن الإضافة المستقلة (كل ما عداها مطابق للأصل):
//   1) يُحقن من background.js (neprasInjectSiteTools) على student.emis.gov.eg فقط، لا عبر content_scripts.
//   2) حارس تحميل واحد (__NEPRAS_NAME_FIXER_LOADED__) يمنع التكرار.
//   3) سجل العمليات يمرّ عبر الخلفية (NEPRAS_NAME_FIXER_LOG): نبراس يضبط storage.session على TRUSTED_CONTEXTS
//      لحماية رؤوس Authorization، فلا يصل إليها سكربت الصفحة. السجل يبقى في الجلسة فقط (لا يُكتب على القرص).
//   4) اللوحة لا تُنشأ تلقائيًا في كل صفحة طالب؛ تظهر عند NEPRAS_NAME_FIXER_SHOW (زر نافذة نبراس)،
//      أو تلقائيًا إن كانت هناك تنقية جارية / متوقفة بانتظار تدخل يدوي.
//   5) رسالتان من الخلفية: NEPRAS_NAME_FIXER_SHOW و NEPRAS_NAME_FIXER_STOP («إيقاف كل العمليات»).
//      الاسمان القديمان NAME_FIXER_OPEN و STOP_NAME_FIXER، واسم السجل القديم NEPRAS_NF_LOG، ما زالت مقبولة.
//   6) نصوص زر/رسالة نسخ الأكواد من الجدول عُدّلت لتوافق قاموس نبراس (ui/terms.ar.js).
// ============================================================

// ============================================================
//  منقّي أسماء الطلاب (أصل الكود: الإصدار 2.9)
//  المطور الأصلي : م. ضياء العطار
//
//  سجل تحديثات الإصدارات من v2.4 إلى v2.9: docs/name-fixer-changelog.md
// ============================================================

(async function () {
    'use strict';

    // [نبراس] منع التحميل المزدوج داخل نفس الصفحة (isolated world مشترك بين عمليات الحقن).
    if (globalThis.__NEPRAS_NAME_FIXER_LOADED__) return;
    globalThis.__NEPRAS_NAME_FIXER_LOADED__ = true;

    // رقم واحد للإضافة كلها (من المانيفست). سجل إصدارات المنقّي القديمة (v2.4 إلى v2.9) في docs/name-fixer-changelog.md.
    const VER = (() => { try { return 'v' + chrome.runtime.getManifest().version; } catch (_) { return ''; } })();

    const CONFIG = {
        WAIT_SHORT         : 800,
        WAIT_MED           : 1500,
        WAIT_LONG          : 3000,
        EDIT_WAIT_MAX      : 18000,
        EDIT_RETRY_INTERVAL: 1000,
        TARGET_TABLE_ROWS  : 2000,
        MAX_AUTO_RETRY     : 3,
        NAME_FORM_CONTROLS: ['firstname', 'fathername', 'gfathername', 'familyname'],
        LOG_MAX_ENTRIES   : 2000,
        MOBILE_REGEX      : /^01[0125][0-9]{8}$/,
        // تليفون أرضي: مفتاح المحافظة + الرقم (02 + 8 أرقام / 03 + 7 / 013 أو 04x..09x + 7)
        LANDLINE_REGEX    : /^0(?:2[0-9]{8}|3[0-9]{7}|(?:13|[4-9][0-9])[0-9]{7})$/,
        MANUAL_WAIT_SEC   : 180,
        SAVE_ERROR_WAIT_SEC: 15,
        LANG1_OPTIONS: [
            { value: '1', text: 'لغة انجليزية' }, { value: '2', text: 'لغة فرنسية' },
            { value: '3', text: 'لغة المانية' },  { value: '4', text: 'لغة ايطالية' },
            { value: '5', text: 'لغة اسبانية' },  { value: '6', text: 'لغة صينية' },
            { value: '8', text: 'لغة روسية' },    { value: '9', text: 'لغة يابانية' }
        ],
        LANG2_OPTIONS: [
            { value: '7', text: 'معفي' },
            { value: '2', text: 'لغة فرنسية' }, { value: '3', text: 'لغة المانية' },
            { value: '4', text: 'لغة ايطالية' }, { value: '5', text: 'لغة اسبانية' },
            { value: '6', text: 'لغة صينية' },   { value: '8', text: 'لغة روسية' },
            { value: '9', text: 'لغة يابانية' }, { value: '1', text: 'لغة انجليزية' }
        ],
        DISABILITY_OPTIONS: [
            { value: '-1', text: 'اختر--' },
            { value: '0',  text: 'لا يوجد' },
            { value: '1',  text: 'إعاقه بصرية' },
            { value: '2',  text: 'إعاقه سمعية' },
            { value: '3',  text: 'إعاقه ذهنية' },
            { value: '4',  text: 'شلل دماغى' },
            { value: '5',  text: 'توحد' },
            { value: '6',  text: 'متلازمة داون' },
            { value: '7',  text: 'إعاقه حركية' },
            { value: '8',  text: 'بطء التعلم' }
        ],
        DIVISION_OPTIONS: [
            { value: '1',   text: 'عام' },
            { value: '2',   text: 'ادبي' },
            { value: '3',   text: 'علمي' },
            { value: '203', text: 'بكالوريا مسار الطب وعلوم الحياة' },
            { value: '204', text: 'بكالوريا مسار الهندسة وعلوم الحاسب' },
            { value: '205', text: 'بكالوريا مسار الاعمال' },
            { value: '206', text: 'بكالوريا مسار الادب والفنون' }
        ],
        SPECIALIZATION_OPTIONS: [
            { value: '1',   text: 'عام' },
            { value: '676', text: 'مسار الطب وعلوم الحياة (676)' },
            { value: '677', text: 'مسار الهندسة وعلوم الحاسب (677)' },
            { value: '678', text: 'مسار الاعمال (678)' },
            { value: '679', text: 'مسار الادب والفنون (679)' }
        ],
        REG_STATUS_OPTIONS: [
            { value: '1',  text: 'ناجح ومنقول' },
            { value: '2',  text: 'راسب وباق للاعادة' },
            { value: '4',  text: 'منقطع' },
            { value: '8',  text: 'استبعاد للوفاه' },
            { value: '9',  text: 'تحويل مسار' },
            { value: '13', text: 'التحويل للتعليم الازهرى' }
        ],
        SELECTORS: {
            STUDENT_LINK    : 'a[href*="/student/edit/"], a[href*="/Student/edit/"]',
            FORM_INPUTS     : 'input:not([type="hidden"]), select, textarea',
            SEARCH_BTN_TEXT : 'بحث',
            SAVE_BTN_REGEX  : /^(حفظ|حفظ التعديلات|تحديث البيانات|تحديث|Update|Save)$/i,
            PAGE_SIZE_SELECT: 'select[name*="length"], select[name*="pageLength"], select[aria-label*="rows per page"], select[data-length], .dataTables_length select'
        }
    };

    // ─────────────────────────────────────────
    // 2. التخزين
    // ─────────────────────────────────────────
    const Store = {
        async get(key, def = null) {
            return new Promise(r => chrome.storage.local.get([key], res =>
                r(res[key] !== undefined ? res[key] : def)));
        },
        async set(key, val) {
            return new Promise(r => chrome.storage.local.set({ [key]: val }, r));
        },
        async delete(key) {
            return new Promise(r => chrome.storage.local.remove([key], r));
        },
        async clearAll() {
            const PROGRESS_KEYS = [
                'nf_running', 'nf_target_codes', 'nf_current_index',
                'nf_failed_codes', 'nf_fixed_count', 'nf_batch_size',
                'nf_batch_start_index', 'nf_list_page_url',
                'nf_auto_retry_count', 'nf_start_time', 'nf_target_level_val',
                'nf_paused_banner', 'nf_excel_student_map'
            ];
            return new Promise(r => chrome.storage.local.remove(PROGRESS_KEYS, r));
        }
    };

    // ─────────────────────────────────────────
    // 2ب. سجل العمليات
    // ─────────────────────────────────────────
    // حوار نبراس الموحّد بدل confirm() الأصلي؛ يرجع إلى الأصلي إن لم يُحمَّل.
    async function nfConfirm(message) {
        try {
            if (window.neprasDialog && typeof window.neprasDialog.confirm === 'function') {
                return !!(await window.neprasDialog.confirm(message));
            }
        } catch (_) {}
        return window.confirm(message);
    }

    const Log = {
        STATUS_LABELS: {
            fixed                 : '✏️ تم التصحيح',
            clean                 : '✅ نظيف بالفعل',
            skipped               : '⏭️ تم التخطي يدويًا',
            no_name_fields        : '⚠️ لم يُعثر على حقول اسم',
            save_button_missing   : '⚠️ صُحِّح محليًا لكن لم يُحفظ',
            load_failed           : '❌ فشل تحميل النموذج',
            paused_class_empty    : '⏸ توقف — الفصل فارغ',
            paused_address_invalid: '⏸ توقف — العنوان غير صحيح',
            paused_contact_invalid: '⏸ توقف — تليفون/محمول غير صحيح',
            skipped_save_error    : '⏭️ تم التخطي — خطأ أثناء الحفظ',
            lang_spec_fixed       : '🌐 تم تعديل اللغات/التخصص/الدمج',
            division_disabled     : 'ℹ️ الشعبة معطلة بالصف',
            spec_disabled         : 'ℹ️ التخصص معطل بالصف'
        },
        LOG_MAX_ENTRIES: 2000,   // يُطبَّق في الخلفية (NEPRAS_NAME_FIXER_LOG)
        _mem: [],                // احتياطي في ذاكرة الصفحة إن تعذّرت الخلفية (يضيع عند تغيير الصفحة)

        // [نبراس] السجل فيه أكواد وأسماء طلاب ← يبقى في storage.session فقط (لا قرص).
        // نبراس يضبط storage.session على TRUSTED_CONTEXTS فلا يصله هذا السكربت، لذا نمرّر كل شيء للخلفية.
        async _relay(op, payload = {}) {
            try {
                const res = await chrome.runtime.sendMessage({ action: 'NEPRAS_NAME_FIXER_LOG', op, ...payload });
                if (res && res.ok === true) return res;
            } catch (_) { /* الخلفية غير متاحة */ }
            return null;
        },

        async _read() {
            const res = await this._relay('get');
            if (res && Array.isArray(res.entries)) return res.entries;
            return this._mem.slice();
        },

        async add(entry) {
            const full = { time: new Date().toISOString(), ...entry };
            const res = await this._relay('add', { entry: full });
            if (!res) {
                this._mem.push(full);
                if (this._mem.length > this.LOG_MAX_ENTRIES) {
                    this._mem.splice(0, this._mem.length - this.LOG_MAX_ENTRIES);
                }
            }
        },

        async getAll() {
            const arr = await this._read();
            return arr.slice().reverse();
        },

        async clear() {
            this._mem = [];
            await this._relay('clear');
        },

        async buildCSV() {
            const arr = await this._read();
            const rows = [['الوقت', 'كود الطالب', 'الحالة', 'الحقل', 'القيمة قبل', 'القيمة بعد']];
            arr.forEach(e => {
                const label = this.STATUS_LABELS[e.status] || e.status;
                if (e.changes && e.changes.length) {
                    e.changes.forEach(c =>
                        rows.push([e.time, e.code, label, c.label || c.field, c.before, c.after]));
                } else if (e.checked && e.checked.length) {
                    e.checked.forEach(c =>
                        rows.push([e.time, e.code, label, c.label || c.field, c.value, c.value]));
                } else {
                    rows.push([e.time, e.code, label, e.note || '', '', '']);
                }
            });
            return rows.map(r =>
                r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
            ).join('\r\n');
        }
    };

    // ─────────────────────────────────────────
    // 3. أدوات مساعدة
    // ─────────────────────────────────────────
    const Utils = {
        sleep: ms => new Promise(r => setTimeout(r, ms)),

        escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c =>
                ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        },

        extractStudentId(url) {
            if (!url) return null;
            const m = url.match(/edit\/([^/?#]+)/i);
            return m ? m[1].toLowerCase() : url.toLowerCase();
        },

        findInputByLabelText(text) {
            for (const lbl of document.querySelectorAll('label')) {
                if (lbl.textContent.trim().includes(text)) {
                    const inp = lbl.parentElement?.querySelector('input, select');
                    if (inp) return inp;
                }
            }
            return null;
        },

        setInputValueAngular(el, val) {
            if (!el) return;
            try {
                const proto = Object.getPrototypeOf(el);
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (nativeSetter) nativeSetter.call(el, val);
                else el.value = val;
            } catch (_) { el.value = val; }
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur',   { bubbles: true }));
        },

        setAngularSelectValue(el, val) {
            if (!el) return;
            const strVal = String(val ?? '').trim();
            try {
                const proto = Object.getPrototypeOf(el);
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (nativeSetter) nativeSetter.call(el, strVal);
                else el.value = strVal;
            } catch (_) { el.value = strVal; }
            const opt = Array.from(el.options || []).find(o => String(o.value).trim() === strVal);
            if (opt) {
                opt.selected = true;
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('blur',   { bubbles: true }));
        },

        resolveDisabilityCode(val) {
            if (val == null) return '';
            const raw = String(val).trim();
            if (!raw) return '';
            // تطابق مباشر مع الكود الرقمي (0 إلى 8)
            const byCode = CONFIG.DISABILITY_OPTIONS.find(o => o.value === raw);
            if (byCode) return byCode.value;

            const clean = raw.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
            if (/سليم|غير دمج|بدون دمج|عادي|لا يوجد/.test(clean)) return '0';
            // قائمة خيارات صفحة الوزارة الرسمية (disabilityId من 0 إلى 8):
            // 1: إعاقه بصرية
            if (/بصري|بصريه|كفيف|مكفوف|ضعاف البصر|ضعيف البصر/.test(clean)) return '1';
            // 2: إعاقه سمعية
            if (/سمعي|سمعيه|صم|اصم|ضعاف السمع|ضعيف السمع/.test(clean)) return '2';
            // 3: إعاقه ذهنية
            if (/ذهني|ذهنيه|فكر|عقلي/.test(clean)) return '3';
            // 4: شلل دماغى
            if (/شلل دماغي|شلل دماغى/.test(clean)) return '4';
            // 5: توحد
            if (/توحد|طيف/.test(clean)) return '5';
            // 6: متلازمة داون
            if (/داون|منغولي/.test(clean)) return '6';
            // 7: إعاقه حركية
            if (/حركي|حركيه|شلل اطفال|بتر/.test(clean)) return '7';
            // 8: بطء التعلم
            if (/بطء|بطي|صعوبات تعلم|تشتت/.test(clean)) return '8';

            const match = CONFIG.DISABILITY_OPTIONS.find(o =>
                o.text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').includes(clean)
            );
            return match ? match.value : '';
        },

        resolveLanguageCode(val, isLang2 = false) {
            if (val == null) return '';
            const raw = String(val).trim();
            if (!raw) return '';
            const opts = isLang2 ? CONFIG.LANG2_OPTIONS : CONFIG.LANG1_OPTIONS;
            const byCode = opts.find(o => o.value === raw);
            if (byCode) return byCode.value;

            const clean = raw.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
            
            // خيارات بوابة وزارة التربية والتعليم الرسمية:
            // 1 = إنجليزية، 2 = فرنسية، 3 = ألمانية، 4 = إيطالية، 5 = أسبانية، 6 = صينية، 7 = معفي (للغة 2)، 8 = روسية، 9 = يابانية
            if (isLang2 && /لا توجد|بدون|لا يوجد|معفي|اعفاء|معفى/.test(clean)) return '7';
            if (/عربي/.test(clean) && !isLang2) return '1';
            if (/انجليز|انكليز|english|eng/.test(clean)) return '1';
            if (/فرنس|فرنساوي|french|fren/.test(clean)) return '2';
            if (/المان|deutsch|german|germ/.test(clean)) return '3';
            if (/ايطال|italian|ital/.test(clean)) return '4';
            if (/اسبان|spanish|span/.test(clean)) return '5';
            if (/صين|chinese|chin/.test(clean)) return '6';
            if (/روس|russian|russ/.test(clean)) return '8';
            if (/يابان|japanese|japan/.test(clean)) return '9';

            const match = opts.find(o =>
                o.text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').includes(clean)
            );
            return match ? match.value : '';
        },

        resolveDivisionCode(val) {
            if (val == null) return '';
            const raw = String(val).trim();
            if (!raw) return '';
            const byCode = CONFIG.DIVISION_OPTIONS.find(o => o.value === raw);
            if (byCode) return byCode.value;

            const clean = raw.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
            if (/علوم/.test(clean)) return '4';
            if (/رياض/.test(clean)) return '5';
            if (/لغات/.test(clean)) return '6';
            if (/ادبي/.test(clean)) return '2';
            if (/علمي/.test(clean)) return '3';
            if (/عام/.test(clean)) return '1';

            const match = CONFIG.DIVISION_OPTIONS.find(o =>
                o.text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').includes(clean)
            );
            return match ? match.value : '';
        },

        resolveSpecializationCode(val) {
            if (val == null) return '';
            const raw = String(val).trim();
            if (!raw) return '';
            const byCode = CONFIG.SPECIALIZATION_OPTIONS.find(o => o.value === raw);
            if (byCode) return byCode.value;

            const clean = raw.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
            if (/علوم/.test(clean)) return '3';
            if (/رياض/.test(clean)) return '4';
            if (/لغات/.test(clean)) return '5';
            if (/ادبي/.test(clean)) return '2';
            if (/عام/.test(clean)) return '1';

            const match = CONFIG.SPECIALIZATION_OPTIONS.find(o =>
                o.text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').includes(clean)
            );
            return match ? match.value : '';
        },

        cleanDigitString(val) {
            if (val === undefined || val === null) return '';
            let s = String(val).trim();
            s = s.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
                 .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
            s = s.replace(/\.0+$/, '');
            return s.replace(/[\s,]/g, '');
        },

        parseExcelStudentMap(rows) {
            if (!Array.isArray(rows) || rows.length === 0) return {};
            const map = {};

            const normKey = (s) => String(s || '').trim()
                .replace(/[\u064B-\u065F]/g, '')
                .replace(/[إأآا]/g, 'ا')
                .replace(/ى/g, 'ي')
                .replace(/ة/g, 'ه')
                .toLowerCase();

            const isMatrix = Array.isArray(rows[0]);

            if (isMatrix) {
                let headerRowIdx = -1;
                const colIndices = {
                    code: -1, nid: -1, name: -1, damg: -1,
                    lang1: -1, lang2: -1, div: -1, spec: -1
                };

                // 1) البحث عن صف الرؤوس بالكلمات المفتاحية دون تقييد متزمت لطول الخلية
                for (let r = 0; r < Math.min(rows.length, 15); r++) {
                    const row = rows[r];
                    if (!Array.isArray(row)) continue;
                    const nonEmpty = row.filter(c => String(c || '').trim().length > 0);
                    if (nonEmpty.length < 2) continue; // تخطي صفوف العناوين الترويسية الفردية

                    let hasIdHeader = false;
                    for (let c = 0; c < row.length; c++) {
                        const cell = normKey(row[c]);
                        if (cell.includes('كود') || cell.includes('code') || cell.includes('student') || cell.includes('id') || cell.includes('جلوس') ||
                            cell.includes('قوم') || cell.includes('national') || cell.includes('nid')) {
                            hasIdHeader = true;
                            break;
                        }
                    }
                    if (hasIdHeader) {
                        headerRowIdx = r;
                        for (let c = 0; c < row.length; c++) {
                            const cell = normKey(row[c]);
                            if (colIndices.code === -1 && (cell.includes('كود') || cell.includes('code') || cell.includes('student') || cell.includes('id') || cell.includes('جلوس'))) {
                                colIndices.code = c;
                            } else if (colIndices.nid === -1 && (cell.includes('قوم') || cell.includes('national') || cell.includes('nid'))) {
                                colIndices.nid = c;
                            } else if (colIndices.name === -1 && (cell.includes('اسم') || cell.includes('name') || cell.includes('طالب') || cell.includes('تلميذ'))) {
                                colIndices.name = c;
                            } else if (colIndices.damg === -1 && (cell.includes('دمج') || cell.includes('اعاق') || cell.includes('تربي') || cell.includes('disability') || cell.includes('damg'))) {
                                colIndices.damg = c;
                            } else if (colIndices.lang1 === -1 && (cell.includes('اولي') || cell.includes('اولى') || cell.includes('lang1') || cell.includes('لغه 1') || cell.includes('لغة 1'))) {
                                colIndices.lang1 = c;
                            } else if (colIndices.lang2 === -1 && (cell.includes('ثاني') || cell.includes('lang2') || cell.includes('لغه 2') || cell.includes('لغة 2'))) {
                                colIndices.lang2 = c;
                            } else if (colIndices.div === -1 && (cell.includes('شعب') || cell.includes('division') || cell.includes('section'))) {
                                colIndices.div = c;
                            } else if (colIndices.spec === -1 && (cell.includes('تخصص') || cell.includes('specialization') || cell.includes('spec'))) {
                                colIndices.spec = c;
                            }
                        }
                        break;
                    }
                }

                // 2) استنتاج قيمي ذكي (Value-based deduction) لأي عمود لم يتحدد من الترويسة أو في حال غياب الترويسة
                const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
                for (let r = startRow; r < Math.min(rows.length, startRow + 20); r++) {
                    const row = rows[r];
                    if (!Array.isArray(row)) continue;
                    for (let c = 0; c < row.length; c++) {
                        const val = String(row[c] || '').trim();
                        if (!val) continue;
                        const cleanDigits = Utils.cleanDigitString(val);
                        
                        if (colIndices.code === -1 && cleanDigits.length >= 6 && cleanDigits.length <= 10 && /^[0-9]+$/.test(cleanDigits)) {
                            colIndices.code = c;
                        } else if (colIndices.nid === -1 && cleanDigits.length === 14 && /^[0-9]{14}$/.test(cleanDigits)) {
                            colIndices.nid = c;
                        }
                        if (colIndices.damg === -1 && !/^[0-9]+$/.test(val) && Utils.resolveDisabilityCode(val) !== null) {
                            colIndices.damg = c;
                        }
                    }
                }

                for (let r = startRow; r < rows.length; r++) {
                    const row = rows[r];
                    if (!Array.isArray(row) || row.length === 0) continue;

                    let rawCode = colIndices.code >= 0 ? row[colIndices.code] : '';
                    let rawNid  = colIndices.nid >= 0 ? row[colIndices.nid] : '';
                    let rawName = colIndices.name >= 0 ? row[colIndices.name] : '';
                    let rawDamg = colIndices.damg >= 0 ? row[colIndices.damg] : '';
                    let rawL1   = colIndices.lang1 >= 0 ? row[colIndices.lang1] : '';
                    let rawL2   = colIndices.lang2 >= 0 ? row[colIndices.lang2] : '';
                    let rawDiv  = colIndices.div >= 0 ? row[colIndices.div] : '';
                    let rawSpec = colIndices.spec >= 0 ? row[colIndices.spec] : '';

                    // فحص بديل ذكي لكل خلية بالصف في حال كانت الأعمدة مختلفة
                    if (!rawDamg) {
                        for (let c = 0; c < row.length; c++) {
                            if (c === colIndices.code || c === colIndices.nid || c === colIndices.name) continue;
                            const v = String(row[c] || '').trim();
                            if (v && Utils.resolveDisabilityCode(v) !== null) {
                                rawDamg = v;
                                break;
                            }
                        }
                    }
                    if (!rawCode && !rawNid) {
                        for (let c = 0; c < row.length; c++) {
                            const cd = Utils.cleanDigitString(row[c]);
                            if (cd.length === 14 && /^[0-9]{14}$/.test(cd)) { rawNid = cd; break; }
                            if (cd.length >= 6 && cd.length <= 10 && /^[0-9]+$/.test(cd)) { rawCode = cd; break; }
                        }
                    }

                    const code = Utils.cleanDigitString(rawCode);
                    const nid  = Utils.cleanDigitString(rawNid);
                    const name = String(rawName ?? '').trim();
                    const damg = Utils.resolveDisabilityCode(rawDamg);

                    if (!code && !nid) continue;

                    const entry = {
                        studentCode: code,
                        nationalId: nid,
                        fullName: name,
                        lang1: Utils.resolveLanguageCode(rawL1, false),
                        lang2: Utils.resolveLanguageCode(rawL2, true),
                        damg: damg,
                        division: Utils.resolveDivisionCode(rawDiv),
                        specialization: Utils.resolveSpecializationCode(rawSpec)
                    };

                    if (code && code.length >= 5 && /^[0-9]+$/.test(code)) map[code] = entry;
                    if (nid && /^[0-9]{14}$/.test(nid)) map[nid] = entry;
                }
            } else {
                for (const row of rows) {
                    if (!row || typeof row !== 'object') continue;
                    let code = '', nid = '', l1 = '', l2 = '', damg = '', div = '', spec = '', name = '';

                    for (const [k, v] of Object.entries(row)) {
                        const lk = k.trim().toLowerCase();
                        const ak = normKey(k);
                        const valStr = String(v ?? '').trim();

                        if (ak.includes('كود') || lk.includes('code') || lk.includes('student') || ak.includes('جلوس')) {
                            code = Utils.cleanDigitString(valStr);
                        } else if (ak.includes('قوم') || lk.includes('national') || lk.includes('nid')) {
                            nid = Utils.cleanDigitString(valStr);
                        } else if (ak.includes('اسم') || lk.includes('name')) {
                            name = valStr;
                        } else if (ak.includes('اولي') || ak.includes('اولى') || lk.includes('lang1') || ak.includes('لغه 1') || ak.includes('لغة 1')) {
                            l1 = valStr;
                        } else if (ak.includes('ثاني') || lk.includes('lang2') || ak.includes('لغه 2') || ak.includes('لغة 2')) {
                            l2 = valStr;
                        } else if (ak.includes('دمج') || ak.includes('اعاق') || ak.includes('تربي') || lk.includes('disability') || lk.includes('damg')) {
                            damg = valStr;
                        } else if (ak.includes('شعب') || lk.includes('division') || lk.includes('section')) {
                            div = valStr;
                        } else if (ak.includes('تخصص') || lk.includes('specialization') || lk.includes('spec')) {
                            spec = valStr;
                        } else {
                            // فحص قيمة الحقل المباشرة
                            if (!damg && Utils.resolveDisabilityCode(valStr) !== null) damg = valStr;
                            if (!code && !nid) {
                                const cd = Utils.cleanDigitString(valStr);
                                if (cd.length === 14 && /^[0-9]{14}$/.test(cd)) nid = cd;
                                else if (cd.length >= 6 && cd.length <= 10 && /^[0-9]+$/.test(cd)) code = cd;
                            }
                        }
                    }

                    const resolvedDamg = Utils.resolveDisabilityCode(damg);
                    const entry = {
                        studentCode: code,
                        nationalId: nid,
                        fullName: name,
                        lang1: Utils.resolveLanguageCode(l1, false),
                        lang2: Utils.resolveLanguageCode(l2, true),
                        damg: resolvedDamg,
                        division: Utils.resolveDivisionCode(div),
                        specialization: Utils.resolveSpecializationCode(spec)
                    };

                    if (code && code.length >= 5 && /^[0-9]+$/.test(code)) map[code] = entry;
                    if (nid && /^[0-9]{14}$/.test(nid)) map[nid] = entry;
                }
            }
            return map;
        },

        buildLangSpecDamgTemplate() {
            return [
                {
                    'كود الطالب': '123456789',
                    'كود التلميذ': '123456789',
                    'اسم الطالب': 'اسم الطالب (اختياري)',
                    'الموقف من الدمج': 'إعاقه حركية (أو: إعاقه بصرية / سمعية / ذهنية / لا يوجد)',
                    'اللغة الأولى': 'لغة انجليزية',
                    'اللغة الثانية': 'لغة فرنسية'
                }
            ];
        },

        findLabelForInput(el) {
            if (el.id) {
                const forLbl = document.querySelector(`label[for="${el.id}"]`);
                if (forLbl && forLbl.textContent.trim()) return forLbl.textContent.trim();
            }
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
            const labelledBy = el.getAttribute('aria-labelledby');
            if (labelledBy) {
                const lblEl = document.getElementById(labelledBy);
                if (lblEl && lblEl.textContent.trim()) return lblEl.textContent.trim();
            }
            let node = el.parentElement;
            for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
                const lblEl = node.querySelector('label, mat-label, .label, .form-label, .col-form-label');
                if (lblEl && lblEl.textContent.trim()) return lblEl.textContent.trim();
                if (node.matches?.('tr, form, .form-group, .row')) break;
            }
            return el.placeholder || el.getAttribute('formcontrolname') || el.name || el.id || '';
        },

        // ── تنقية الأسماء العربية ──
        normalizeArabicName(text) {
            if (!text) return text;
            const NON_JOINING_LETTERS = ['ا', 'د', 'ذ', 'ر', 'ز', 'و'];
            let tokens = text.split(/\s+/).filter(Boolean).map(tok => {
                let t = tok;
                t = t.replace(/^[إأٱآ]/, 'ا');
                t = t.replace(/ة/g, 'ه');
                if (t.endsWith('ي')) t = t.slice(0, -1) + 'ى';
                return t;
            });
            const merged = [];
            for (let i = 0; i < tokens.length; i++) {
                const cur      = tokens[i];
                const next     = tokens[i + 1];
                const lastChar = cur.slice(-1);
                if (next && /^ال/.test(next) && NON_JOINING_LETTERS.includes(lastChar)) {
                    merged.push(cur + next); i++;
                } else {
                    merged.push(cur);
                }
            }
            return merged.join(' ').trim();
        },

        // ── فحص صحة العنوان ──
        // العنوان الصحيح يجب أن:
        //   • يكون غير فارغ
        //   • لا يكون أرقاماً فقط (0 / 000 / 15 ...)
        //   • لا يكون رموزاً فقط (--- / ؟؟؟ / !!! ...)
        //   • يحتوي على حرف واحد على الأقل (عربي أو إنجليزي)
        // الأرقام مسموحة بشرط وجود نص معها (مثل: "شارع الجمهورية 15").
        isValidAddress(text) {
            if (text == null) return false;
            const t = String(text).trim();
            if (!t) return false;
            // أرقام فقط (عربية أو إنجليزية)
            if (/^[0-9٠-٩]+$/.test(t)) return false;
            // يجب أن يحتوي على حرف واحد على الأقل (عربي أو لاتيني).
            // \p{L} لا النطاق \u0600-\u06FF: هذا النطاق يضم علامات الترقيم العربية (؟ ، ؛) والأرقام الفارسية فكانت «؟؟؟» تُعدّ عنوانًا سليمًا.
            if (!/\p{L}/u.test(t)) return false;
            return true;
        },

        // ── أسباب عدم صحة العنوان / التليفون / المحمول (نص فارغ = سليم أو غير مُدخَل) ──
        addressProblem(text) {
            const t = String(text == null ? '' : text).trim();
            if (!t || Utils.isValidAddress(t)) return '';
            return /^[0-9٠-٩]+$/.test(t)
                ? 'العنوان أرقام فقط (مثل "0") — اكتب اسم الشارع أو المنطقة'
                : 'العنوان رموز فقط بدون حروف';
        },

        landlineProblem(text) {
            const t = String(text == null ? '' : text).trim();
            if (!t) return '';
            if (/[٠-٩]/.test(t)) return 'يحتوي أرقامًا عربية — اكتبه بأرقام إنجليزية';
            if (!/^[0-9]+$/.test(t)) return 'يحتوي مسافات أو رموزًا غير الأرقام';
            if (/^0+$/.test(t)) return 'الرقم كله أصفار';
            if (!/^0[2-9]|^013/.test(t)) return 'لا يبدأ بمفتاح المحافظة (مثل 02 للقاهرة والجيزة)';
            return CONFIG.LANDLINE_REGEX.test(t) ? '' : 'عدد الأرقام لا يناسب مفتاح المحافظة';
        },

        mobileProblem(text) {
            const t = String(text == null ? '' : text).trim();
            if (!t) return '';
            if (/[٠-٩]/.test(t)) return 'يحتوي أرقامًا عربية — اكتبه بأرقام إنجليزية';
            if (!/^[0-9]+$/.test(t)) return 'يحتوي مسافات أو رموزًا غير الأرقام';
            if (/^0+$/.test(t)) return 'الرقم كله أصفار';
            return CONFIG.MOBILE_REGEX.test(t) ? '' : 'غير متوافق — يجب 11 رقمًا ويبدأ بـ 010 أو 011 أو 012 أو 015';
        },

        isNameField(label) { return /اسم|لقب/.test(label || ''); },

        isNameFormControl(el) {
            const ctrl = (el.getAttribute('formcontrolname') || '').trim().toLowerCase();
            return !!ctrl && CONFIG.NAME_FORM_CONTROLS.includes(ctrl);
        },

        formatDuration(ms) {
            if (ms < 0 || !isFinite(ms)) return '--:--';
            const s  = Math.floor(ms / 1000);
            const m  = Math.floor(s / 60);
            const h  = Math.floor(m / 60);
            if (h > 0) return `${h}س ${m % 60}د`;
            if (m > 0) return `${m}د ${s % 60}ث`;
            return `${s}ث`;
        },

        showToast(msg, type = 'info') {
            let container = document.getElementById('nf-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'nf-toast-container';
                document.body.appendChild(container);
            }
            const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
            const toast = document.createElement('div');
            toast.className = `nf-toast nf-toast-${type}`;
            // textContent لا innerHTML: الرسالة قد تحوي كود طالب أو نصًّا قادمًا من الصفحة.
            const iconEl = document.createElement('span');
            iconEl.className = 'nf-toast-icon';
            iconEl.textContent = icons[type] || icons.info;
            const textEl = document.createElement('span');
            textEl.className = 'nf-toast-text';
            textEl.textContent = msg;
            toast.append(iconEl, textEl);
            container.appendChild(toast);
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(0)';
            });
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(30px)';
                setTimeout(() => toast.remove(), 400);
            }, 5000);
        },

        playDone() {
            try {
                if (!navigator.userActivation?.hasBeenActive) return;
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                [523, 659, 784].forEach((freq, i) => {
                    const osc  = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.frequency.value = freq;
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
                    osc.start(ctx.currentTime + i * 0.15);
                    osc.stop(ctx.currentTime + i * 0.15 + 0.3);
                });
            } catch (_) {}
        },

        async confirmSavePopupIfPresent(timeoutMs = 5000, pollInterval = 150) {
            const findYesBtn = () => {
                const popup = document.querySelector('app-confirmation-popup');
                if (!popup) return null;
                return Array.from(popup.querySelectorAll('button'))
                    .find(b => (b.innerText || b.textContent || '').trim() === 'نعم')
                    || popup.querySelector('.btn-success');
            };
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                const yesBtn = findYesBtn();
                if (yesBtn) {
                    yesBtn.click();
                    const closeStart = Date.now();
                    while (Date.now() - closeStart < timeoutMs) {
                        if (!document.querySelector('app-confirmation-popup')) break;
                        await this.sleep(pollInterval);
                    }
                    return true;
                }
                await this.sleep(pollInterval);
            }
            return false;
        }
    };
    const showToast = Utils.showToast.bind(Utils);

    // ─────────────────────────────────────────
    // 4. واجهة المستخدم
    // ─────────────────────────────────────────
    const UI = {
        injectStyles() {
            if (document.getElementById('nf-styles')) return;
            const s = document.createElement('style');
            s.id = 'nf-styles';
            s.textContent = `
:root {
  --nf-primary   : #10b981; --nf-primary-h : #059669;
  --nf-danger    : #ef4444; --nf-danger-h  : #dc2626;
  --nf-warn      : #f59e0b;
  --nf-bg        : #ffffff; --nf-bg2       : #f8fafc;
  --nf-bg3       : #f1f5f9;
  --nf-text      : #1f2937; --nf-sub       : #6b7280;
  --nf-border    : #e5e7eb; --nf-shadow    : rgba(0,0,0,.18);
  --nf-radius    : 14px;    --nf-panel-w   : 340px;
}
body.nf-dark-mode {
  --nf-bg        : #1e2535; --nf-bg2       : #151c2c; --nf-bg3 : #0f1626;
  --nf-text      : #e2e8f0; --nf-sub       : #94a3b8;
  --nf-border    : #2d3a52; --nf-shadow    : rgba(0,0,0,.45);
}

#nf-panel {
  position: fixed; bottom: 20px; left: 20px; z-index: 999999;
  background: var(--nf-bg); border: 1px solid var(--nf-border);
  border-radius: var(--nf-radius); width: var(--nf-panel-w);
  box-shadow: 0 20px 40px -8px var(--nf-shadow);
  font-family: 'Segoe UI', Tahoma, sans-serif;
  direction: rtl; text-align: right; color: var(--nf-text);
  max-height: 92vh; overflow: hidden;
  display: flex; flex-direction: column;
  transition: box-shadow .3s;
  user-select: none;
}
#nf-panel:hover { box-shadow: 0 24px 48px -8px var(--nf-shadow); }

#nf-panel-header {
  background: linear-gradient(135deg, #0f766e 0%, #065f46 50%, #1e3a5f 100%);
  border-radius: var(--nf-radius) var(--nf-radius) 0 0;
  padding: 12px 14px 10px;
  cursor: grab; cursor: -webkit-grab;
  flex-shrink: 0;
}
#nf-panel-header:active { cursor: grabbing; cursor: -webkit-grabbing; }
#nf-header-top { display: flex; align-items: center; justify-content: space-between; }
#nf-header-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 700; color: #fff; margin: 0;
}
#nf-header-title .nf-logo {
  width: 28px; height: 28px; border-radius: 7px;
  background: rgba(255,255,255,.15); display: grid; place-items: center;
  font-size: 16px;
}
#nf-header-actions { display: flex; gap: 6px; }
.nf-hdr-btn {
  width: 26px; height: 26px; border: none; border-radius: 7px; cursor: pointer;
  background: rgba(255,255,255,.15); color: #fff; font-size: 13px;
  display: grid; place-items: center; transition: background .2s;
}
.nf-hdr-btn:hover { background: rgba(255,255,255,.3); }
#nf-dev-badge {
  font-size: 10.5px; color: rgba(255,255,255,.7); margin-top: 5px;
  display: flex; align-items: center; justify-content: space-between;
}
#nf-links-row {
  display: flex; align-items: center; gap: 10px; margin-top: 6px;
}
#nf-links-row a {
  font-size: 10.5px; color: rgba(255,255,255,.9); text-decoration: none;
  display: inline-flex; align-items: center; gap: 3px;
  border-bottom: 1px dotted rgba(255,255,255,.5);
  transition: color .2s, border-color .2s;
}
#nf-links-row a:hover { color: #fff; border-bottom-color: #fff; }
#nf-status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 700;
  background: rgba(255,255,255,.15); color: #fff;
}
#nf-status-badge.active { background: #10b981; color: #fff; }
#nf-status-badge.active::before {
  content: ''; display: inline-block; width: 6px; height: 6px;
  background: #fff; border-radius: 50%;
  animation: nf-pulse 1.2s infinite;
}
@keyframes nf-pulse {
  0%,100% { opacity:1; transform:scale(1); }
  50%      { opacity:.5; transform:scale(1.4); }
}

#nf-progress-wrap {
  height: 4px; background: rgba(255,255,255,.2); margin-top: 8px;
  border-radius: 4px; overflow: hidden;
}
#nf-progress-bar {
  height: 100%; background: #34d399; border-radius: 4px;
  transition: width .6s ease; width: 0%;
}

#nf-panel-body {
  padding: 14px; overflow-y: auto; flex: 1;
  scrollbar-width: thin; scrollbar-color: var(--nf-border) transparent;
}
#nf-panel-body.collapsed { display: none; }

#nf-stats-grid {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; margin-bottom: 12px;
}
.nf-stat-card {
  background: var(--nf-bg2); border: 1px solid var(--nf-border);
  border-radius: 10px; padding: 8px 4px; text-align: center;
  transition: transform .2s;
}
.nf-stat-card:hover { transform: translateY(-2px); }
.nf-stat-val {
  font-size: 16px; font-weight: 800; color: var(--nf-primary);
  line-height: 1.2;
}
.nf-stat-val.danger { color: var(--nf-danger); }
.nf-stat-label { font-size: 9.5px; color: var(--nf-sub); margin-top: 2px; }

#nf-speed-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; color: var(--nf-sub); margin-bottom: 10px;
  padding: 6px 10px; background: var(--nf-bg2); border-radius: 8px;
  border: 1px solid var(--nf-border);
}
#nf-speed-row span b { color: var(--nf-primary); }

.nf-row { margin-bottom: 10px; }
.nf-row label {
  font-size: 12px; font-weight: 600; display: block; margin-bottom: 4px;
  color: var(--nf-sub); text-transform: uppercase; letter-spacing: .4px;
}
.nf-select, .nf-input {
  width: 100%; padding: 7px 10px; border: 1px solid var(--nf-border);
  border-radius: 8px; background: var(--nf-bg); color: var(--nf-text);
  font-family: inherit; font-size: 13px; box-sizing: border-box;
  transition: border-color .2s;
}
.nf-select:focus, .nf-input:focus {
  outline: none; border-color: var(--nf-primary);
  box-shadow: 0 0 0 3px rgba(16,185,129,.15);
}
.nf-textarea {
  width: 100%; padding: 7px 10px; border: 1px solid var(--nf-border);
  border-radius: 8px; background: var(--nf-bg); color: var(--nf-text);
  font-family: 'Consolas', 'Courier New', monospace; font-size: 12px;
  height: 80px; resize: vertical; box-sizing: border-box;
  transition: border-color .2s; direction: ltr; text-align: left;
}
.nf-textarea:focus { outline: none; border-color: var(--nf-primary);
  box-shadow: 0 0 0 3px rgba(16,185,129,.15); }

.nf-btn {
  width: 100%; padding: 10px 12px; border: none; border-radius: 9px;
  font-weight: 700; cursor: pointer; font-size: 13px;
  transition: all .2s; margin-bottom: 7px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.nf-btn:last-child { margin-bottom: 0; }
.nf-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
.nf-btn:active { transform: translateY(0); }
.nf-btn-primary   { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }
.nf-btn-danger    { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; }
.nf-btn-purple    { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; }
.nf-btn-orange    { background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; }
.nf-btn-skip      { background: linear-gradient(135deg, #64748b, #475569); color: #fff; }
.nf-btn-ghost     { background: var(--nf-bg2); color: var(--nf-sub); border: 1px solid var(--nf-border); }
.nf-btn-ghost:hover { background: var(--nf-border); }
.nf-btn:disabled  { opacity: .5; cursor: not-allowed; transform: none; filter: none; }

.nf-divider {
  height: 1px; background: var(--nf-border);
  margin: 10px 0; border-radius: 1px;
}

#nf-toast-container {
  position: fixed; top: 20px; left: 20px; z-index: 9999999;
  display: flex; flex-direction: column; gap: 8px;
  pointer-events: none;
}
.nf-toast {
  background: var(--nf-bg); border-radius: 10px;
  padding: 10px 16px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
  display: flex; align-items: center; gap: 10px;
  min-width: 240px; max-width: 320px; direction: rtl;
  opacity: 0; transform: translateX(-20px);
  transition: all .35s cubic-bezier(.34,1.56,.64,1);
  border-right: 4px solid #3b82f6; pointer-events: auto;
  font-size: 13px; color: var(--nf-text);
}
.nf-toast-success { border-color: #10b981; }
.nf-toast-error   { border-color: #ef4444; }
.nf-toast-warning { border-color: #f59e0b; }
.nf-toast-info    { border-color: #3b82f6; }
.nf-toast-icon    { font-size: 16px; flex-shrink: 0; }

#nf-log-overlay {
  position: fixed; inset: 0; z-index: 9999998;
  background: rgba(0,0,0,.55); display: flex;
  align-items: center; justify-content: center;
  backdrop-filter: blur(3px);
}
#nf-log-modal {
  width: min(780px, 94vw); max-height: 88vh; background: var(--nf-bg);
  border-radius: var(--nf-radius); box-shadow: 0 24px 60px rgba(0,0,0,.45);
  display: flex; flex-direction: column; direction: rtl; text-align: right;
  color: var(--nf-text); overflow: hidden;
}
#nf-log-header {
  background: linear-gradient(135deg, #0f766e 0%, #065f46 50%, #1e3a5f 100%);
  padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
#nf-log-header h3 { margin: 0; color: #fff; font-size: 15px; }
#nf-log-close {
  width: 30px; height: 30px; border: none; border-radius: 8px; cursor: pointer;
  background: rgba(255,255,255,.15); color: #fff; font-size: 15px;
  transition: background .2s;
}
#nf-log-close:hover { background: rgba(255,255,255,.3); }

#nf-log-toolbar {
  display: flex; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid var(--nf-border);
  flex-shrink: 0; flex-wrap: wrap; align-items: center;
}
#nf-log-toolbar .nf-btn { width: auto; flex: 1; margin-bottom: 0; padding: 8px 10px; font-size: 12px; }

#nf-log-filters {
  display: flex; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid var(--nf-border);
  flex-shrink: 0; flex-wrap: wrap; align-items: center;
  background: var(--nf-bg2);
}
#nf-log-search {
  flex: 1 1 160px; padding: 7px 10px;
  border: 1px solid var(--nf-border); border-radius: 8px;
  background: var(--nf-bg); color: var(--nf-text);
  font-family: inherit; font-size: 12.5px; box-sizing: border-box;
}
#nf-log-search:focus { outline: none; border-color: var(--nf-primary);
  box-shadow: 0 0 0 3px rgba(16,185,129,.15); }
#nf-log-filter-status {
  padding: 7px 10px; border: 1px solid var(--nf-border); border-radius: 8px;
  background: var(--nf-bg); color: var(--nf-text); font-family: inherit;
  font-size: 12.5px; cursor: pointer;
}
#nf-log-filter-status:focus { outline: none; border-color: var(--nf-primary); }
#nf-log-count {
  font-size: 11px; color: var(--nf-sub); font-weight: 600;
  padding: 4px 10px; background: var(--nf-bg); border: 1px solid var(--nf-border);
  border-radius: 20px;
}

#nf-log-body { overflow-y: auto; padding: 10px 14px; flex: 1; }
.nf-log-empty { text-align: center; color: var(--nf-sub); padding: 30px 0; font-size: 13px; }
.nf-log-entry {
  border: 1px solid var(--nf-border); border-radius: 10px; padding: 8px 10px;
  margin-bottom: 8px; background: var(--nf-bg2);
  transition: transform .15s, box-shadow .15s;
}
.nf-log-entry:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,.08);
}
.nf-log-entry-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.nf-log-code { font-weight: 700; font-size: 13px; font-family: 'Consolas', monospace; }
.nf-log-status { font-size: 11.5px; font-weight: 700; padding: 2px 8px;
  border-radius: 20px; background: var(--nf-bg); border: 1px solid var(--nf-border); }
.nf-log-status.fixed { color: var(--nf-primary); border-color: var(--nf-primary); }
.nf-log-status.clean { color: #3b82f6; border-color: #3b82f6; }
.nf-log-status.skipped, .nf-log-status.skipped_save_error { color: #64748b; border-color: #64748b; }
.nf-log-status.no_name_fields, .nf-log-status.save_button_missing { color: var(--nf-warn); border-color: var(--nf-warn); }
.nf-log-status.load_failed { color: var(--nf-danger); border-color: var(--nf-danger); }
.nf-log-status.paused_class_empty { color: #8b5cf6; border-color: #8b5cf6; }
.nf-log-status.paused_address_invalid, .nf-log-status.paused_contact_invalid { color: #d97706; border-color: #d97706; }
.nf-log-time { font-size: 10.5px; color: var(--nf-sub); }
.nf-log-note {
  font-size: 11px; color: var(--nf-sub); margin-top: 3px;
  font-style: italic;
}
.nf-log-change {
  font-size: 11.5px; color: var(--nf-sub); margin-top: 3px; direction: rtl;
  padding: 3px 6px; background: var(--nf-bg); border-radius: 6px;
  border-right: 2px solid var(--nf-border);
}
.nf-log-change b { color: var(--nf-text); }
.nf-log-change .nf-log-before { color: var(--nf-danger); text-decoration: line-through;
  text-decoration-color: rgba(239,68,68,.5); }
.nf-log-change .nf-log-after  { color: var(--nf-primary); font-weight: 700; }

/* ── بانر التوقف ── */
#nf-pause-banner {
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
  z-index: 2147483646;
  width: min(620px, 94vw);
  background: linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%);
  border: 2px solid #f59e0b;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(245,158,11,.4);
  padding: 14px 16px;
  font-family: 'Segoe UI', Tahoma, sans-serif;
  direction: rtl; text-align: right;
  color: #78350f;
  animation: nf-slide-down .4s cubic-bezier(.34,1.56,.64,1);
}
@keyframes nf-slide-down {
  from { opacity: 0; transform: translate(-50%, -30px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
.nf-pause-inner { display: flex; gap: 12px; align-items: flex-start; }
.nf-pause-icon {
  font-size: 26px; flex-shrink: 0;
  width: 44px; height: 44px;
  background: #fde68a; border-radius: 10px;
  display: grid; place-items: center;
}
.nf-pause-content { flex: 1; min-width: 0; }
.nf-pause-title {
  font-size: 13.5pt; font-weight: 800; color: #b45309;
  margin-bottom: 5px;
}
.nf-pause-msg {
  font-size: 10.5pt; line-height: 1.65; color: #78350f;
}
.nf-pause-msg ol {
  margin: 6px 18px 10px 0; padding: 0;
  list-style: decimal;
}
.nf-pause-msg li { margin-bottom: 3px; }
.nf-pause-msg b { color: #b45309; }
.nf-pause-msg code {
  background: #fef3c7; padding: 1px 6px; border-radius: 4px;
  font-family: 'Consolas', monospace; font-size: 9.5pt;
  color: #92400e;
  direction: ltr; display: inline-block;
}
.nf-pause-value {
  background: rgba(245,158,11,.15);
  padding: 6px 10px; border-radius: 6px; margin-bottom: 8px;
  font-family: 'Consolas', monospace; font-size: 10pt;
  direction: ltr; text-align: left;
  color: #92400e;
  word-break: break-all;
}
.nf-pause-problems { margin: 6px 0 8px; padding-inline-start: 18px; }
.nf-pause-problems li { margin-bottom: 4px; }
.nf-pause-countdown {
  font-weight: 800; font-size: 14px; color: #b45309; margin: 8px 0 4px;
  font-variant-numeric: tabular-nums;
}
.nf-pause-countdown-bar {
  height: 5px; border-radius: 3px; background: rgba(245,158,11,.2);
  overflow: hidden; margin-bottom: 6px;
}
.nf-pause-countdown-bar > i {
  display: block; height: 100%; width: 100%; background: #f59e0b;
  transition: width .5s linear;
}
.nf-pause-actions {
  display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;
  align-items: center;
}
.nf-pause-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 16px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff; font-weight: 700; font-size: 10.5pt;
  cursor: pointer; font-family: inherit;
  transition: transform .15s, filter .15s;
  box-shadow: 0 3px 10px rgba(16,185,129,.35);
}
.nf-pause-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
.nf-pause-btn-secondary {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 16px; border: 1.5px solid #f59e0b; border-radius: 8px;
  background: transparent;
  color: #b45309; font-weight: 700; font-size: 10.5pt;
  cursor: pointer; font-family: inherit;
  transition: background .15s, transform .15s;
}
.nf-pause-btn-secondary:hover {
  background: rgba(245,158,11,.15);
  transform: translateY(-1px);
}
.nf-pause-close {
  width: 28px; height: 28px; border: none; border-radius: 7px;
  background: rgba(180,83,9,.12); color: #b45309;
  cursor: pointer; font-size: 14px; flex-shrink: 0;
  transition: background .2s;
}
.nf-pause-close:hover { background: rgba(180,83,9,.22); }

#nf-pause-banner.nf-pause-minimized {
  width: auto; padding: 8px 12px;
  border-radius: 40px;
}
#nf-pause-banner.nf-pause-minimized .nf-pause-msg,
#nf-pause-banner.nf-pause-minimized .nf-pause-title { display: none; }
#nf-pause-banner.nf-pause-minimized .nf-pause-icon {
  width: 30px; height: 30px; font-size: 18px;
}
#nf-pause-banner.nf-pause-minimized .nf-pause-actions { margin-top: 0; }
#nf-pause-banner.nf-pause-minimized .nf-pause-btn,
#nf-pause-banner.nf-pause-minimized .nf-pause-btn-secondary {
  padding: 6px 12px; font-size: 9.5pt;
}

@keyframes nf-field-pulse {
  0%, 100% { box-shadow: 0 0 0 5px rgba(245,158,11,.4); }
  50%      { box-shadow: 0 0 0 12px rgba(245,158,11,.08); }
}
.nf-field-highlight {
  outline: 3px solid #f59e0b !important;
  outline-offset: 2px !important;
  animation: nf-field-pulse 1.5s ease-in-out infinite;
  border-radius: 6px;
}
`;
            document.head.appendChild(s);
        },

        async ensureUI() {
            if (document.getElementById('nf-panel')) return;
            this.injectStyles();

            const isRunning     = await Store.get('nf_running', false);
            const targetCodes   = await Store.get('nf_target_codes', []);
            const currentIndex  = await Store.get('nf_current_index', 0);
            const failedCodes   = await Store.get('nf_failed_codes', []);
            const fixedCount    = await Store.get('nf_fixed_count', 0);
            const isDark        = await Store.get('nf_dark_mode', false);
            const batchSize     = await Store.get('nf_batch_size', 0);
            const opMode        = await Store.get('nf_mode', 'full');
            const extraOverwrite = await Store.get('nf_extra_overwrite', false);
            const extraEnabled  = await Store.get('nf_extra_enabled', false);
            const defAddress    = await Store.get('nf_default_address', '');
            const defLang1      = await Store.get('nf_default_lang1', '');
            const defLang2      = await Store.get('nf_default_lang2', '');
            const defRegStatus  = await Store.get('nf_default_reg_status', '');
            const defDamg       = await Store.get('nf_default_damg', '');
            const defDivision   = await Store.get('nf_default_division', '');
            const defSpec       = await Store.get('nf_default_spec', '');
            const langSpecPolicy = await Store.get('nf_damg_lang_policy', 'empty');
            const excelStudentMap = await Store.get('nf_excel_student_map', null);
            const excelMapCount = excelStudentMap && typeof excelStudentMap === 'object' ? Object.keys(excelStudentMap).length : 0;
            const manualWait    = await Store.get('nf_manual_wait_sec', CONFIG.MANUAL_WAIT_SEC);
            const saveErrWait   = await Store.get('nf_save_error_wait_sec', CONFIG.SAVE_ERROR_WAIT_SEC);
            const saveErrWaitOpts = [10,15,20,30,45,60]
                .map(v => `<option value="${v}" ${Number(saveErrWait) === v ? 'selected' : ''}>${v} ثانية</option>`).join('');
            const manualWaitOpts = [[60,'دقيقة'],[120,'دقيقتان'],[180,'3 دقائق'],[300,'5 دقائق'],[600,'10 دقائق'],[900,'15 دقيقة']]
                .map(([v,t]) => `<option value="${v}" ${Number(manualWait) === v ? 'selected' : ''}>${t}</option>`).join('');

            const lang1Opts = ['<option value="">— بدون تغيير —</option>']
                .concat(CONFIG.LANG1_OPTIONS.map(o =>
                    `<option value="${Utils.escapeHtml(o.value)}" ${o.value === defLang1 ? 'selected' : ''}>${Utils.escapeHtml(o.text)}</option>`)).join('');
            const lang2Opts = ['<option value="">— بدون تغيير —</option>']
                .concat(CONFIG.LANG2_OPTIONS.map(o =>
                    `<option value="${Utils.escapeHtml(o.value)}" ${o.value === defLang2 ? 'selected' : ''}>${Utils.escapeHtml(o.text)}</option>`)).join('');

            const regStatusOpts = ['<option value="">— بدون تغيير —</option>']
                .concat(CONFIG.REG_STATUS_OPTIONS.map(o =>
                    `<option value="${Utils.escapeHtml(o.value)}" ${o.value === defRegStatus ? 'selected' : ''}>${Utils.escapeHtml(o.text)}</option>`)).join('');

            const damgOpts = ['<option value="">— بدون تغيير —</option>']
                .concat(CONFIG.DISABILITY_OPTIONS.map(o =>
                    `<option value="${Utils.escapeHtml(o.value)}" ${o.value === defDamg ? 'selected' : ''}>${Utils.escapeHtml(o.text)}</option>`)).join('');

            const divOpts = ['<option value="">— بدون تغيير —</option>']
                .concat(CONFIG.DIVISION_OPTIONS.map(o =>
                    `<option value="${Utils.escapeHtml(o.value)}" ${o.value === defDivision ? 'selected' : ''}>${Utils.escapeHtml(o.text)}</option>`)).join('');

            const specOpts = ['<option value="">— بدون تغيير —</option>']
                .concat(CONFIG.SPECIALIZATION_OPTIONS.map(o =>
                    `<option value="${Utils.escapeHtml(o.value)}" ${o.value === defSpec ? 'selected' : ''}>${Utils.escapeHtml(o.text)}</option>`)).join('');

            if (isDark) document.body.classList.add('nf-dark-mode');

            const pct = targetCodes.length
                ? Math.round((currentIndex / targetCodes.length) * 100) : 0;

            const panel = document.createElement('div');
            panel.id = 'nf-panel';
            panel.innerHTML = `
<div id="nf-panel-header">
  <div id="nf-header-top">
    <h3 id="nf-header-title">
      <span class="nf-logo">✏️</span>
      <span>منقّي أسماء الطلاب</span>
    </h3>
    <div id="nf-header-actions">
      <span id="nf-status-badge" class="${isRunning ? 'active' : ''}">${isRunning ? 'يعمل' : 'متوقف'}</span>
      <button class="nf-hdr-btn" id="nf-btn-dark"  title="تبديل الوضع المظلم">🌙</button>
      <button class="nf-hdr-btn" id="nf-btn-min"   title="تصغير اللوحة">➖</button>
      <button class="nf-hdr-btn" id="nf-btn-close" title="إخفاء مؤقت">✕</button>
    </div>
  </div>
  <div id="nf-dev-badge">
    <span>${VER} | م. ضياء العطار</span>
    <span>📞 01118209309</span>
  </div>
  <div id="nf-links-row">
    <a href="https://unified-school-tools-website.vercel.app/" target="_blank" rel="noopener noreferrer">🌐 الموقع الإلكتروني</a>
    <a href="https://www.facebook.com/profile.php?id=61593183145085" target="_blank" rel="noopener noreferrer">📘 صفحتنا على فيسبوك</a>
  </div>
  <div id="nf-progress-wrap">
    <div id="nf-progress-bar" style="width:${Number(pct) || 0}%"></div>
  </div>
</div>

<div id="nf-panel-body">

  <div id="nf-stats-grid">
    <div class="nf-stat-card">
      <div class="nf-stat-val" id="nf-stat-done">${Number(currentIndex) || 0}</div>
      <div class="nf-stat-label">✅ مُنجز</div>
    </div>
    <div class="nf-stat-card">
      <div class="nf-stat-val" id="nf-stat-total">${targetCodes.length}</div>
      <div class="nf-stat-label">📋 إجمالي</div>
    </div>
    <div class="nf-stat-card">
      <div class="nf-stat-val" id="nf-stat-fixed">${Number(fixedCount) || 0}</div>
      <div class="nf-stat-label">✏️ مُصحَّح</div>
    </div>
    <div class="nf-stat-card">
      <div class="nf-stat-val danger" id="nf-stat-failed">${failedCodes.length}</div>
      <div class="nf-stat-label">❌ فاشل</div>
    </div>
  </div>

  <div id="nf-speed-row">
    <span>⚡ السرعة: <b id="nf-speed-val">—</b> طالب/دقيقة</span>
    <span>⏱ المتبقي: <b id="nf-eta-val">—</b></span>
  </div>

  <div class="nf-row" style="background:var(--nf-bg2);border:1px solid var(--nf-border);border-radius:10px;padding:10px 12px;margin-bottom:12px;">
    <label style="font-weight:700;margin-bottom:8px;display:block;">🎯 نمط تشغيل الأداة:</label>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;font-weight:normal;">
        <input type="radio" name="nf-op-mode" id="nf-mode-full" value="full" ${opMode === 'full' ? 'checked' : ''}>
        <span>🔤 <b>تنقية الأسماء</b> + البيانات الإضافية (اختياري)</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;font-weight:normal;">
        <input type="radio" name="nf-op-mode" id="nf-mode-extra" value="extra_only" ${opMode === 'extra_only' ? 'checked' : ''}>
        <span>📋 <b>تعديل البيانات الإضافية فقط</b> (العنوان واللغات) دون مساس بالأسماء</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;font-weight:normal;">
        <input type="radio" name="nf-op-mode" id="nf-mode-lang-spec" value="lang_spec_damg" ${opMode === 'lang_spec_damg' ? 'checked' : ''}>
        <span>🌐 <b>تعديل اللغات والتخصص وحالة الدمج</b> (الشعبة / التخصص / الدمج / اللغات)</span>
      </label>
    </div>
  </div>

  <div class="nf-row">
    <label>الصف المستهدف</label>
    <select id="nf-level-select" class="nf-select">
      <option value="-1">⏳ جاري تحميل الصفوف...</option>
    </select>
  </div>

  <div class="nf-row">
    <label>أكواد الطلاب <span style="font-weight:400;text-transform:none">(كود في كل سطر)</span></label>
    <textarea id="nf-codes-input" class="nf-textarea"
      placeholder="أدخل الأكواد هنا أو انسخها من الجدول...">${Utils.escapeHtml(targetCodes.join('\n'))}</textarea>
  </div>

  <div class="nf-row">
    <label>البدء من الكود رقم</label>
    <input type="number" id="nf-start-index" class="nf-input"
      value="${(Number(currentIndex) || 0) + 1}" min="1" style="text-align:center;font-weight:700;">
  </div>

  <div class="nf-row">
    <label>حجم الدفعة <span style="font-weight:400;text-transform:none">(اختياري)</span></label>
    <input type="number" id="nf-batch-size" class="nf-input"
      value="${Number(batchSize) > 0 ? Number(batchSize) : ''}" min="1"
      placeholder="مثال: 50 — اتركه فارغًا لتشغيل الكل دفعة واحدة"
      style="text-align:center;font-weight:700;">
  </div>

  <div class="nf-row">
    <label>مهلة التعديل اليدوي عند وجود بيانات غير صحيحة</label>
    <select id="nf-manual-wait" class="nf-select">${/* html-safe: خيارات من أرقام ونصوص ثابتة */ manualWaitOpts}</select>
    <div style="font-size:11px;color:var(--nf-sub);margin-top:6px;line-height:1.7;">
      📮 يُفحص دائمًا: <b>العنوان</b> (أرقام فقط مثل "0" مرفوض) — <b>التليفون الأرضي</b> (لازم يبدأ بمفتاح مثل 02، وليس أصفارًا) — <b>المحمول</b> (11 رقمًا يبدأ بـ 010/011/012/015).
      <br>عند وجود خطأ لا يُحفظ الطالب؛ تنتظر الأداة تعديلك اليدوي طوال المهلة (تتجدد مع كل كتابة) وتحفظ تلقائيًا بمجرد أن تصبح البيانات سليمة.
    </div>
  </div>

  <div class="nf-row">
    <label>مهلة التعديل اليدوي عند خطأ أثناء الحفظ (ثم يُتخطى الطالب)</label>
    <select id="nf-save-error-wait" class="nf-select">${/* html-safe: خيارات من أرقام ثابتة */ saveErrWaitOpts}</select>
    <div style="font-size:11px;color:var(--nf-sub);margin-top:6px;line-height:1.7;">
      لو رفض الموقع الحفظ (حقل غير صالح / زر الحفظ معطّل / رسالة خطأ)، تنتظر الأداة تعديلك هذه المدة، فإن صحّحت حفظت تلقائيًا، وإلا تخطّت الطالب وسجّلته في السجل.
    </div>
  </div>

  <div class="nf-divider"></div>

  <!-- صندوق اللغات والتخصص والدمج الجديد -->
  <div id="nf-lang-spec-box" style="${opMode === 'lang_spec_damg' ? '' : 'display:none;'}">
    <div class="nf-row" style="background:var(--nf-bg2);border:1px solid var(--nf-border);border-radius:10px;padding:10px 12px;margin-bottom:10px;">
      <label style="font-weight:700;margin-bottom:6px;display:block;">🌐 سياسة تعديل اللغات والتخصص والدمج:</label>
      <div style="display:flex;flex-direction:column;gap:6px;font-size:11.5px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:normal;">
          <input type="radio" name="nf-lang-spec-policy" id="nf-ls-policy-empty" value="empty" ${langSpecPolicy !== 'overwrite' ? 'checked' : ''}>
          <span>ملء الحقول <b>الفارغة فقط</b> (لحماية المسجل مسبقاً)</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:normal;">
          <input type="radio" name="nf-lang-spec-policy" id="nf-ls-policy-overwrite" value="overwrite" ${langSpecPolicy === 'overwrite' ? 'checked' : ''}>
          <span><b>استبدال وتوحيد الجميع</b> (إجباري لكل طالب بالقائمة)</span>
        </label>
      </div>
      <div style="font-size:11px;color:var(--nf-sub);margin-top:6px;line-height:1.6;">
        ℹ️ الشعبة والتخصص إن كانا معطّلين بالصف (مثل الابتدائي أو الإعدادي أو أولى ثانوي) سيتم تخطيهما تلقائياً دون أي توقف أو أخطاء.
      </div>
    </div>

    <div class="nf-row">
      <label>اللغة الأولى المستهدفة</label>
      <select id="nf-ls-lang1" class="nf-select">${lang1Opts}</select>
    </div>
    <div class="nf-row">
      <label>اللغة الثانية المستهدفة</label>
      <select id="nf-ls-lang2" class="nf-select">${lang2Opts}</select>
    </div>
    <div class="nf-row">
      <label>الموقف من الدمج (حالة الإعاقة)</label>
      <select id="nf-ls-damg" class="nf-select">${damgOpts}</select>
    </div>
    <div class="nf-row">
      <label>الشعبة المستهدفة (للثانوي)</label>
      <select id="nf-ls-division" class="nf-select">${divOpts}</select>
    </div>
    <div class="nf-row">
      <label>التخصص المستهدف (للثانوي)</label>
      <select id="nf-ls-spec" class="nf-select">${specOpts}</select>
    </div>

    <!-- استيراد كشف Excel مخصص للطلاب -->
    <div class="nf-row" style="background:var(--nf-bg2);border:1px solid var(--nf-border);border-radius:10px;padding:10px 12px;margin-top:10px;">
      <label style="font-weight:700;margin-bottom:6px;display:block;">📊 كشف مخصص لكل طالب (اختياري عبر Excel):</label>
      <div style="font-size:11px;color:var(--nf-sub);margin-bottom:8px;line-height:1.5;">
        يمكنك رفع شيت إكسيل يحتوي على أكواد الطلاب وتخصيص لغة/دمج/شعبة لكل طالب على حدة:
      </div>
      <input type="file" id="nf-lang-spec-file" accept=".xlsx,.xls,.csv" style="display:none;">
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button id="nf-btn-upload-file" class="nf-btn nf-btn-purple" style="flex:1;margin-bottom:0;padding:7px 10px;font-size:11.5px;">📁 استيراد شيت إكسيل</button>
        <button id="nf-btn-download-template" class="nf-btn nf-btn-ghost" style="flex:1;margin-bottom:0;padding:7px 10px;font-size:11.5px;">📥 تحميل النموذج</button>
      </div>
      <div id="nf-excel-status-badge" style="font-size:11px;color:var(--nf-primary);font-weight:700;margin-top:4px;">
        ${excelMapCount > 0 ? `✅ تم ربط كشف مخصص لـ ${excelMapCount} طالب` : '⚪ لم يتم رفع شيت مخصص (سيتم تطبيق الاختيارات أعلاه)'}
      </div>
      ${excelMapCount > 0 ? '<button id="nf-btn-clear-excel-map" class="nf-btn nf-btn-ghost" style="margin-top:6px;padding:4px 8px;font-size:10.5px;color:var(--nf-danger);">🗑 إلغاء ربط الشيت</button>' : ''}
    </div>
  </div>

  <div class="nf-row" id="nf-extra-check-row" style="display:${(opMode === 'extra_only' || opMode === 'lang_spec_damg') ? 'none' : 'flex'};align-items:center;gap:8px;">
    <input type="checkbox" id="nf-extra-enabled" style="width:16px;height:16px;" ${extraEnabled ? 'checked' : ''}>
    <label for="nf-extra-enabled" style="margin:0;text-transform:none;font-size:12.5px;cursor:pointer;">
      تصحيح إضافي: العنوان الافتراضي / اللغات / حالة القيد
    </label>
  </div>
  <div id="nf-extra-box" style="${opMode === 'lang_spec_damg' ? 'display:none;' : ((opMode === 'extra_only' || extraEnabled) ? '' : 'display:none;')}">
    <div class="nf-row" style="background:var(--nf-bg2);border:1px solid var(--nf-border);border-radius:10px;padding:10px 12px;margin-bottom:10px;">
      <label style="font-weight:700;margin-bottom:6px;display:block;">⚙️ سياسة تطبيق العنوان واللغات:</label>
      <div style="display:flex;flex-direction:column;gap:6px;font-size:11.5px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:normal;">
          <input type="radio" name="nf-extra-policy" id="nf-policy-empty" value="empty" ${!extraOverwrite ? 'checked' : ''}>
          <span>ملء الحقول <b>الفارغة فقط</b> (لحماية المسجل مسبقاً)</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:normal;">
          <input type="radio" name="nf-extra-policy" id="nf-policy-overwrite" value="overwrite" ${extraOverwrite ? 'checked' : ''}>
          <span><b>استبدال وتوحيد الجميع</b> (إجباري لكل طالب)</span>
        </label>
      </div>
      <div style="font-size:11px;color:var(--nf-sub);margin-top:6px;line-height:1.6;">
        📌 <b>الفصل لا يُختار تلقائيًا أبدًا</b> — لو كان فاضيًا، ستنتظر الأداة اختيارك اليدوي قبل الحفظ.
      </div>
    </div>
    <div class="nf-row">
      <label>العنوان الافتراضي</label>
      <input type="text" id="nf-default-address" class="nf-input" value="${Utils.escapeHtml(defAddress)}" placeholder="مثال: شارع الجمهورية 15">
    </div>
    <div class="nf-row">
      <label>اللغة الأجنبية الأولى الافتراضية</label>
      <select id="nf-default-lang1" class="nf-select">${/* html-safe: مبنية من CONFIG مع هروب */ lang1Opts}</select>
    </div>
    <div class="nf-row">
      <label>اللغة الأجنبية الثانية الافتراضية</label>
      <select id="nf-default-lang2" class="nf-select">${/* html-safe: مبنية من CONFIG مع هروب */ lang2Opts}</select>
    </div>
    <div class="nf-row">
      <label>حالة قيد الطالب الافتراضية</label>
      <select id="nf-default-reg-status" class="nf-select">${/* html-safe: مبنية من CONFIG مع هروب */ regStatusOpts}</select>
    </div>
  </div>

  <div class="nf-divider"></div>

  <button id="nf-btn-toggle" class="nf-btn ${isRunning ? 'nf-btn-danger' : 'nf-btn-primary'}">${
    isRunning
      ? (opMode === 'lang_spec_damg' ? '⏹ إيقاف تعديل اللغات والتخصص والدمج' : (opMode === 'extra_only' ? '⏹ إيقاف تعديل البيانات' : '⏹ إيقاف التنقية'))
      : (opMode === 'lang_spec_damg' ? '▶️ بدء / استكمال تعديل اللغات والتخصص والدمج' : (opMode === 'extra_only' ? '▶️ بدء / استكمال تعديل البيانات الإضافية' : '▶️ بدء / استكمال تنقية الأسماء'))
  }</button>
  <button id="nf-btn-skip" class="nf-btn nf-btn-skip" ${isRunning ? '' : 'disabled'}>⏭ تخطي الطالب الحالي</button>

  <div class="nf-divider"></div>

  <button id="nf-btn-extract-codes" class="nf-btn nf-btn-purple">📋 نسخ الأكواد من الجدول الحالي</button>
  <button id="nf-btn-retry-failed" class="nf-btn nf-btn-orange">🔄 إعادة محاولة الفاشلين (<span id="nf-failed-count">${failedCodes.length}</span>)</button>

  <div class="nf-divider"></div>

  <button id="nf-btn-log" class="nf-btn nf-btn-ghost">📋 سجل العمليات (للمراجعة)</button>
  <button id="nf-btn-clear" class="nf-btn nf-btn-ghost">🗑 مسح الذاكرة وبدء عمل جديد</button>

</div><!-- end body -->
`;
            document.body.appendChild(panel);
            this._makeDraggable(panel, document.getElementById('nf-panel-header'));
            this._attachEvents();
        },

        _makeDraggable(panel, handle) {
            let ox = 0, oy = 0, dragging = false;
            handle.addEventListener('mousedown', e => {
                if (e.target.closest('.nf-hdr-btn, #nf-status-badge')) return;
                dragging = true;
                const rect = panel.getBoundingClientRect();
                ox = e.clientX - rect.left;
                oy = e.clientY - rect.top;
                handle.style.cursor = 'grabbing';
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!dragging) return;
                let nx = e.clientX - ox;
                let ny = e.clientY - oy;
                const maxX = window.innerWidth  - panel.offsetWidth;
                const maxY = window.innerHeight - panel.offsetHeight;
                nx = Math.max(0, Math.min(nx, maxX));
                ny = Math.max(0, Math.min(ny, maxY));
                panel.style.left   = nx + 'px';
                panel.style.top    = ny + 'px';
                panel.style.bottom = 'auto';
            });
            document.addEventListener('mouseup', () => {
                dragging = false;
                handle.style.cursor = '';
            });
        },

        _attachEvents() {
            document.getElementById('nf-btn-toggle').addEventListener('click', async () => {
                const running = await Store.get('nf_running', false);
                const opMode  = await Store.get('nf_mode', 'full');
                if (running) {
                    await Store.set('nf_running', false);
                    this.updateStatus('متوقف', false);
                    this._setToggleBtn(false);
                    showToast(
                        opMode === 'lang_spec_damg' ? 'تم إيقاف تعديل اللغات والتخصص والدمج' :
                        (opMode === 'extra_only' ? 'تم إيقاف تعديل البيانات' : 'تم إيقاف التنقية'),
                        'warning'
                    );
                } else {
                    const sel = document.getElementById('nf-level-select');
                    if (sel.value === '-1' || sel.options.length <= 1) {
                        showToast('يرجى الانتظار واختيار الصف أولاً.', 'warning'); return;
                    }
                    if (opMode === 'extra_only') {
                        const defAddr = (document.getElementById('nf-default-address')?.value || '').trim();
                        const defL1   = document.getElementById('nf-default-lang1')?.value || '';
                        const defL2   = document.getElementById('nf-default-lang2')?.value || '';
                        const defReg  = document.getElementById('nf-default-reg-status')?.value || '';
                        if (!defAddr && !defL1 && !defL2 && !defReg) {
                            showToast('يرجى تحديد بيان إضافي واحد على الأقل لتطبيقه (عنوان أو لغة أو حالة قيد).', 'warning');
                            return;
                        }
                    } else if (opMode === 'lang_spec_damg') {
                        const defL1   = document.getElementById('nf-ls-lang1')?.value || '';
                        const defL2   = document.getElementById('nf-ls-lang2')?.value || '';
                        const defDamg = document.getElementById('nf-ls-damg')?.value || '';
                        const defDiv  = document.getElementById('nf-ls-division')?.value || '';
                        const defSpec = document.getElementById('nf-ls-spec')?.value || '';
                        const excelMap = await Store.get('nf_excel_student_map', null);
                        const hasExcel = excelMap && typeof excelMap === 'object' && Object.keys(excelMap).length > 0;
                        if (!defL1 && !defL2 && !defDamg && !defDiv && !defSpec && !hasExcel) {
                            showToast('يرجى تحديد حقل واحد على الأقل لتطبيقه (لغة أو دمج أو شعبة) أو استيراد كشف Excel.', 'warning');
                            return;
                        }
                    }
                    const raw   = document.getElementById('nf-codes-input').value;
                    const codes = raw.split(/\r?\n|,/).map(c => c.trim()).filter(Boolean);
                    if (!codes.length) {
                        showToast('يرجى إدخال كود واحد على الأقل.', 'error'); return;
                    }
                    let startVal = parseInt(document.getElementById('nf-start-index').value, 10);
                    if (isNaN(startVal) || startVal < 1) startVal = 1;
                    if (startVal > codes.length) startVal = codes.length;

                    let batchSizeVal = parseInt(document.getElementById('nf-batch-size').value, 10);
                    if (isNaN(batchSizeVal) || batchSizeVal < 1) batchSizeVal = 0;

                    await Store.set('nf_current_index',    startVal - 1);
                    await Store.set('nf_target_codes',     codes);
                    await Store.set('nf_running',          true);
                    await Store.set('nf_target_level_val', sel.value);
                    await Store.set('nf_list_page_url',    window.location.href);
                    await Store.set('nf_auto_retry_count', 0);
                    await Store.set('nf_start_time',       Date.now());
                    await Store.set('nf_batch_size',        batchSizeVal);
                    await Store.set('nf_batch_start_index', startVal - 1);
                    await Store.set('nf_paused_banner',    false);

                    document.getElementById('nf-pause-banner')?.remove();
                    this.removeFieldHighlights();

                    document.getElementById('nf-stat-total').textContent = codes.length;
                    document.getElementById('nf-stat-done').textContent  = startVal - 1;
                    this._updateProgress(startVal - 1, codes.length);
                    this.updateStatus('يعمل', true);
                    this._setToggleBtn(true);
                    Fixer.onListPageResume();
                }
            });

            document.getElementById('nf-btn-skip').addEventListener('click', async () => {
                const running = await Store.get('nf_running', false);
                if (!running) {
                    showToast('الأداة متوقفة — لا يوجد طالب حالي لتخطيه.', 'warning');
                    return;
                }
                const targetCodes = await Store.get('nf_target_codes', []);
                const currentIdx  = await Store.get('nf_current_index', 0);
                const currentCode = targetCodes[currentIdx];
                if (!currentCode) {
                    showToast('لا يوجد طالب حالي (انتهت القائمة).', 'warning');
                    return;
                }
                if (!(await nfConfirm(`هل تريد تخطي الطالب "${currentCode}" والمتابعة للطالب التالي؟\n\nلن يتم حفظ أي تعديل له، وسيُسجَّل في السجل كـ "تم التخطي".`))) return;
                showToast(`⏭ تم تخطي الطالب ${currentCode}`, 'info');
                await Fixer.skipCurrentStudent('تخطي يدوي من اللوحة');
            });

            const onModeChange = async (mode) => {
                await Store.set('nf_mode', mode);
                const isExtra = (mode === 'extra_only');
                const isLangSpec = (mode === 'lang_spec_damg');
                const extraBox = document.getElementById('nf-extra-box');
                const extraCheckRow = document.getElementById('nf-extra-check-row');
                const extraCheck = document.getElementById('nf-extra-enabled');
                const langSpecBox = document.getElementById('nf-lang-spec-box');
                if (extraCheckRow) extraCheckRow.style.display = (isExtra || isLangSpec) ? 'none' : 'flex';
                if (extraBox) {
                    extraBox.style.display = (!isLangSpec && (isExtra || extraCheck?.checked)) ? '' : 'none';
                }
                if (langSpecBox) {
                    langSpecBox.style.display = isLangSpec ? '' : 'none';
                }
                const running = await Store.get('nf_running', false);
                this._setToggleBtn(running);
                showToast(
                    isLangSpec ? 'تم تفعيل نمط "تعديل اللغات والتخصص والدمج"' :
                    (isExtra ? 'تم تفعيل نمط "تعديل البيانات الإضافية فقط"' : 'تم تفعيل نمط "تنقية الأسماء"'),
                    'info'
                );
            };

            document.getElementById('nf-mode-full')?.addEventListener('change', e => {
                if (e.target.checked) onModeChange('full');
            });
            document.getElementById('nf-mode-extra')?.addEventListener('change', e => {
                if (e.target.checked) onModeChange('extra_only');
            });
            document.getElementById('nf-mode-lang-spec')?.addEventListener('change', e => {
                if (e.target.checked) onModeChange('lang_spec_damg');
            });

            // سياسات تعديل اللغات والتخصص والدمج
            document.getElementById('nf-ls-policy-empty')?.addEventListener('change', async e => {
                if (e.target.checked) {
                    await Store.set('nf_damg_lang_policy', 'empty');
                    showToast('تم ضبط السياسة: ملء الحقول الفارغة فقط', 'info');
                }
            });
            document.getElementById('nf-ls-policy-overwrite')?.addEventListener('change', async e => {
                if (e.target.checked) {
                    await Store.set('nf_damg_lang_policy', 'overwrite');
                    showToast('تم ضبط السياسة: استبدال وتوحيد الجميع إجبارياً', 'info');
                }
            });
            document.getElementById('nf-ls-lang1')?.addEventListener('change', async e => {
                await Store.set('nf_default_lang1', e.target.value);
            });
            document.getElementById('nf-ls-lang2')?.addEventListener('change', async e => {
                await Store.set('nf_default_lang2', e.target.value);
            });
            document.getElementById('nf-ls-damg')?.addEventListener('change', async e => {
                await Store.set('nf_default_damg', e.target.value);
            });
            document.getElementById('nf-ls-division')?.addEventListener('change', async e => {
                await Store.set('nf_default_division', e.target.value);
            });
            document.getElementById('nf-ls-spec')?.addEventListener('change', async e => {
                await Store.set('nf_default_spec', e.target.value);
            });

            // استيراد ملف Excel مخصص
            document.getElementById('nf-btn-upload-file')?.addEventListener('click', () => {
                document.getElementById('nf-lang-spec-file')?.click();
            });

            document.getElementById('nf-lang-spec-file')?.addEventListener('change', async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                    let XLSX = window.XLSX;
                    if (!XLSX) {
                        if (typeof globalThis.neprasEnsureLib === 'function') {
                            XLSX = await globalThis.neprasEnsureLib('xlsx').catch(() => null);
                        } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                            await chrome.runtime.sendMessage({ action: 'NEPRAS_ENSURE_LIB', lib: 'xlsx' }).catch(() => null);
                            XLSX = window.XLSX;
                        }
                    }

                    let rows = [];
                    if (XLSX && typeof XLSX.read === 'function') {
                        const buffer = await file.arrayBuffer();
                        const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
                        const firstSheet = wb.Sheets[wb.SheetNames[0]];
                        // مصفوفة 2D Matrix تضمن التقاط الأعمدة حتى لو كان بأعلى الملف عناوين أو صفوف مدمجة
                        rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false });
                    } else {
                        const text = await file.text();
                        const lines = text.split(/\r?\n/).filter(Boolean);
                        rows = lines.map(line => line.split(',').map(c => c.trim().replace(/^["']|["']$/g, '')));
                    }
                    const map = Utils.parseExcelStudentMap(rows);
                    const count = Object.keys(map).length;
                    if (count === 0) {
                        showToast('لم يتم العثور على أي أكواد طلاب صالحة بالملف!', 'error');
                        return;
                    }
                    await Store.set('nf_excel_student_map', map);
                    await Store.set('nf_mode', 'lang_spec_damg');

                    const modeRadio = document.getElementById('nf-mode-lang-spec');
                    if (modeRadio) modeRadio.checked = true;
                    const lsBox = document.getElementById('nf-lang-spec-box');
                    if (lsBox) lsBox.style.display = '';

                    const badge = document.getElementById('nf-excel-status-badge');
                    if (badge) badge.textContent = `✅ تم ربط كشف مخصص لـ ${count} طالب`;

                    const uniqueCodes = new Set();
                    for (const entry of Object.values(map)) {
                        if (entry.studentCode) uniqueCodes.add(entry.studentCode);
                        else if (entry.nationalId) uniqueCodes.add(entry.nationalId);
                    }
                    const codes = Array.from(uniqueCodes);
                    const codesInput = document.getElementById('nf-codes-input');
                    if (codesInput) {
                        codesInput.value = codes.join('\n');
                        document.getElementById('nf-stat-total').textContent = codes.length;
                    }
                    showToast(`✅ تم استيراد وتخصيص بيانات ${codes.length} طالب من الملف بنجاح`, 'success');
                } catch (err) {
                    console.error('[NameFixer] Excel parse error:', err);
                    showToast('حدث خطأ أثناء قراءة ملف الإكسيل!', 'error');
                }
            });

            document.getElementById('nf-btn-download-template')?.addEventListener('click', async () => {
                let XLSX = window.XLSX;
                if (!XLSX) {
                    if (typeof globalThis.neprasEnsureLib === 'function') {
                        XLSX = await globalThis.neprasEnsureLib('xlsx').catch(() => null);
                    } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                        await chrome.runtime.sendMessage({ action: 'NEPRAS_ENSURE_LIB', lib: 'xlsx' }).catch(() => null);
                        XLSX = window.XLSX;
                    }
                }
                const template = Utils.buildLangSpecDamgTemplate();
                if (XLSX && typeof XLSX.utils?.json_to_sheet === 'function') {
                    const ws = XLSX.utils.json_to_sheet(template);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
                    XLSX.writeFile(wb, 'نموذج_تعديل_اللغات_والتخصص_والدمج_نبراس.xlsx');
                } else {
                    const headers = Object.keys(template[0]);
                    const csvContent = '\uFEFF' + [
                        headers.join(','),
                        ...template.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
                    ].join('\r\n');
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'نموذج_تعديل_اللغات_والتخصص_والدمج_نبراس.csv';
                    a.click();
                }
                showToast('📥 تم تنزيل نموذج شيت التعديل', 'success');
            });

            document.getElementById('nf-btn-clear-excel-map')?.addEventListener('click', async () => {
                await Store.remove('nf_excel_student_map');
                const badge = document.getElementById('nf-excel-status-badge');
                if (badge) badge.textContent = '⚪ تم إلغاء ربط الشيت المخصص';
                document.getElementById('nf-btn-clear-excel-map')?.remove();
                showToast('تم إلغاء ربط كشف الإكسيل المخصص', 'info');
            });

            document.getElementById('nf-policy-empty')?.addEventListener('change', async e => {
                if (e.target.checked) {
                    await Store.set('nf_extra_overwrite', false);
                    showToast('تم ضبط السياسة: ملء الحقول الفارغة فقط', 'info');
                }
            });
            document.getElementById('nf-policy-overwrite')?.addEventListener('change', async e => {
                if (e.target.checked) {
                    await Store.set('nf_extra_overwrite', true);
                    showToast('تم ضبط السياسة: استبدال وتوحيد الجميع إجبارياً', 'info');
                }
            });

            document.getElementById('nf-extra-enabled')?.addEventListener('change', async e => {
                const on = e.target.checked;
                await Store.set('nf_extra_enabled', on);
                document.getElementById('nf-extra-box').style.display = on ? '' : 'none';
            });
            document.getElementById('nf-default-address').addEventListener('change', async e => {
                await Store.set('nf_default_address', e.target.value.trim());
            });
            document.getElementById('nf-default-lang1').addEventListener('change', async e => {
                await Store.set('nf_default_lang1', e.target.value);
            });
            document.getElementById('nf-default-lang2').addEventListener('change', async e => {
                await Store.set('nf_default_lang2', e.target.value);
            });

            document.getElementById('nf-default-reg-status').addEventListener('change', async e => {
                await Store.set('nf_default_reg_status', e.target.value);
            });
            document.getElementById('nf-save-error-wait').addEventListener('change', async e => {
                await Store.set('nf_save_error_wait_sec', parseInt(e.target.value, 10) || CONFIG.SAVE_ERROR_WAIT_SEC);
            });
            document.getElementById('nf-manual-wait').addEventListener('change', async e => {
                await Store.set('nf_manual_wait_sec', parseInt(e.target.value, 10) || CONFIG.MANUAL_WAIT_SEC);
            });

            document.getElementById('nf-btn-extract-codes').addEventListener('click', async () => {
                await Fixer.extractCodesAndFillTextarea();
            });

            document.getElementById('nf-btn-retry-failed').addEventListener('click', async () => {
                const failed = await Store.get('nf_failed_codes', []);
                if (!failed.length) { showToast('لا توجد أكواد فاشلة!', 'info'); return; }
                document.getElementById('nf-codes-input').value = failed.join('\n');
                await Store.set('nf_failed_codes', []);
                document.getElementById('nf-failed-count').textContent = '0';
                document.getElementById('nf-stat-failed').textContent  = '0';
                document.getElementById('nf-start-index').value = '1';
                showToast(`تم تحميل ${failed.length} كود فاشل. اضغط بدء التنقية.`, 'success');
            });

            document.getElementById('nf-btn-log').addEventListener('click', async () => {
                await this.showLogModal();
            });

            document.getElementById('nf-btn-clear').addEventListener('click', async () => {
                if (!(await nfConfirm('تحذير: سيتم حذف جميع الأكواد والتقدّم المحفوظ. هل أنت متأكد؟'))) return;
                await Store.clearAll();
                await Log.clear();
                document.getElementById('nf-pause-banner')?.remove();
                this.removeFieldHighlights();
                document.getElementById('nf-stat-done').textContent    = '0';
                document.getElementById('nf-stat-total').textContent   = '0';
                document.getElementById('nf-stat-fixed').textContent   = '0';
                document.getElementById('nf-stat-failed').textContent  = '0';
                document.getElementById('nf-failed-count').textContent = '0';
                document.getElementById('nf-codes-input').value        = '';
                document.getElementById('nf-start-index').value        = '1';
                document.getElementById('nf-batch-size').value          = '';
                document.getElementById('nf-speed-val').textContent    = '—';
                document.getElementById('nf-eta-val').textContent      = '—';
                this._updateProgress(0, 0);
                this.updateStatus('متوقف', false);
                this._setToggleBtn(false);
                showToast('تم مسح الذاكرة بالكامل بنجاح.', 'success');
            });

            document.getElementById('nf-btn-dark').addEventListener('click', async () => {
                const isDark = document.body.classList.toggle('nf-dark-mode');
                await Store.set('nf_dark_mode', isDark);
                document.getElementById('nf-btn-dark').textContent = isDark ? '☀️' : '🌙';
                showToast(isDark ? 'تم تفعيل الوضع المظلم' : 'تم إلغاء الوضع المظلم', 'info');
            });

            document.getElementById('nf-btn-min').addEventListener('click', () => {
                const body = document.getElementById('nf-panel-body');
                const isMin = body.classList.toggle('collapsed');
                document.getElementById('nf-btn-min').textContent = isMin ? '➕' : '➖';
            });

            document.getElementById('nf-btn-close').addEventListener('click', () => {
                const panel = document.getElementById('nf-panel');
                panel.style.opacity = '0';
                panel.style.transform = 'scale(.9)';
                panel.style.transition = 'all .3s';
                setTimeout(() => {
                    panel.style.display = 'none';
                    const fab = document.createElement('button');
                    fab.id = 'nf-fab';
                    fab.title = 'إظهار لوحة المنقّي';
                    Object.assign(fab.style, {
                        position: 'fixed', bottom: '20px', left: '20px', zIndex: '999998',
                        width: '50px', height: '50px', borderRadius: '50%', border: 'none',
                        background: 'linear-gradient(135deg,#10b981,#065f46)',
                        color: '#fff', fontSize: '22px', cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(0,0,0,.3)',
                        display: 'grid', placeItems: 'center'
                    });
                    fab.textContent = '✏️';
                    fab.addEventListener('click', () => {
                        panel.style.display = 'flex';
                        panel.style.opacity = '1';
                        panel.style.transform = 'scale(1)';
                        fab.remove();
                    });
                    document.body.appendChild(fab);
                }, 300);
            });
        },

        updateStatus(text, isActive = false) {
            const el = document.getElementById('nf-status-badge');
            if (!el) return;
            el.textContent = text;
            el.className = isActive ? 'active' : '';
        },

        _setToggleBtn(running) {
            const btn = document.getElementById('nf-btn-toggle');
            if (btn) {
                const isLangSpec = document.getElementById('nf-mode-lang-spec')?.checked;
                const isExtra = document.getElementById('nf-mode-extra')?.checked;
                btn.className = `nf-btn ${running ? 'nf-btn-danger' : 'nf-btn-primary'}`;
                if (isLangSpec) {
                    btn.textContent = running ? '⏹ إيقاف تعديل اللغات والتخصص والدمج' : '▶️ بدء / استكمال تعديل اللغات والتخصص والدمج';
                } else if (isExtra) {
                    btn.textContent = running ? '⏹ إيقاف تعديل البيانات' : '▶️ بدء / استكمال تعديل البيانات الإضافية';
                } else {
                    btn.textContent = running ? '⏹ إيقاف التنقية' : '▶️ بدء / استكمال تنقية الأسماء';
                }
            }
            const skipBtn = document.getElementById('nf-btn-skip');
            if (skipBtn) skipBtn.disabled = !running;
        },

        _updateProgress(done, total) {
            const bar = document.getElementById('nf-progress-bar');
            if (!bar) return;
            bar.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
        },

        async _updateSpeedETA(done, total) {
            const startTime = await Store.get('nf_start_time', null);
            if (!startTime || done === 0) return;
            const elapsed = (Date.now() - startTime) / 1000 / 60;
            const speed   = done / elapsed;
            const remain  = total - done;
            const etaMin  = speed > 0 ? remain / speed : Infinity;

            const speedEl = document.getElementById('nf-speed-val');
            const etaEl   = document.getElementById('nf-eta-val');
            if (speedEl) speedEl.textContent = speed.toFixed(1);
            if (etaEl)   etaEl.textContent   = Utils.formatDuration(etaMin * 60 * 1000);
        },

        async updateStats() {
            const done    = await Store.get('nf_current_index', 0);
            const total   = (await Store.get('nf_target_codes', [])).length;
            const failed  = (await Store.get('nf_failed_codes', [])).length;
            const fixed   = await Store.get('nf_fixed_count', 0);

            const el = id => document.getElementById(id);
            if (el('nf-stat-done'))    el('nf-stat-done').textContent    = done;
            if (el('nf-stat-total'))   el('nf-stat-total').textContent   = total;
            if (el('nf-stat-fixed'))   el('nf-stat-fixed').textContent   = fixed;
            if (el('nf-stat-failed'))  el('nf-stat-failed').textContent  = failed;
            if (el('nf-failed-count')) el('nf-failed-count').textContent = failed;
            this._updateProgress(done, total);
            await this._updateSpeedETA(done, total);
        },

        async populateLevels() {
            const sel = document.getElementById('nf-level-select');
            if (!sel) return;
            let pageSel = null;
            for (let i = 0; i < 15; i++) {
                pageSel = Utils.findInputByLabelText('الصف');
                if (pageSel?.options?.length > 1) break;
                await Utils.sleep(500);
            }
            if (pageSel?.options?.length > 1) {
                sel.innerHTML = '';
                Array.from(pageSel.options).forEach(o => {
                    const no   = document.createElement('option');
                    no.value   = o.value; no.text = o.text;
                    sel.appendChild(no);
                });
                const saved = await Store.get('nf_target_level_val', null);
                if (saved && Array.from(sel.options).some(o => o.value === saved)) sel.value = saved;

                const fresh = sel.cloneNode(true);
                sel.parentNode.replaceChild(fresh, sel);
                fresh.addEventListener('change', e => Utils.setInputValueAngular(pageSel, e.target.value));
            } else {
                sel.innerHTML = '<option value="-1">❌ لم يُعثر على قائمة الصفوف</option>';
            }
        },

        // إبراز حقل معيّن بإطار نابض
        async highlightFieldBySelector(selector, maxAttempts = 12, delayMs = 400) {
            let el = null;
            for (let i = 0; i < maxAttempts; i++) {
                el = document.querySelector(selector);
                if (el) break;
                await Utils.sleep(delayMs);
            }
            if (!el) return null;
            el.classList.add('nf-field-highlight');
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus({ preventScroll: true });
            } catch (_) {}
            return el;
        },

        removeFieldHighlights() {
            document.querySelectorAll('.nf-field-highlight')
                .forEach(el => el.classList.remove('nf-field-highlight'));
        },

        // ── بانر التوقف العام ──
        showPauseBanner(opts) {
            const {
                icon = '⏸️',
                title = 'توقفت الأداة',
                messageHtml = '',
                skipReason = 'تخطي من بانر التوقف'
            } = opts || {};

            document.getElementById('nf-pause-banner')?.remove();

            const banner = document.createElement('div');
            banner.id = 'nf-pause-banner';
            banner.innerHTML = `
                <div class="nf-pause-inner">
                    <div class="nf-pause-icon">${Utils.escapeHtml(icon)}</div>
                    <div class="nf-pause-content">
                        <div class="nf-pause-title">${Utils.escapeHtml(title)}</div>
                        <div class="nf-pause-msg">${/* html-safe: المستدعون يمرّرون _problemsHtml (مهروبة) وفقرات ثابتة */ messageHtml}</div>
                        <div class="nf-pause-actions">
                            <button class="nf-pause-btn" id="nf-pause-back">🔙 العودة إلى قائمة الطلاب</button>
                            <button class="nf-pause-btn-secondary" id="nf-pause-skip">⏭ تخطي هذا الطالب</button>
                        </div>
                    </div>
                    <button class="nf-pause-close" id="nf-pause-close" title="تصغير البانر">✕</button>
                </div>
            `;
            document.body.appendChild(banner);

            banner.querySelector('#nf-pause-back').addEventListener('click', async () => {
                const listUrl = await Store.get('nf_list_page_url', '/student/list');
                await Store.set('nf_paused_banner', false);
                window.location.href = listUrl;
            });

            banner.querySelector('#nf-pause-skip').addEventListener('click', async () => {
                const targetCodes = await Store.get('nf_target_codes', []);
                const currentIdx  = await Store.get('nf_current_index', 0);
                const currentCode = targetCodes[currentIdx];
                if (!(await nfConfirm(`هل تريد تخطي الطالب "${currentCode || '—'}" والمتابعة للطالب التالي؟\n\nلن يتم حفظ أي تعديل له، وسيُسجَّل في السجل كـ "تم التخطي".`))) return;
                showToast(`⏭ تم تخطي الطالب ${currentCode || ''} والمتابعة...`, 'info');
                await Fixer.skipCurrentStudent(skipReason);
            });

            banner.querySelector('#nf-pause-close').addEventListener('click', () => {
                banner.classList.add('nf-pause-minimized');
            });
        },

        _problemsHtml(problems) {
            const items = problems.map(p => {
                const val = p.value ? ` — القيمة الحالية: <code>${Utils.escapeHtml(String(p.value).slice(0, 60))}</code>` : '';
                return `<li><b>${Utils.escapeHtml(p.label)}:</b> ${Utils.escapeHtml(p.reason)}${val}</li>`;
            }).join('');
            return `<ul class="nf-pause-problems">${items}</ul>`;
        },

        // إبراز كل الحقول المعيبة (الأول يأخذ التركيز)
        highlightProblems(problems) {
            this.removeFieldHighlights();
            return Promise.all(problems.slice().reverse().map(p => this.highlightFieldBySelector(p.selector)));
        },

        // ── بانر التوقف النهائي (بعد انتهاء المهلة) ──
        showPauseForProblemsBanner(problems) {
            this.showPauseBanner({
                icon: '⏸️',
                title: 'توقفت الأداة — بيانات تحتاج تعديلك',
                messageHtml: `
                    ${/* html-safe: _problemsHtml تهرب كل قيمة */ this._problemsHtml(problems)}
                    <b>اختر أحد الخيارين:</b>
                    <ol>
                        <li><b>لمعالجة هذا الطالب:</b> صحّح الحقول المُبرَزة بإطار أصفر، اضغط حفظ في الموقع، ثم اضغط "العودة إلى قائمة الطلاب" واضغط بدء/استكمال.</li>
                        <li><b>لتخطي هذا الطالب:</b> اضغط زر "تخطي هذا الطالب" أدناه.</li>
                    </ol>
                `,
                skipReason: 'تخطي من بانر التوقف (' + problems.map(p => p.label).join('، ') + ')'
            });
        },

        // ── بانر الانتظار مع عدّاد (أثناء مهلة التعديل اليدوي) ──
        showWaitBanner(problems, opts = {}) {
            document.getElementById('nf-pause-banner')?.remove();
            const banner = document.createElement('div');
            banner.id = 'nf-pause-banner';
            banner.innerHTML = `
                <div class="nf-pause-inner">
                    <div class="nf-pause-icon">✍️</div>
                    <div class="nf-pause-content">
                        <div class="nf-pause-title">${Utils.escapeHtml(opts.title || 'الأداة تنتظر تعديلك اليدوي')}</div>
                        <div class="nf-pause-msg">
                            ${/* html-safe: _problemsHtml تهرب كل قيمة */ this._problemsHtml(problems)}
                            صحّح الحقول المُبرَزة بإطار أصفر — <b>ستحفظ الأداة تلقائيًا</b> وتكمل بمجرد أن تصبح البيانات سليمة.
                            <br>كل مرة تكتب فيها تبدأ المهلة من جديد.
                        </div>
                        <div class="nf-pause-countdown" id="nf-wait-count"></div>
                        <div class="nf-pause-countdown-bar"><i id="nf-wait-bar"></i></div>
                        <div class="nf-pause-actions">
                            ${opts.showExtend === false ? '' : '<button class="nf-pause-btn" id="nf-wait-extend">➕ تمديد دقيقتين</button>'}
                            <button class="nf-pause-btn-secondary" id="nf-wait-skip">⏭ تخطي هذا الطالب</button>
                            <button class="nf-pause-btn-secondary" id="nf-wait-back">🔙 العودة للقائمة</button>
                        </div>
                    </div>
                    <button class="nf-pause-close" id="nf-pause-close" title="تصغير البانر">✕</button>
                </div>
            `;
            document.body.appendChild(banner);
            banner.querySelector('#nf-pause-close').addEventListener('click', () => banner.classList.add('nf-pause-minimized'));
            return banner;
        },

        // ── عرض سجل العمليات ──
        async showLogModal() {
            if (document.getElementById('nf-log-overlay')) return;

            const entries = await Log.getAll();
            const overlay = document.createElement('div');
            overlay.id = 'nf-log-overlay';
            overlay.innerHTML = `
<div id="nf-log-modal">
  <div id="nf-log-header">
    <h3>📋 سجل العمليات (${entries.length} عملية)</h3>
    <button id="nf-log-close" title="إغلاق">✕</button>
  </div>
  <div id="nf-log-toolbar">
    <button id="nf-log-export" class="nf-btn nf-btn-purple">📄 نص CSV للنسخ</button>
    <button id="nf-log-clear"  class="nf-btn nf-btn-danger">🗑 مسح السجل</button>
  </div>
  <div id="nf-log-filters">
    <input type="text" id="nf-log-search" placeholder="🔍 ابحث بكود الطالب أو قيمة...">
    <select id="nf-log-filter-status">
      <option value="">— كل الحالات —</option>
      <option value="fixed">✏️ تم التصحيح</option>
      <option value="clean">✅ نظيف بالفعل</option>
      <option value="skipped">⏭️ تم التخطي يدويًا</option>
      <option value="no_name_fields">⚠️ لم يُعثر على حقول اسم</option>
      <option value="save_button_missing">⚠️ صُحِّح محليًا لكن لم يُحفظ</option>
      <option value="load_failed">❌ فشل تحميل النموذج</option>
      <option value="paused_class_empty">⏸ توقف — الفصل فارغ</option>
      <option value="paused_address_invalid">⏸ توقف — العنوان غير صحيح</option>
      <option value="paused_contact_invalid">⏸ توقف — تليفون/محمول غير صحيح</option>
      <option value="skipped_save_error">⏭️ تم التخطي — خطأ أثناء الحفظ</option>
    </select>
    <span id="nf-log-count"></span>
  </div>
  <div id="nf-log-csv-wrap" style="display:none; padding: 10px 14px; border-bottom: 1px solid var(--nf-border);">
    <textarea id="nf-log-csv-text" class="nf-textarea" style="height:110px; direction:ltr; text-align:left;" readonly></textarea>
    <button id="nf-log-copy" class="nf-btn nf-btn-primary" style="margin-top:6px;">📋 نسخ الكل</button>
  </div>
  <div id="nf-log-body"></div>
</div>`;
            document.body.appendChild(overlay);

            const body       = overlay.querySelector('#nf-log-body');
            const searchBox  = overlay.querySelector('#nf-log-search');
            const statusSel  = overlay.querySelector('#nf-log-filter-status');
            const countBadge = overlay.querySelector('#nf-log-count');

            const applyFilters = () => {
                const q  = searchBox.value.trim().toLowerCase();
                const st = statusSel.value;
                let filtered = entries;
                if (st) filtered = filtered.filter(e => e.status === st);
                if (q) {
                    filtered = filtered.filter(e => {
                        if (String(e.code || '').toLowerCase().includes(q)) return true;
                        if (String(Log.STATUS_LABELS[e.status] || '').toLowerCase().includes(q)) return true;
                        if (String(e.note || '').toLowerCase().includes(q)) return true;
                        if ((e.changes || []).some(c =>
                            String(c.before || '').toLowerCase().includes(q) ||
                            String(c.after  || '').toLowerCase().includes(q) ||
                            String(c.label  || '').toLowerCase().includes(q))) return true;
                        if ((e.checked || []).some(c =>
                            String(c.value || '').toLowerCase().includes(q) ||
                            String(c.label || '').toLowerCase().includes(q))) return true;
                        return false;
                    });
                }
                countBadge.textContent = `${filtered.length} / ${entries.length}`;
                this._renderLogEntries(body, filtered);
            };

            searchBox.addEventListener('input', applyFilters);
            statusSel.addEventListener('change', applyFilters);
            applyFilters();

            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
            overlay.querySelector('#nf-log-close').addEventListener('click', () => overlay.remove());

            overlay.querySelector('#nf-log-export').addEventListener('click', async () => {
                if (!entries.length) { showToast('السجل فارغ، لا يوجد ما يُنسخ.', 'warning'); return; }
                const csv  = await Log.buildCSV();
                const wrap = overlay.querySelector('#nf-log-csv-wrap');
                const ta   = overlay.querySelector('#nf-log-csv-text');
                ta.value = csv;
                wrap.style.display = 'block';
                ta.focus();
                ta.select();
            });

            overlay.querySelector('#nf-log-copy').addEventListener('click', () => {
                const ta = overlay.querySelector('#nf-log-csv-text');
                if (!ta.value) { showToast('لا يوجد محتوى للنسخ.', 'warning'); return; }
                ta.focus();
                ta.select();
                try { ta.setSelectionRange(0, ta.value.length); } catch (_) {}
                let ok = false;
                try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
                if (ok) showToast('✅ تم نسخ السجل، الصقه في Excel واحفظه بامتداد .csv', 'success');
                else    showToast('اضغط Ctrl+C للنسخ اليدوي.', 'info');
                setTimeout(() => { try { ta.setSelectionRange(0, 0); } catch (_) {} }, 150);
            });

            overlay.querySelector('#nf-log-clear').addEventListener('click', async () => {
                if (!(await nfConfirm('سيتم حذف سجل العمليات بالكامل. متأكد؟'))) return;
                await Log.clear();
                showToast('تم مسح سجل العمليات.', 'success');
                overlay.remove();
            });
        },

        _renderLogEntries(container, entries) {
            if (!entries.length) {
                container.innerHTML = '<div class="nf-log-empty">لا توجد عمليات مطابقة.</div>';
                return;
            }
            const esc = Utils.escapeHtml;
            const MAX_SHOWN = 500;
            const shown = entries.slice(0, MAX_SHOWN);
            container.innerHTML = shown.map(e => {
                const statusLabel = Log.STATUS_LABELS[e.status] || e.status;
                const time = new Date(e.time).toLocaleString('ar-EG');
                const changesHtml = (e.changes || []).map(c =>
                    `<div class="nf-log-change">• <b>${esc(c.label || c.field)}</b>:
                        <span class="nf-log-before">"${esc(c.before)}"</span> ←
                        <span class="nf-log-after">"${esc(c.after)}"</span></div>`
                ).join('');
                const checkedHtml = (!e.changes || !e.changes.length) && e.checked && e.checked.length
                    ? e.checked.map(c =>
                        `<div class="nf-log-change">· ${esc(c.label || c.field)}: "${esc(c.value)}"</div>`
                      ).join('')
                    : '';
                const noteHtml = e.note
                    ? `<div class="nf-log-note">📝 ${esc(e.note)}</div>` : '';
                return `
<div class="nf-log-entry">
  <div class="nf-log-entry-top">
    <span class="nf-log-code">${esc(e.code || '—')}</span>
    <span class="nf-log-status ${esc(e.status)}">${esc(statusLabel)}</span>
  </div>
  <div class="nf-log-time">${esc(time)}</div>
  ${/* html-safe: مبنية أعلاه من esc() */ noteHtml}${/* html-safe: esc() */ changesHtml}${/* html-safe: esc() */ checkedHtml}
</div>`;
            }).join('');
            if (entries.length > MAX_SHOWN) {
                container.innerHTML += `<div class="nf-log-empty">تم عرض آخر ${MAX_SHOWN} عملية فقط من أصل ${Number(entries.length)}. استخدم "نص CSV للنسخ" لرؤية الكل.</div>`;
            }
        }
    };

    // ─────────────────────────────────────────
    // 5. منطق التنقية
    // ─────────────────────────────────────────
    const Fixer = {

        // ── فحص الفصل (اختياري) + العنوان + التليفون + المحمول ──
        collectProblems(includeClass) {
            const problems = [];
            if (includeClass) {
                const sel = document.querySelector('select[formcontrolname="classId"]');
                if (sel && (!sel.value || sel.value === '-1')) {
                    problems.push({
                        key: 'class', label: 'الفصل',
                        selector: 'select[formcontrolname="classId"]',
                        value: '', reason: 'فارغ — لا يُختار تلقائيًا، اختره يدويًا'
                    });
                }
            }
            const checks = [
                { key: 'address', label: 'العنوان',              selector: 'input[formcontrolname="address"]',      fn: Utils.addressProblem },
                { key: 'phone',   label: 'رقم التليفون الأرضي',  selector: 'input[formcontrolname="phoneNumber"]',  fn: Utils.landlineProblem },
                { key: 'mobile',  label: 'رقم المحمول',          selector: 'input[formcontrolname="mobileNumber"]', fn: Utils.mobileProblem }
            ];
            for (const c of checks) {
                const el = document.querySelector(c.selector);
                if (!el) continue;
                const reason = c.fn(el.value);
                if (reason) {
                    problems.push({
                        key: c.key, label: c.label, selector: c.selector,
                        value: String(el.value || '').trim(), reason
                    });
                }
            }
            return problems;
        },

        _readFieldValue(selector) {
            const el = document.querySelector(selector);
            if (!el) return '';
            if (el.tagName.toLowerCase() === 'select') return (el.options[el.selectedIndex]?.text || '').trim();
            return String(el.value || '').trim();
        },

        // ── انتظار التعديل اليدوي: يرجع 'resolved' | 'timeout' | 'stopped' | 'left' ──
        async waitForManualFix(initialProblems, includeClass) {
            const QUIET_MS = 2500; // هدوء بعد آخر كتابة قبل الحفظ التلقائي
            const totalSec = Number(await Store.get('nf_manual_wait_sec', CONFIG.MANUAL_WAIT_SEC)) || CONFIG.MANUAL_WAIT_SEC;

            const banner = UI.showWaitBanner(initialProblems);
            await UI.highlightProblems(initialProblems);
            UI.updateStatus('بانتظار تعديلك اليدوي', true);
            showToast('✍️ بيانات تحتاج تعديلك — الأداة تنتظرك وستحفظ تلقائيًا بعد التصحيح.', 'warning');

            const countEl = banner.querySelector('#nf-wait-count');
            const barEl   = banner.querySelector('#nf-wait-bar');
            let deadline     = Date.now() + totalSec * 1000;
            let lastActivity = 0;
            let outcome      = null;

            const onActivity = e => {
                if (e?.target?.closest?.('#nf-panel, #nf-pause-banner')) return;
                deadline     = Date.now() + totalSec * 1000;
                lastActivity = Date.now();
            };
            const evs = ['input', 'change', 'keydown'];
            evs.forEach(ev => document.addEventListener(ev, onActivity, true));

            banner.querySelector('#nf-wait-extend')?.addEventListener('click', () => {
                deadline = Math.max(deadline, Date.now()) + 120000;
            });
            banner.querySelector('#nf-wait-skip').addEventListener('click', async () => {
                const codes = await Store.get('nf_target_codes', []);
                const idx   = await Store.get('nf_current_index', 0);
                if (!(await nfConfirm(`هل تريد تخطي الطالب "${codes[idx] || '—'}" والمتابعة للطالب التالي؟\n\nلن يتم حفظ أي تعديل له، وسيُسجَّل في السجل كـ "تم التخطي".`))) return;
                outcome = 'left';
                await Fixer.skipCurrentStudent('تخطي أثناء مهلة التعديل اليدوي');
            });
            banner.querySelector('#nf-wait-back').addEventListener('click', async () => {
                outcome = 'left';
                await Store.set('nf_running', false);
                await Store.set('nf_paused_banner', false);
                const listUrl = await Store.get('nf_list_page_url', '/student/list');
                window.location.href = listUrl;
            });

            try {
                while (!outcome) {
                    if (!(await Store.get('nf_running', false))) { outcome = 'stopped'; break; }

                    const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
                    const now = Fixer.collectProblems(includeClass);

                    if (!now.length) {
                        if (Date.now() - lastActivity >= QUIET_MS) { outcome = 'resolved'; break; }
                        countEl.textContent = '✅ البيانات سليمة — سيتم الحفظ بعد لحظات...';
                    } else {
                        if (remain <= 0) { outcome = 'timeout'; break; }
                        countEl.textContent = `⏱ المتبقي: ${Utils.formatDuration(remain * 1000)}`;
                        barEl.style.width = Math.min(100, (remain / totalSec) * 100) + '%';
                    }
                    await Utils.sleep(500);
                }
            } finally {
                evs.forEach(ev => document.removeEventListener(ev, onActivity, true));
            }

            if (outcome === 'resolved') {
                document.getElementById('nf-pause-banner')?.remove();
                UI.removeFieldHighlights();
                UI.updateStatus('يعمل', true);
                showToast('✅ تم التعديل اليدوي — جاري الحفظ', 'success');
            } else if (outcome === 'stopped') {
                document.getElementById('nf-pause-banner')?.remove();
                UI.removeFieldHighlights();
                UI.updateStatus('متوقف', false);
            }
            return outcome;
        },

        // ── أخطاء الحفظ: رسائل الخطأ الظاهرة حاليًا (خط أساس قبل الحفظ) ──
        _findSaveBtn() {
            return Array.from(document.querySelectorAll('button, input[type="submit"]'))
                .find(b => CONFIG.SELECTORS.SAVE_BTN_REGEX.test((b.innerText || b.value || '').trim()));
        },

        _isVisible(el) { return !!(el && (el.offsetParent || el.getClientRects().length)); },

        _errorMessages() {
            const out = [];
            const sel = '.invalid-feedback, .mat-error, .alert-danger, .toast-error, .text-danger, [role="alert"], .swal2-icon-error';
            document.querySelectorAll(sel).forEach(el => {
                if (el.closest('#nf-panel, #nf-pause-banner, #nf-toast-container')) return;
                if (!Fixer._isVisible(el)) return;
                const host = el.classList.contains('swal2-icon-error') ? (el.closest('.swal2-popup') || el) : el;
                const text = (host.innerText || host.textContent || '').replace(/\s+/g, ' ').trim();
                if (!text || /^[*\s]+$/.test(text)) return;
                out.push(text.slice(0, 140));
            });
            return out;
        },

        errorMessageBaseline() { return new Set(Fixer._errorMessages()); },

        // baseline = null → فحص الحقول/الزر فقط (قبل الضغط على حفظ)
        collectSaveErrors(baseline, saveBtn) {
            const errs = [];
            document.querySelectorAll('input.ng-invalid, select.ng-invalid, textarea.ng-invalid').forEach(el => {
                if (el.closest('#nf-panel, #nf-pause-banner')) return;
                if (el.disabled || el.readOnly || (el.type || '').toLowerCase() === 'hidden') return;
                if (!Fixer._isVisible(el)) return;
                const ctrl  = el.getAttribute('formcontrolname') || el.name || el.id || '';
                const label = String(Utils.findLabelForInput(el) || ctrl || 'حقل').trim();
                const value = el.tagName.toLowerCase() === 'select'
                    ? (el.options[el.selectedIndex]?.text || '').trim()
                    : String(el.value || '').trim();
                errs.push({ kind: 'field', el, label, value, reason: 'قيمة غير صالحة أو مطلوبة' });
            });
            if (saveBtn && (saveBtn.disabled || saveBtn.getAttribute('aria-disabled') === 'true')) {
                errs.push({ kind: 'btn', label: 'زر الحفظ', value: '', reason: 'معطّل — يوجد حقل غير صالح بالنموذج' });
            }
            if (baseline) {
                Fixer._errorMessages().forEach(t => {
                    if (!baseline.has(t)) errs.push({ kind: 'msg', label: 'رسالة من الموقع', value: '', reason: t });
                });
            }
            return errs;
        },

        // ── مهلة قصيرة للتعديل اليدوي عند خطأ أثناء الحفظ: 'resolved' | 'timeout' | 'stopped' | 'left' ──
        async waitForSaveFix(initialErrs, baseline) {
            const QUIET_MS = 1500;
            const totalSec = Number(await Store.get('nf_save_error_wait_sec', CONFIG.SAVE_ERROR_WAIT_SEC)) || CONFIG.SAVE_ERROR_WAIT_SEC;
            const probs = initialErrs.map(e => ({ label: e.label, reason: e.reason, value: e.value }));
            const banner = UI.showWaitBanner(probs, { title: 'تعذّر الحفظ — عدّل يدويًا الآن', showExtend: false });

            UI.removeFieldHighlights();
            initialErrs.forEach(e => e.el && e.el.classList.add('nf-field-highlight'));
            const firstEl = initialErrs.find(e => e.el)?.el;
            try { firstEl?.scrollIntoView({ behavior: 'smooth', block: 'center' }); firstEl?.focus({ preventScroll: true }); } catch (_) {}
            UI.updateStatus('بانتظار تعديلك (خطأ حفظ)', true);
            showToast(`⚠️ تعذّر الحفظ — أمامك ${totalSec} ثانية للتعديل اليدوي وإلا يُتخطى الطالب.`, 'warning');

            const countEl = banner.querySelector('#nf-wait-count');
            const barEl   = banner.querySelector('#nf-wait-bar');
            let deadline = Date.now() + totalSec * 1000;
            let lastActivity = 0;
            let outcome = null;
            const msgOnly = initialErrs.every(e => e.kind === 'msg');

            const onActivity = e => {
                if (e?.target?.closest?.('#nf-panel, #nf-pause-banner')) return;
                deadline = Date.now() + totalSec * 1000;
                lastActivity = Date.now();
            };
            const evs = ['input', 'change', 'keydown'];
            evs.forEach(ev => document.addEventListener(ev, onActivity, true));

            banner.querySelector('#nf-wait-skip').addEventListener('click', () => { outcome = 'timeout'; });
            banner.querySelector('#nf-wait-back').addEventListener('click', async () => {
                outcome = 'left';
                await Store.set('nf_running', false);
                await Store.set('nf_paused_banner', false);
                window.location.href = await Store.get('nf_list_page_url', '/student/list');
            });

            try {
                while (!outcome) {
                    if (!(await Store.get('nf_running', false))) { outcome = 'stopped'; break; }
                    const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
                    const cur = Fixer.collectSaveErrors(baseline, Fixer._findSaveBtn());
                    const fieldsLeft = cur.filter(e => e.kind !== 'msg');
                    const fixed = fieldsLeft.length === 0 && (!msgOnly || lastActivity > 0);

                    if (fixed) {
                        if (Date.now() - lastActivity >= QUIET_MS) { outcome = 'resolved'; break; }
                        countEl.textContent = '✅ تم التعديل — جاري إعادة الحفظ...';
                    } else {
                        if (remain <= 0) { outcome = 'timeout'; break; }
                        countEl.textContent = `⏱ سيُتخطى الطالب بعد: ${remain} ثانية`;
                        barEl.style.width = Math.min(100, (remain / totalSec) * 100) + '%';
                    }
                    await Utils.sleep(400);
                }
            } finally {
                evs.forEach(ev => document.removeEventListener(ev, onActivity, true));
            }

            if (outcome !== 'left') {
                document.getElementById('nf-pause-banner')?.remove();
                UI.removeFieldHighlights();
                UI.updateStatus(outcome === 'stopped' ? 'متوقف' : 'يعمل', outcome !== 'stopped');
            }
            return outcome;
        },

        async skipCurrentStudent(reason = 'تخطي يدوي') {
            const targetCodes = await Store.get('nf_target_codes', []);
            const currentIdx  = await Store.get('nf_current_index', 0);
            const currentCode = targetCodes[currentIdx] || '';

            await Log.add({
                code: currentCode,
                status: 'skipped',
                changes: [],
                note: reason
            });

            await Store.set('nf_current_index', currentIdx + 1);
            await Store.set('nf_paused_banner', false);
            await Store.set('nf_running', true);

            document.getElementById('nf-pause-banner')?.remove();
            UI.removeFieldHighlights();

            UI.updateStatus('يعمل', true);
            UI._setToggleBtn(true);
            await UI.updateStats();

            const listUrl = await Store.get('nf_list_page_url', '/student/list');
            await Utils.sleep(CONFIG.WAIT_SHORT);
            window.location.href = listUrl;
        },

        async maximizeTableLength(targetSize = CONFIG.TARGET_TABLE_ROWS) {
            const ps = document.querySelector(CONFIG.SELECTORS.PAGE_SIZE_SELECT);
            if (ps?.tagName === 'SELECT') {
                const opts = Array.from(ps.options);
                let target = opts.find(o => parseInt(o.value, 10) >= targetSize);
                if (!target) {
                    const no = document.createElement('option');
                    no.value = targetSize; no.text = String(targetSize);
                    ps.appendChild(no); target = no;
                    showToast(`تم إضافة خيار ${targetSize} طالب`, 'info');
                }
                if (ps.value !== target.value) {
                    ps.value = target.value;
                    ps.dispatchEvent(new Event('change', { bubbles: true }));
                    await Utils.sleep(CONFIG.WAIT_MED);
                    showToast(`تم تعيين عرض ${target.value} صف`, 'success');
                    return true;
                }
                return true;
            }
            const allBtn = Array.from(document.querySelectorAll('button, a'))
                .find(el => /الكل|All|جميع/.test(el.innerText?.trim()));
            if (allBtn) { allBtn.click(); await Utils.sleep(CONFIG.WAIT_MED); return true; }
            if (typeof $ !== 'undefined' && $.fn.dataTable) {
                try {
                    $('table').DataTable().page.len(targetSize).draw();
                    await Utils.sleep(CONFIG.WAIT_MED); return true;
                } catch (_) {}
            }
            showToast('لم نتمكن من توسيع الجدول تلقائياً.', 'warning');
            return false;
        },

        async extractCodesAndFillTextarea() {
            showToast('جاري توسيع الجدول...', 'info');
            await this.maximizeTableLength();
            await Utils.sleep(CONFIG.WAIT_SHORT);

            const links = Array.from(document.querySelectorAll(CONFIG.SELECTORS.STUDENT_LINK));
            if (!links.length) {
                showToast('لا يوجد طلاب في الجدول. اختر الصف وابحث أولاً.', 'error'); return;
            }
            const codes = [...new Set(
                links.map(l => Utils.extractStudentId(l.href)).filter(Boolean)
            )];
            if (!codes.length) { showToast('لم يُعثر على أكواد صالحة.', 'error'); return; }

            document.getElementById('nf-codes-input').value      = codes.join('\n');
            document.getElementById('nf-stat-total').textContent = codes.length;
            document.getElementById('nf-start-index').value      = '1';
            UI._updateProgress(0, codes.length);
            await Store.set('nf_target_codes', codes);
            await Store.set('nf_current_index', 0);
            showToast(`✅ تم نسخ ${codes.length} كود وتعبئتها.`, 'success');
        },

        async executeSearchForCode(code) {
            const savedLevel = await Store.get('nf_target_level_val');
            const gradeEl    = Utils.findInputByLabelText('الصف');
            if (gradeEl && gradeEl.value !== savedLevel) {
                Utils.setInputValueAngular(gradeEl, savedLevel);
                await Utils.sleep(CONFIG.WAIT_SHORT);
            }
            const codeEl = Utils.findInputByLabelText('كود التلميذ');
            if (!codeEl) { showToast('❌ لم يُعثر على حقل "كود التلميذ"!', 'error'); return false; }
            Utils.setInputValueAngular(codeEl, code);
            await Utils.sleep(500);

            const nidEl = Utils.findInputByLabelText('الرقم القومى');
            if (nidEl?.value) Utils.setInputValueAngular(nidEl, '');

            const searchBtn = Array.from(document.querySelectorAll('button'))
                .find(b => b.innerText.trim() === CONFIG.SELECTORS.SEARCH_BTN_TEXT);
            if (!searchBtn) { showToast('❌ لم يُعثر على زر "بحث"!', 'error'); return false; }
            searchBtn.click();
            showToast(`🔍 بحث عن: ${code}`, 'info');
            return true;
        },

        async onListPageResume() {
            const running = await Store.get('nf_running', false);
            if (!running) return;

            const targetCodes = await Store.get('nf_target_codes', []);
            const currentIdx  = await Store.get('nf_current_index', 0);

            if (currentIdx >= targetCodes.length) {
                const failedCodes = await Store.get('nf_failed_codes', []);
                const retryCount  = await Store.get('nf_auto_retry_count', 0);

                if (failedCodes.length > 0 && retryCount < CONFIG.MAX_AUTO_RETRY) {
                    showToast(
                        `⏳ يوجد ${failedCodes.length} أكواد فاشلة. إعادة محاولة (${retryCount + 1}/${CONFIG.MAX_AUTO_RETRY}) بعد 10 ثواني...`,
                        'warning'
                    );
                    await Utils.sleep(10000);
                    await Store.set('nf_target_codes', failedCodes);
                    await Store.set('nf_current_index', 0);
                    await Store.set('nf_batch_start_index', 0);
                    await Store.set('nf_failed_codes', []);
                    await Store.set('nf_auto_retry_count', retryCount + 1);
                    window.location.reload();
                    return;
                }

                if (failedCodes.length > 0) {
                    showToast(`⚠️ تعذر معالجة ${failedCodes.length} أكواد بعد ${CONFIG.MAX_AUTO_RETRY} محاولات.`, 'error');
                } else {
                    const opMode = await Store.get('nf_mode', 'full');
                    showToast(
                        opMode === 'lang_spec_damg' ? '🎉 اكتمل تعديل اللغات والتخصص والدمج! جميع الأكواد بنجاح.' :
                        (opMode === 'extra_only' ? '🎉 اكتمل تعديل البيانات الإضافية! جميع الأكواد بنجاح.' : '🎉 اكتملت التنقية! جميع الأكواد بنجاح.'),
                        'success'
                    );
                    Utils.playDone();
                }

                await Store.set('nf_running', false);
                await Store.set('nf_auto_retry_count', 0);
                UI.updateStatus('مكتمل', false);
                UI._setToggleBtn(false);
                return;
            }

            const batchSize = await Store.get('nf_batch_size', 0);
            if (batchSize > 0) {
                const batchStart = await Store.get('nf_batch_start_index', 0);
                if (currentIdx - batchStart >= batchSize) {
                    await Store.set('nf_running', false);
                    UI.updateStatus('متوقف بين الدفعات', false);
                    UI._setToggleBtn(false);
                    const startIdxInput = document.getElementById('nf-start-index');
                    if (startIdxInput) startIdxInput.value = currentIdx + 1;
                    await UI.updateStats();
                    showToast(
                        `⏸️ اكتملت دفعة من ${batchSize} طالب (${currentIdx}/${targetCodes.length} إجمالاً). ` +
                        `التقدّم محفوظ — اضغط "بدء / استكمال" عند الاستعداد للدفعة التالية.`,
                        'success'
                    );
                    Utils.playDone();
                    return;
                }
            }

            await UI.updateStats();
            const code    = targetCodes[currentIdx];
            const started = await this.executeSearchForCode(code);
            if (!started) { await Store.set('nf_running', false); return; }

            await Utils.sleep(CONFIG.WAIT_LONG);
            const links = document.querySelectorAll(CONFIG.SELECTORS.STUDENT_LINK);
            if (links.length > 0) {
                window.location.href = links[0].getAttribute('href');
            } else {
                showToast(`⚠️ الكود ${code} غير موجود. تخطي وتسجيل كفاشل.`, 'warning');
                let failed = await Store.get('nf_failed_codes', []);
                if (!failed.includes(code)) { failed.push(code); await Store.set('nf_failed_codes', failed); }
                await Store.set('nf_current_index', currentIdx + 1);
                await Utils.sleep(CONFIG.WAIT_SHORT);
                window.location.reload();
            }
        },

        async onEditPageFixNameAndBack() {
            const running = await Store.get('nf_running', false);
            if (!running) return;

            const targetCodes = await Store.get('nf_target_codes', []);
            const currentIdx  = await Store.get('nf_current_index', 0);
            const currentCode = targetCodes[currentIdx];
            const opMode      = await Store.get('nf_mode', 'full');
            const isExtraOnly = (opMode === 'extra_only');
            const isLangSpec  = (opMode === 'lang_spec_damg');

            showToast(
                isLangSpec ? 'جاري فحص وتعديل اللغات والتخصص والدمج للطالب...' :
                (isExtraOnly ? 'جاري فحص وتعديل البيانات الإضافية للطالب...' : 'جاري فحص وتنقية اسم الطالب...'),
                'info'
            );

            let elapsed = 0;
            let formLoaded = false;
            const pageInputs = () => Array.from(document.querySelectorAll(CONFIG.SELECTORS.FORM_INPUTS))
                .filter(el => !el.closest('#nf-panel'));
            while (elapsed < CONFIG.EDIT_WAIT_MAX) {
                const inp = pageInputs()[0];
                if (inp?.value !== '') { formLoaded = true; break; }
                await Utils.sleep(CONFIG.EDIT_RETRY_INTERVAL);
                elapsed += CONFIG.EDIT_RETRY_INTERVAL;
            }
            await Utils.sleep(CONFIG.WAIT_SHORT);

            if (!formLoaded) {
                showToast('لم يتم تحميل نموذج الطالب! تسجيل كفاشل.', 'error');
                if (currentCode) {
                    let failed = await Store.get('nf_failed_codes', []);
                    if (!failed.includes(currentCode)) { failed.push(currentCode); await Store.set('nf_failed_codes', failed); }
                }
                await Log.add({ code: currentCode || '', status: 'load_failed', changes: [] });
                await Store.set('nf_current_index', currentIdx + 1);
                await Utils.sleep(CONFIG.WAIT_SHORT);
                const listUrl = await Store.get('nf_list_page_url', '/student/list');
                window.location.href = listUrl;
                return;
            }

            // ── تنقية حقول الاسم (يتم تخطيها بالكامل في نمط البيانات الإضافية ونمط اللغات والتخصص) ──
            let namesCleaned  = false;
            let nameFieldsSeen = 0;
            const changes = [];
            const checked = [];

            if (!isExtraOnly) {
                if (!isLangSpec) {
                    console.log('%c[منقّي الأسماء] بدء فحص الحقول...', 'color:#0d9488;font-weight:bold');
                    pageInputs().forEach(el => {
                        if (el.tagName.toLowerCase() !== 'input') return;
                        if (['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(el.type?.toLowerCase())) return;

                        const label      = Utils.findLabelForInput(el);
                        const byControl  = Utils.isNameFormControl(el);
                        const byLabel    = Utils.isNameField(label);
                        const isName     = byControl || byLabel;
                        const ctrlAttr   = el.getAttribute('formcontrolname') || '';
                        console.log(`  · formcontrolname="${ctrlAttr}" id="${el.id}" name="${el.name}" label="${label}" byControl=${byControl} byLabel=${byLabel} value="${el.value}"`);
                        if (!isName) return;

                        nameFieldsSeen++;
                        const original = el.value;
                        const cleaned  = Utils.normalizeArabicName(original);
                        checked.push({ field: ctrlAttr, label, value: original });
                        if (cleaned && cleaned !== original) {
                            console.log(`    ✏️ تغيير: "${original}" → "${cleaned}"`);
                            Utils.setInputValueAngular(el, cleaned);
                            namesCleaned = true;
                            changes.push({ field: ctrlAttr, label, before: original, after: cleaned });
                        }
                    });

                    if (nameFieldsSeen === 0) {
                        showToast('⚠️ لم يتم التعرّف على أي حقل اسم في هذه الصفحة! افتح الكونسول (F12) لمراجعة قائمة الحقول.', 'error');
                        await Log.add({ code: currentCode || '', status: 'no_name_fields', changes: [], checked: [] });
                    }
                } else {
                    console.log('%c[نبراس] نمط "تعديل اللغات والتخصص والدمج" مفعّل — لن يتم تعديل الأسماء.', 'color:#059669;font-weight:bold');
                }
            } else {
                console.log('%c[منقّي الأسماء] نمط "البيانات الإضافية فقط" مفعّل — لن يتم تعديل الأسماء.', 'color:#3b82f6;font-weight:bold');
            }

            // ── تصحيح البيانات الإضافية (العنوان / اللغات / حالة القيد) ──
            let otherFieldsChanged = false;
            const extraEnabled   = !isLangSpec && (isExtraOnly || (await Store.get('nf_extra_enabled', false)));
            const extraOverwrite = await Store.get('nf_extra_overwrite', false);

            if (extraEnabled) {
                // 1) العنوان الافتراضي
                const address = document.querySelector('input[formcontrolname="address"]');
                const defAddress = (await Store.get('nf_default_address', '')).trim();
                if (address && defAddress) {
                    const currentVal = (address.value || '').trim();
                    const shouldApply = extraOverwrite ? (currentVal !== defAddress) : (!currentVal);
                    if (shouldApply) {
                        const before = address.value;
                        Utils.setInputValueAngular(address, defAddress);
                        changes.push({ field: 'address', label: 'العنوان', before, after: defAddress });
                        otherFieldsChanged = true;
                    }
                }

                // 2) اللغة الأولى
                const lang1 = document.querySelector('select[formcontrolname="languageId1"]');
                const defLang1 = await Store.get('nf_default_lang1', '');
                if (lang1 && defLang1) {
                    const currentVal = lang1.value;
                    const isBlank = !currentVal || currentVal === '0' || currentVal === '-1';
                    const shouldApply = extraOverwrite ? (currentVal !== defLang1) : isBlank;
                    if (shouldApply) {
                        const before = (lang1.options[lang1.selectedIndex]?.text || lang1.value || '').trim();
                        Utils.setInputValueAngular(lang1, defLang1);
                        const txt = (CONFIG.LANG1_OPTIONS.find(o => o.value === defLang1) || {}).text || defLang1;
                        changes.push({ field: 'languageId1', label: 'اللغة الأولى', before, after: txt });
                        otherFieldsChanged = true;
                    }
                }

                // 3) اللغة الثانية
                const lang2 = document.querySelector('select[formcontrolname="languageId2"]');
                const defLang2 = await Store.get('nf_default_lang2', '');
                if (lang2 && defLang2) {
                    const currentVal = lang2.value;
                    const isBlank = !currentVal || currentVal === '0' || currentVal === '-1';
                    const shouldApply = extraOverwrite ? (currentVal !== defLang2) : isBlank;
                    if (shouldApply) {
                        const before = (lang2.options[lang2.selectedIndex]?.text || lang2.value || '').trim();
                        Utils.setInputValueAngular(lang2, defLang2);
                        const txt = (CONFIG.LANG2_OPTIONS.find(o => o.value === defLang2) || {}).text || defLang2;
                        changes.push({ field: 'languageId2', label: 'اللغة الثانية', before, after: txt });
                        otherFieldsChanged = true;
                    }
                }

                // 4) حالة قيد الطالب
                const regSel = document.querySelector('select[formcontrolname="registrationId"]');
                const defRegStatus = await Store.get('nf_default_reg_status', '');
                if (regSel && defRegStatus) {
                    const currentVal = regSel.value;
                    const isBlank = !currentVal || currentVal === '0' || currentVal === '-1';
                    const shouldApply = extraOverwrite ? (currentVal !== defRegStatus) : isBlank;
                    if (shouldApply) {
                        const hasOpt = Array.from(regSel.options).some(o => o.value === defRegStatus);
                        if (hasOpt) {
                            const before = (regSel.options[regSel.selectedIndex]?.text || regSel.value || '').trim();
                            Utils.setInputValueAngular(regSel, defRegStatus);
                            const txt = (CONFIG.REG_STATUS_OPTIONS.find(o => o.value === defRegStatus) || {}).text || defRegStatus;
                            changes.push({ field: 'registrationId', label: 'حالة قيد الطالب', before, after: txt });
                            otherFieldsChanged = true;
                        }
                    }
                }
            }

            // ── تعديل اللغات والتخصص وحالة الدمج والشعبة ──
            const excelMap = await Store.get('nf_excel_student_map', null);
            const hasExcelMap = (excelMap && typeof excelMap === 'object' && Object.keys(excelMap).length > 0);

            if (isLangSpec || hasExcelMap) {
                console.log('%c[نبراس] نمط "تعديل اللغات والتخصص والدمج" جاري فحص الحقول للطالب: ' + currentCode, 'color:#059669;font-weight:bold');
                
                let studentRow = null;
                if (hasExcelMap) {
                    const urlId = Utils.extractStudentId(window.location.href);
                    const codeInp = document.querySelector('input[formcontrolname="studentCode"], input[formcontrolname="code"], input[formcontrolname="id"]');
                    const codeVal = Utils.cleanDigitString(codeInp?.value);
                    const nidInp = document.querySelector('input[formcontrolname="nationalId"], input[formcontrolname="nid"], input[formcontrolname="national_id"]');
                    const nidVal = Utils.cleanDigitString(nidInp?.value);

                    if (currentCode && excelMap[currentCode]) studentRow = excelMap[currentCode];
                    else if (urlId && excelMap[urlId]) studentRow = excelMap[urlId];
                    else if (codeVal && excelMap[codeVal]) studentRow = excelMap[codeVal];
                    else if (nidVal && excelMap[nidVal]) studentRow = excelMap[nidVal];
                    else {
                        for (const inp of Array.from(document.querySelectorAll('input'))) {
                            const val = Utils.cleanDigitString(inp.value);
                            if (val && val.length >= 6 && excelMap[val]) {
                                studentRow = excelMap[val];
                                break;
                            }
                        }
                    }
                }

                const policy = await Store.get('nf_damg_lang_policy', 'empty');
                const isOverwrite = (policy === 'overwrite');

                const targetLang1 = studentRow ? (studentRow.lang1 || '') : (await Store.get('nf_default_lang1', ''));
                const targetLang2 = studentRow ? (studentRow.lang2 || '') : (await Store.get('nf_default_lang2', ''));
                const targetDamg  = (studentRow && studentRow.damg !== undefined && studentRow.damg !== '' && studentRow.damg !== null)
                    ? studentRow.damg : (studentRow ? '' : await Store.get('nf_default_damg', ''));
                const targetDiv   = studentRow ? (studentRow.division || '') : (await Store.get('nf_default_division', ''));
                const targetSpec  = studentRow ? (studentRow.specialization || '') : (await Store.get('nf_default_spec', ''));

                // 1) اللغة الأولى (languageId1)
                const lang1 = document.querySelector('select[formcontrolname="languageId1"]');
                if (lang1 && targetLang1) {
                    const curVal = String(lang1.value ?? '').trim();
                    const isBlank = !curVal || curVal === '0' || curVal === '-1';
                    const shouldApply = studentRow ? (curVal !== targetLang1) : (isOverwrite ? (curVal !== targetLang1) : isBlank);
                    if (shouldApply) {
                        const before = (lang1.options[lang1.selectedIndex]?.text || lang1.value || '').trim();
                        Utils.setAngularSelectValue(lang1, targetLang1);
                        const txt = (CONFIG.LANG1_OPTIONS.find(o => o.value === targetLang1) || {}).text || targetLang1;
                        changes.push({ field: 'languageId1', label: 'اللغة الأولى', before, after: txt });
                        otherFieldsChanged = true;
                    }
                }

                // 2) اللغة الثانية (languageId2)
                const lang2 = document.querySelector('select[formcontrolname="languageId2"]');
                if (lang2 && targetLang2) {
                    const curVal = String(lang2.value ?? '').trim();
                    const isBlank = !curVal || curVal === '-1'; // 0 تعني 'لا توجد'
                    const shouldApply = studentRow ? (curVal !== targetLang2) : (isOverwrite ? (curVal !== targetLang2) : isBlank);
                    if (shouldApply) {
                        const before = (lang2.options[lang2.selectedIndex]?.text || lang2.value || '').trim();
                        Utils.setAngularSelectValue(lang2, targetLang2);
                        const txt = (CONFIG.LANG2_OPTIONS.find(o => o.value === targetLang2) || {}).text || targetLang2;
                        changes.push({ field: 'languageId2', label: 'اللغة الثانية', before, after: txt });
                        otherFieldsChanged = true;
                    }
                }

                // 3) الموقف من الدمج (disabilityId / obstacleId)
                let damgSel = document.querySelector('select[formcontrolname="disabilityId"]') ||
                              document.querySelector('select[formcontrolname="obstacleId"]');
                if (!damgSel) {
                    // بحث بديل ذكي عن select الدمج عبر الـ Label المجاور
                    const allLabels = Array.from(document.querySelectorAll('label, .form-label'));
                    const damgLabel = allLabels.find(l => /الموقف من الدمج|نوع الاعاق|الدمج/i.test((l.textContent || '').trim()));
                    if (damgLabel) {
                        const container = damgLabel.closest('.form-field, .forms-row, .col-md-6, .col-sm-6, .form-group') || damgLabel.parentElement;
                        damgSel = container?.querySelector('select') || null;
                    }
                }
                if (damgSel && targetDamg !== '' && targetDamg !== null && targetDamg !== undefined) {
                    const curVal = String(damgSel.value ?? '').trim();
                    // إذا كان الطالب مذكوراً في شيت الإكسيل، نطبق دمج الإكسيل دائماً طالما يختلف عن القيمة الحالية
                    // أما إذا كانت قيمة عامة، فتطبق حسب السياسة (أو إذا كانت القيمة الحالية '0' لا يوجد والمستهدف إعاقة)
                    const shouldApply = studentRow 
                        ? (curVal !== targetDamg) 
                        : (isOverwrite ? (curVal !== targetDamg) : (!curVal || curVal === '-1' || (curVal === '0' && targetDamg !== '0')));

                    if (shouldApply) {
                        const before = (damgSel.options[damgSel.selectedIndex]?.text || damgSel.value || '').trim();
                        Utils.setAngularSelectValue(damgSel, targetDamg);
                        const txt = (CONFIG.DISABILITY_OPTIONS.find(o => o.value === targetDamg) || {}).text || targetDamg;
                        changes.push({ field: 'disabilityId', label: 'الموقف من الدمج', before, after: txt });
                        otherFieldsChanged = true;
                    }
                }

                // 4) الشعبة (divisionId) — مع فحص التعطيل بأمان تام
                const divSel = document.querySelector('select[formcontrolname="divisionId"]');
                if (divSel) {
                    if (divSel.disabled) {
                        console.log('[نبراس] حقل الشعبة معطل في هذا الصف الدراسي — تم التخطي بدون أخطاء.');
                    } else if (targetDiv) {
                        const curVal = divSel.value;
                        const isBlank = !curVal || curVal === '0' || curVal === '-1';
                        if (isOverwrite ? (curVal !== targetDiv) : isBlank) {
                            const before = (divSel.options[divSel.selectedIndex]?.text || divSel.value || '').trim();
                            Utils.setAngularSelectValue(divSel, targetDiv);
                            const txt = (CONFIG.DIVISION_OPTIONS.find(o => o.value === targetDiv) || {}).text || targetDiv;
                            changes.push({ field: 'divisionId', label: 'الشعبة', before, after: txt });
                            otherFieldsChanged = true;
                            // إتاحة وقت كافٍ لـ Angular لإعادة بناء خيارات قائمة التخصص التابعة
                            await Utils.sleep(CONFIG.WAIT_SHORT);
                        }
                    }
                }

                // 5) التخصص (specializationId) — مع فحص التعطيل والمطابقة التلقائية للشعبة
                if (!targetSpec) {
                    if (targetDiv === '203') targetSpec = '676';
                    else if (targetDiv === '204') targetSpec = '677';
                    else if (targetDiv === '205') targetSpec = '678';
                    else if (targetDiv === '206') targetSpec = '679';
                    else if (targetDiv === '1') targetSpec = '1';
                }
                const specSel = document.querySelector('select[formcontrolname="specializationId"]');
                if (specSel) {
                    if (specSel.disabled) {
                        console.log('[نبراس] حقل التخصص معطل في هذا الصف الدراسي — تم التخطي بدون أخطاء.');
                    } else if (targetSpec) {
                        const curVal = specSel.value;
                        const isBlank = !curVal || curVal === '0' || curVal === '-1';
                        if (isOverwrite ? (curVal !== targetSpec) : isBlank) {
                            const before = (specSel.options[specSel.selectedIndex]?.text || specSel.value || '').trim();
                            Utils.setAngularSelectValue(specSel, targetSpec);
                            const txt = (CONFIG.SPECIALIZATION_OPTIONS.find(o => o.value === targetSpec) || {}).text || targetSpec;
                            changes.push({ field: 'specializationId', label: 'التخصص', before, after: txt });
                            otherFieldsChanged = true;
                        }
                    }
                }
            }

            // ── فحص الفصل/العنوان/التليفون/المحمول (يعمل دائمًا) — أي خطأ يمنع الحفظ ──
            let manualFixed = false;
            const problems = Fixer.collectProblems(extraEnabled);
            if (problems.length) {
                const res = await Fixer.waitForManualFix(problems, extraEnabled);

                if (res === 'resolved') {
                    for (const p of problems) {
                        changes.push({
                            field: p.key, label: p.label,
                            before: p.value || '(فارغ)',
                            after: '(تعديل يدوي) ' + Fixer._readFieldValue(p.selector)
                        });
                    }
                    manualFixed = true;
                } else {
                    if (res === 'timeout') {
                        const cur = Fixer.collectProblems(extraEnabled);
                        const list = cur.length ? cur : problems;
                        console.log('%c[منقّي الأسماء] انتهت مهلة التعديل اليدوي — توقف.', 'color:#d97706;font-weight:bold');
                        showToast('⏸ انتهت مهلة التعديل اليدوي — راجع البانر أعلى الشاشة.', 'warning');

                        await Store.set('nf_running', false);
                        await Store.set('nf_paused_banner', true);
                        UI.updateStatus('متوقف — بانتظار تصحيح البيانات', false);
                        UI._setToggleBtn(false);

                        document.getElementById('nf-pause-banner')?.remove();
                        await UI.highlightProblems(list);
                        UI.showPauseForProblemsBanner(list);

                        const first = list[0].key;
                        await Log.add({
                            code: currentCode || '',
                            status: first === 'class' ? 'paused_class_empty'
                                  : first === 'address' ? 'paused_address_invalid'
                                  : 'paused_contact_invalid',
                            changes,
                            checked,
                            note: list.map(p => `${p.label}: ${p.reason}${p.value ? ` ("${p.value}")` : ''}`).join(' | ')
                        });
                    }
                    return;
                }
            }

            // ── الحفظ ──
            if (namesCleaned || otherFieldsChanged || manualFixed) {
                showToast(`✏️ تم رصد ${changes.length} تعديل، جاري حفظ التعديل...`, 'info');
                await Utils.sleep(CONFIG.WAIT_SHORT);
                const findSaveBtn = () => Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .find(b => CONFIG.SELECTORS.SAVE_BTN_REGEX.test((b.innerText || b.value || '').trim()));
                let saveBtn = findSaveBtn();
                if (saveBtn) {
                    let saved = false;
                    let abort = null;          // 'stopped' | 'left'
                    let failErrs = null;       // أخطاء انتهت مهلتها → تخطي
                    let pending = null;        // أخطاء رُصدت بعد آخر ضغطة حفظ
                    let viaPopup = false;
                    const baseline = Fixer.errorMessageBaseline();

                    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
                        saveBtn = findSaveBtn() || saveBtn;
                        const errs = pending || Fixer.collectSaveErrors(null, saveBtn);
                        pending = null;
                        if (errs.length) {
                            const r = await Fixer.waitForSaveFix(errs, baseline);
                            if (r === 'stopped' || r === 'left') { abort = r; break; }
                            if (r !== 'resolved') { failErrs = errs; break; }
                            saveBtn = findSaveBtn() || saveBtn;
                        }
                        saveBtn.click();
                        viaPopup = await Utils.confirmSavePopupIfPresent();
                        await Utils.sleep(1200);
                        if (!/\/student\/edit\//i.test(window.location.href)) { saved = true; break; }
                        const after = Fixer.collectSaveErrors(baseline, saveBtn);
                        if (!after.length) saved = true; else pending = after;
                    }
                    if (!saved && !failErrs && !abort && pending) failErrs = pending;

                    if (abort) return;

                    if (saved) {
                        if (viaPopup) {
                            showToast('💾 ظهرت نافذة "تأكيد الحفظ" وتم الضغط على "نعم" — تم الحفظ', 'success');
                        } else {
                            showToast('💾 تم حفظ التعديل على الموقع', 'success');
                        }
                        const fixedCount = await Store.get('nf_fixed_count', 0);
                        await Store.set('nf_fixed_count', fixedCount + 1);
                        const statusLabel = isLangSpec ? 'lang_spec_fixed' : 'fixed';
                        await Log.add({ code: currentCode || '', status: statusLabel, changes, checked });
                        await Utils.sleep(CONFIG.WAIT_MED);
                    } else {
                        showToast('⏭ تعذّر الحفظ ولم يُصحَّح في المهلة — تم تخطي الطالب.', 'warning');
                        await Log.add({
                            code: currentCode || '',
                            status: 'skipped_save_error',
                            changes,
                            checked,
                            note: (failErrs || []).map(e => `${e.label}: ${e.reason}${e.value ? ` ("${e.value}")` : ''}`).join(' | ') || 'خطأ أثناء الحفظ'
                        });
                    }
                } else {
                    showToast(
                        isLangSpec ? '⚠️ تم تعديل اللغات والتخصص والدمج محلياً، لكن لم يُعثر على زر الحفظ بالصفحة' :
                        (isExtraOnly ? '⚠️ تم تعديل البيانات الإضافية محلياً، لكن لم يُعثر على زر الحفظ بالصفحة' : '⚠️ تم تنقية الاسم محلياً، لكن لم يُعثر على زر الحفظ بالصفحة'),
                        'warning'
                    );
                    await Log.add({ code: currentCode || '', status: 'save_button_missing', changes, checked });
                }
            } else if (!isExtraOnly && !isLangSpec && nameFieldsSeen > 0) {
                showToast(`الاسم نظيف بالفعل (فُحص ${nameFieldsSeen} حقل)، لا حاجة للتعديل.`, 'info');
                await Log.add({ code: currentCode || '', status: 'clean', changes: [], checked });
            } else if (isLangSpec) {
                showToast('بيانات اللغات والتخصص والدمج مطابقة بالفعل، لا حاجة للتعديل.', 'info');
                await Log.add({ code: currentCode || '', status: 'clean', changes: [], checked });
            } else if (isExtraOnly) {
                showToast('البيانات الإضافية مطابقة بالفعل، لا حاجة للتعديل.', 'info');
                await Log.add({ code: currentCode || '', status: 'clean', changes: [], checked });
            }

            await Store.set('nf_current_index', currentIdx + 1);
            await Utils.sleep(CONFIG.WAIT_SHORT);
            const listUrl = await Store.get('nf_list_page_url', '/student/list');
            window.location.href = listUrl;
        }
    };

    // ─────────────────────────────────────────
    // 6. نقطة الانطلاق (تكامل نبراس)
    // ─────────────────────────────────────────
    // الفرق عن الإضافة المستقلة: اللوحة لا تُنشأ تلقائيًا في كل صفحة طالب.
    // تُنشأ (أ) عند NEPRAS_NAME_FIXER_SHOW من نافذة نبراس، أو (ب) تلقائيًا حين تكون هناك تنقية جارية
    // أو متوقفة بانتظار تدخل يدوي (nf_running / nf_paused_banner) كي يرى المستخدم التقدم ويتحكم فيه.
    // منطق الاستئناف نفسه (قائمة ← تعديل ← قائمة) كما هو؛ كل تنقّل فيه تحميل كامل للصفحة،
    // وكل تحميل يمرّ على page_loader.js ← حقن أدوات نبراس ← boot().
    let panelJob = null;
    function showPanel() {
        if (panelJob) return panelJob;   // يمنع إنشاء لوحتين لو تزامن boot مع NEPRAS_NAME_FIXER_SHOW
        panelJob = (async () => {
            const existed = !!document.getElementById('nf-panel');
            await UI.ensureUI();
            const panel = document.getElementById('nf-panel');
            if (!panel) return false;
            if (existed) {
                // أُخفيت بزر ✕ سابقًا ← أعدها وأزل الزر العائم.
                if (panel.style.display === 'none') {
                    panel.style.display = 'flex';
                    panel.style.opacity = '1';
                    panel.style.transform = 'scale(1)';
                }
                document.getElementById('nf-fab')?.remove();
            } else {
                // populateLevels تستبدل عنصر القائمة بنسخة جديدة، فلا تُستدعى إلا عند إنشاء اللوحة.
                await UI.populateLevels();
                await UI.updateStats();
            }

            // تطبيق ومزامنة نمط التشغيل المختار (تنقية أسماء مقابل تعديل اللغات والدمج والشعب)
            try {
                const currentMode = await Store.get('nf_mode', 'full');
                if (currentMode === 'lang_spec_damg') {
                    const r = document.getElementById('nf-mode-lang-spec');
                    if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
                } else if (currentMode === 'extra_only') {
                    const r = document.getElementById('nf-mode-extra');
                    if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
                } else {
                    const r = document.getElementById('nf-mode-full');
                    if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
                }
            } catch (_) {}
            return true;
        })().finally(() => { panelJob = null; });
        return panelJob;
    }

    let booting = false;
    async function boot() {
        if (booting) return;
        booting = true;
        try {
            try {
                chrome.storage.local.remove(['nf_log'], () => void chrome.runtime.lastError);
            } catch (_) {}

            const url = window.location.href.toLowerCase();
            if (!url.includes('/student/')) return;

            const running      = await Store.get('nf_running', false);
            const pausedBanner = await Store.get('nf_paused_banner', false);
            if (running || pausedBanner) await showPanel();

            // إعادة إظهار بانر التوقف إن كان لا يزال مطلوباً
            if (pausedBanner && url.includes('/student/edit/')) {
                // ننتظر قليلاً لتحميل النموذج ثم نفحص الحالة الحقيقية
                await Utils.sleep(2500);

                const problems = Fixer.collectProblems(true);
                if (problems.length) {
                    await UI.highlightProblems(problems);
                    UI.showPauseForProblemsBanner(problems);
                } else {
                    // المشكلة انحلّت — نلغي العلامة ونكمل
                    await Store.set('nf_paused_banner', false);
                }
            }

            if (url.includes('/student/edit/')) {
                await Fixer.onEditPageFixNameAndBack();
            } else if (url.includes('/student/list') || url.includes('/student/index')) {
                await Utils.sleep(1000);
                await Fixer.onListPageResume();
            }
        } catch (err) {
            console.error('[NameFixer] Boot Error:', err);
        } finally {
            booting = false;
        }
    }

    // رسائل نبراس. تنبيه: مستمع attendance.js يردّ { status: 'success' } فورًا على أي رسالة غير معروفة،
    // فالرد الذي يصل المُرسِل قد لا يكون ردّنا. لذلك لا يعتمد أحد على محتوى الرد؛ الأثر الفعلي
    // (ظهور اللوحة / قيمة nf_running في التخزين) هو المرجع.
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const action = request && request.action;

        if (action === 'NEPRAS_NAME_FIXER_SHOW' || action === 'NAME_FIXER_OPEN') {
            (async () => {
                if (!window.location.pathname.toLowerCase().includes('/student/')) {
                    showToast('افتح صفحة قائمة الطلاب في موقع الوزارة (بعد تسجيل الدخول) ثم أعد فتح المنقّي.', 'warning');
                    sendResponse({ ok: false, reason: 'NOT_STUDENT_PAGE' });
                    return;
                }
                const shown = await showPanel();
                sendResponse({ ok: shown, running: await Store.get('nf_running', false) });
            })().catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
            return true;
        }

        if (action === 'NEPRAS_NAME_FIXER_STOP' || action === 'STOP_NAME_FIXER') {
            (async () => {
                await Store.set('nf_running', false);   // التقدم (الأكواد والفهرس) يبقى محفوظًا للاستئناف
                UI.updateStatus('متوقف', false);
                UI._setToggleBtn(false);
                sendResponse({ ok: true });
            })().catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
            return true;
        }

        return false;   // غير معنيّ بها
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    console.log(`[نبراس] وحدة ${globalThis.NeprasBrand?.tools?.nameFixer || 'منقّي أسماء الطلاب'} ${VER} جاهزة`);

    const NeprasNameFixer = {
        CONFIG,
        Store,
        Log,
        Utils,
        UI,
        Fixer,
        showPanel
    };
    if (typeof window !== 'undefined') window.NeprasNameFixer = NeprasNameFixer;
    if (typeof module !== 'undefined' && module.exports) module.exports = NeprasNameFixer;

})();
