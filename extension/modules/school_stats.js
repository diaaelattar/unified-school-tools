// ============================================================
// Nepras School Statistics v1 — fast list-based engine
// Source: student.emis.gov.eg "بحث عن تلميذ" tables only.
// No per-student deep pages are opened.
// ============================================================

const NEPRAS_SCHOOL_STATS_STORAGE_KEY = "neprasSchoolStatsV1";
let neprasSchoolStatsRunning = false;

function neprasStatsStopRequested() {
  try {
    return window.__NEPRAS_STOP_ALL_REQUESTED__ === true ||
      (typeof window.neprasIsGlobalStopRequested === "function" && window.neprasIsGlobalStopRequested());
  } catch (_) {
    return false;
  }
}

function neprasStatsThrowIfStopped() {
  if (!neprasStatsStopRequested()) return;
  const error = new Error("USER_STOPPED");
  error.code = "USER_STOPPED";
  throw error;
}

function neprasStatsNorm(v) {
  return String(v ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function neprasStatsFindKey(row, patterns) {
  const keys = Object.keys(row || {});
  for (const key of keys) {
    const nk = neprasStatsNorm(key);
    if (patterns.some(p => nk.includes(neprasStatsNorm(p)))) return key;
  }
  return "";
}

function neprasStatsValue(row, patterns) {
  if (!row || typeof row !== "object") return "";
  for (const p of patterns || []) {
    if (row[p] !== undefined && row[p] !== null && String(row[p]).trim() !== "") {
      return String(row[p]).trim();
    }
  }
  const k = neprasStatsFindKey(row, patterns);
  return k ? String(row?.[k] ?? "").trim() : "";
}

// تحويل الأرقام الهندية/الفارسية إلى لاتينية: من modules/egypt_ids.js (مصدر واحد).
function neprasStatsEnglishDigits(value) {
  return (globalThis.NeprasEgypt || window.NeprasEgypt).toLatinDigits(value);
}

function neprasStatsGender(row) {
  const direct = neprasStatsValue(row, ["النوع", "الجنس", "gender", "__neprasStatsGender"]);
  const nd = neprasStatsNorm(direct);
  if (nd.includes("ذكر") || nd.includes("بنين") || nd.includes("ولد")) return "بنين";
  if (nd.includes("انث") || nd.includes("بنات") || nd.includes("بنت")) return "بنات";

  // Egyptian national ID: 13th digit odd=male, even=female.
  const nationalId = neprasStatsEnglishDigits(neprasStatsValue(row, ["الرقم القومي", "رقم قومي", "nationalId", "nid"])).replace(/\D/g, "");
  if (nationalId.length === 14) {
    const digit = Number(nationalId[12]);
    if (Number.isFinite(digit)) return digit % 2 ? "بنين" : "بنات";
  }
  return "غير محدد";
}

function neprasStatsIsIntegrated(value) {
  const raw = String(value ?? "").trim();
  const n = neprasStatsNorm(raw);
  if (!n) return false;

  // قيم سلبية شائعة في موقع بيانات التلميذ.
  const negatives = [
    "لا يوجد", "غير مدمج", "ليس مدمج", "ليس من طلاب الدمج",
    "لا ينطبق", "بدون دمج", "لا", "0", "false", "غير موجود"
  ];
  if (negatives.some(x => n === neprasStatsNorm(x) || n.includes(neprasStatsNorm(x)))) return false;

  // قيم إيجابية محتملة، بما فيها مسميات الدمج الجزئي/الكلي.
  const positives = [
    "دمج", "مدمج", "نعم", "1", "true", "كلي", "جزئي",
    "اعاق", "ذوي الاحتياجات", "احتياجات خاصه"
  ];
  return positives.some(x => n === neprasStatsNorm(x) || n.includes(neprasStatsNorm(x)));
}

function neprasStatsIsHomeStudent(row) {
  const eduType = neprasStatsValue(row, ["نوعية التعليم", "نوعيه التعليم", "نظام التعليم", "نوع التعليم", "التعليم", "eduSystem", "studyType", "mode"]);
  const n = neprasStatsNorm(eduType);
  return n.includes("منازل") || n.includes("منزل") || n.includes("منزلي");
}

function neprasStatsIsWorkerStudent(row) {
  const eduType = neprasStatsValue(row, ["نوعية التعليم", "نوعيه التعليم", "نظام التعليم", "نوع التعليم", "التعليم", "eduSystem", "studyType", "mode"]);
  const n = neprasStatsNorm(eduType);
  const status = neprasStatsNorm(neprasStatsValue(row, ["حالة القيد", "حاله القيد", "الحالة", "enrollStatus", "status"]));
  return n.includes("عمال") || n.includes("عمل") || status.includes("عمال");
}

function neprasStatsValidClassName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const n = neprasStatsNorm(neprasStatsEnglishDigits(raw));
  if (!n) return "";

  // في طلبات النقل: الفصل 0 غالبًا يعني منازل/بدون فصل، وليس فصلًا فعليًا.
  const invalidExact = new Set(["0", "-1", "--", "-", "اختر", "بدون فصل", "لا يوجد", "غير محدد"]);
  if (invalidExact.has(n)) return "";
  if (n.includes("اختر") || n.includes("بدون فصل") || n.includes("لا يوجد")) return "";

  return raw;
}

function neprasStatsIntegrationFromRow(row) {
  row = row || {};

  // v1.0 — المصدر الأدق:
  // GetSchoolStudent يرجع obstacleId و obstacleName.
  // أي obstacleId أكبر من صفر = طالب دمج.
  // obstacleId = 0 = «لا يوجد».
  const raw =
    row.__neprasApiRaw ||
    {};

  const obstacleIdRaw =
    raw.obstacleId ??
    row.obstacleId ??
    row["obstacleId"] ??
    "";

  if (
    obstacleIdRaw !== "" &&
    obstacleIdRaw !== null &&
    obstacleIdRaw !== undefined
  ) {
    const obstacleId =
      Number(obstacleIdRaw);

    if (
      Number.isFinite(obstacleId)
    ) {
      return obstacleId > 0;
    }
  }

  // المصدر الثاني: وصف الموقف من الدمج.
  // القاعدة الصحيحة في موقع الوزارة:
  // أي قيمة فعلية غير «لا يوجد» تعتبر حالة دمج،
  // وتشمل بطء التعلم، الإعاقة الحركية، الذهنية... إلخ.
  const direct =
    neprasStatsValue(
      row,
      [
        "الموقف من الدمج",
        "حاله الدمج",
        "حالة الدمج",
        "الدمج",
        "damg",
        "integrationType"
      ]
    ) ||
    String(
      raw.obstacleName || ""
    ).trim();

  if (direct) {
    return neprasStatsIsPositiveIntegrationOptionText(
      direct
    );
  }
  if (row.integrated === "نعم" || row.integrated === true) {
    return true;
  }

  // fallback فقط للصفحات القديمة التي لا تعرض obstacleId/name.
  for (
    const [key, value]
    of Object.entries(row)
  ) {
    const nk =
      neprasStatsNorm(key);

    const nv =
      neprasStatsNorm(value);

    if (
      nk.includes("دمج") ||
      nv.includes("دمج") ||
      nv.includes("مدمج")
    ) {
      if (
        neprasStatsIsIntegrated(
          value
        )
      ) {
        return true;
      }
    }
  }

  return false;
}


// ============================================================
// الدمج — مصدر دقيق وسريع من فلتر «الموقف من الدمج» في بحث عن تلميذ
// الفكرة: أي قيمة غير «لا يوجد» وغير placeholder تُعتبر حالة دمج صحيحة.
// هذا يطابق القيم الفعلية بالموقع مثل:
// إعاقة بصرية / سمعية / ذهنية / شلل دماغي / توحد / متلازمة داون / إعاقة حركية / بطء التعلم
// ============================================================

function neprasStatsIsPositiveIntegrationOptionText(value) {
  const n = neprasStatsNorm(value);
  if (!n) return false;

  const negative = [
    "اختر",
    "لا يوجد",
    "لايوجد",
    "غير محدد",
    "--",
    "-"
  ];

  if (negative.some(x => n === neprasStatsNorm(x))) {
    return false;
  }

  return true;
}

function neprasStatsStatusBucket(status) {
  const raw = String(status || "").trim();
  const n = neprasStatsNorm(raw);

  if (!n) return "غير محدد";

  // نرتب الحالات من الأكثر تحديدًا إلى الأكثر عمومية
  // حتى لا تتحول «ناجح ومنقول» مثلًا إلى «محولون» بالخطأ.
  if (n.includes("ناجح") && n.includes("منقول")) return "ناجح ومنقول";
  if (n.includes("باق") && n.includes("اعاد")) return "باقون للإعادة";
  if (n.includes("راسب")) return "راسبون";
  if (n.includes("منقطع")) return "منقطعون";
  if (n.includes("مفصول")) return "مفصولون";
  if (n.includes("محول")) return "محولون";
  if (n.includes("منقول")) return "منقولون";
  if (n.includes("مقيد")) return "مقيدون";
  if (n.includes("مستجد")) return "مستجدون";

  // أي حالة أخرى غير معروفة نحافظ على اسمها كما يرسله الموقع.
  return raw;
}

function neprasStatsOrderedStatusNames(statuses) {
  const priority = [
    "ناجح ومنقول",
    "مقيدون",
    "مستجدون",
    "باقون للإعادة",
    "راسبون",
    "منقطعون",
    "محولون",
    "منقولون",
    "مفصولون"
  ];

  const keys = Object.keys(statuses || {})
    .filter(k => k && k !== "غير محدد" && Number(statuses[k] || 0) > 0);

  const ordered = [];

  for (const name of priority) {
    if (keys.includes(name)) ordered.push(name);
  }

  const rest = keys
    .filter(k => !ordered.includes(k))
    .sort((a, b) => a.localeCompare(b, "ar"));

  return [...ordered, ...rest];
}

function neprasStatsInc(obj, key, n = 1) {
  const k = key || "غير محدد";
  obj[k] = (obj[k] || 0) + n;
}

function neprasStatsDetectSchoolName() {
  try {
    const changeSchoolEl = document.querySelector("app-change-school");
    if (changeSchoolEl) {
      const spans = changeSchoolEl.querySelectorAll("label span, span");
      for (const sp of spans) {
        const txt = (sp.innerText || sp.textContent || "").trim();
        if (txt.length >= 3 && /[\u0600-\u06FF]/.test(txt) && !/^\d+$/.test(txt)) {
          return txt;
        }
      }
    }
    const candidates = [
      "/html/body/app-root/app-app-layout/main-header/div/div/app-change-school/div/label[1]/span",
      "//app-change-school//span",
      "//*[@class='school-name']"
    ];
    for (const xp of candidates) {
      try {
        const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)?.singleNodeValue;
        const t = String(r?.innerText || r?.textContent || "").trim();
        if (t && t.length >= 3 && !/^\d+$/.test(t)) return t;
      } catch (_) {}
    }
  } catch (_) {}
  return "المدرسة الحالية";
}


function neprasStatsEmptyGenderSplit() {
  return { "بنين": 0, "بنات": 0, "غير محدد": 0 };
}

function neprasStatsNewBreakdown() {
  return {
    enrollment: {
      "منتظم": neprasStatsEmptyGenderSplit(),
      "منازل": neprasStatsEmptyGenderSplit(),
      "عمال": neprasStatsEmptyGenderSplit()
    },
    integration: {
      "منتظم": neprasStatsEmptyGenderSplit(),
      "منازل": neprasStatsEmptyGenderSplit(),
      "عمال": neprasStatsEmptyGenderSplit()
    },
    statuses: {}
  };
}

function neprasStatsEnsureStatusBreakdown(breakdown, statusName) {
  if (!breakdown.statuses[statusName]) {
    breakdown.statuses[statusName] = {
      "منتظم": neprasStatsEmptyGenderSplit(),
      "منازل": neprasStatsEmptyGenderSplit(),
      "عمال": neprasStatsEmptyGenderSplit()
    };
  }
  return breakdown.statuses[statusName];
}

function neprasStatsGradeSummary(gradeName, rows, mainRows = [], integratedKeys = null, integrationStates = []) {
  const unique = new Map();
  for (const row of rows || []) {
    const code = neprasStatsValue(row, ["كود التلميذ", "كود الطالب", "كود", "studentCode", "code"]);
    const nid = neprasStatsValue(row, ["الرقم القومي", "رقم قومي", "nationalId", "nid"]);
    const name = neprasStatsValue(row, ["اسم التلميذ", "اسم الطالب", "الاسم", "fullName", "name"]);
    const key = String(code || nid || `${name}|${JSON.stringify(row)}`).trim();
    if (!unique.has(key)) unique.set(key, row);
  }

  // خريطة من بيانات بحث عن تلميذ نفسها؛ نستخدمها خصوصًا للدمج ونوعية التعليم.
  const mainByCode = new Map();
  for (const row of mainRows || []) {
    const code = neprasStatsValue(row, ["كود التلميذ", "كود الطالب", "كود", "studentCode", "code"]);
    if (code) mainByCode.set(String(code).trim(), row);
  }

  const data = Array.from(unique.values());
  const out = {
    grade: gradeName,
    total: data.length,
    boys: 0,
    girls: 0,
    unknownGender: 0,
    classes: new Set(),
    homes: 0,
    integrated: 0,
    integrationStates: Array.isArray(integrationStates) ? integrationStates : [],
    statuses: {},
    breakdown: neprasStatsNewBreakdown(),
    rows: data
  };

  for (const row of data) {
    const code = neprasStatsValue(row, ["كود التلميذ", "كود الطالب", "كود", "studentCode", "code"]);
    const sourceRow = mainByCode.get(String(code || "").trim()) || row;

    const gender = neprasStatsGender(row);
    if (gender === "بنين") out.boys++;
    else if (gender === "بنات") out.girls++;
    else out.unknownGender++;

    const isWorker = neprasStatsIsWorkerStudent(sourceRow) || neprasStatsIsWorkerStudent(row);
    const isHome = !isWorker && (neprasStatsIsHomeStudent(sourceRow) || neprasStatsIsHomeStudent(row));
    if (isWorker) out.workers = (out.workers || 0) + 1;
    else if (isHome) out.homes++;

    const educationMode = isWorker ? "عمال" : (isHome ? "منازل" : "منتظم");
    const genderKey =
      gender === "بنين" || gender === "بنات"
        ? gender
        : "غير محدد";

    out.breakdown.enrollment[educationMode][genderKey]++;

    // عدد الفصول = الفصول الفعلية فقط. لا نحسب 0/بدون فصل، ولا طالب المنازل أو العمال.
    if (!isHome && !isWorker) {
      const className = neprasStatsValidClassName(
        neprasStatsValue(row, ["الفصل", "الصف الفصل", "اسم الفصل", "classRoom", "className"])
      );
      if (className) out.classes.add(className.trim());
    }

    const normalizedNid = neprasStatsEnglishDigits(
      neprasStatsValue(row, ["الرقم القومي", "رقم قومي", "nationalId", "nid"])
    ).replace(/\D/g, "");

    const integrationKey = String(code || normalizedNid || neprasStatsValue(row, ["اسم التلميذ", "اسم الطالب", "الاسم", "fullName", "name"]) || "").trim();

    const isIntegrated =
      integratedKeys instanceof Set
        ? integratedKeys.has(integrationKey)
        : (neprasStatsIntegrationFromRow(sourceRow) || neprasStatsIntegrationFromRow(row));

    if (isIntegrated) {
      out.integrated++;
      out.breakdown.integration[educationMode][genderKey]++;
    }

    const statusRaw = neprasStatsValue(
      sourceRow,
      ["حالة القيد", "حاله القيد", "الموقف من القيد", "الحالة", "enrollStatus", "status"]
    ) || neprasStatsValue(
      row,
      ["حالة القيد", "حاله القيد", "الموقف من القيد", "الحالة", "enrollStatus", "status"]
    );

    const statusBucket = neprasStatsStatusBucket(statusRaw);
    neprasStatsInc(out.statuses, statusBucket);

    const statusBreakdown =
      neprasStatsEnsureStatusBreakdown(out.breakdown, statusBucket);
    statusBreakdown[educationMode][genderKey]++;

    // نحفظ التصنيف المشتق على الصف نفسه لاستخدامه لاحقًا بدون أي سحب جديد.
    row.__neprasStatsGender = genderKey;
    row.__neprasStatsMode = educationMode;
    row.__neprasStatsIntegrated = isIntegrated ? "نعم" : "لا";
    row.__neprasStatsStatus = statusBucket;
  }
  return out;
}


function neprasStatsFastGradePlan(stageKey = "") {
  const ordinalNames = [
    "الأول",
    "الثاني",
    "الثالث",
    "الرابع",
    "الخامس",
    "السادس"
  ];

  const plans = {
    KG: [
      { value: "1", text: "المستوى الأول" },
      { value: "2", text: "المستوى الثاني" }
    ],

    PRIMARY:
      ordinalNames.slice(0, 6).map(
        (name, index) => ({
          value: String(index + 1),
          text: `الصف ${name}`
        })
      ),

    PREP:
      ordinalNames.slice(0, 3).map(
        (name, index) => ({
          value: String(index + 1),
          text: `الصف ${name} الإعدادي`
        })
      ),

    GENERAL_SECONDARY:
      ordinalNames.slice(0, 3).map(
        (name, index) => ({
          value: String(index + 1),
          text: `الصف ${name} الثانوي`
        })
      ),

    TECHNICAL_SECONDARY:
      ordinalNames.slice(0, 5).map(
        (name, index) => ({
          value: String(index + 1),
          text: `الصف ${name} الفني`
        })
      )
  };

  if (Array.isArray(plans[stageKey])) {
    return plans[stageKey];
  }

  // fallback: القيم الحقيقية من قائمة الصف في الموقع.
  try {
    const select =
      typeof neprasFindGradeSelectByLabel === "function"
        ? neprasFindGradeSelectByLabel()?.sel
        : null;

    if (select) {
      return Array.from(select.options || [])
        .map(opt => ({
          value: String(opt.value ?? "").trim(),
          text: String(opt.text || opt.textContent || "").trim()
        }))
        .filter(item =>
          /^\d+$/.test(item.value) &&
          item.text &&
          !neprasIsPlaceholderGradeText?.(item.text)
        );
    }
  } catch (_) {}

  return [];
}


const NEPRAS_STATS_API_ATTEMPTS = 4;

// انتظار بين طلب صف والذي يليه. API الوزارة أعطى HTTP 500 عند التتابع السريع (سجل أرسله المستخدم)،
// فكان جامع الإحصاء وحده ينتظر؛ صار الانتظار في neprasStatsFetchStageRows فيشمل كل من يجلب صفوف المرحلة.
const NEPRAS_STATS_GRADE_GAP_MS = 550;

const NEPRAS_STATS_RETRY_DELAYS_MS = [
  0,
  700,
  1400,
  2600
];

function neprasStatsSleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        Math.max(0, Number(ms) || 0)
      )
  );
}

function neprasStatsStudentKey(row) {
  return (
    String(
      neprasStatsValue(
        row,
        ["كود التلميذ"]
      ) || ""
    ).trim() ||
    String(
      neprasStatsValue(
        row,
        ["الرقم القومي"]
      ) || ""
    ).trim()
  );
}

function neprasStatsSameSmallResult(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length
  ) {
    return false;
  }

  const keysA =
    a.map(neprasStatsStudentKey)
      .filter(Boolean)
      .sort();

  const keysB =
    b.map(neprasStatsStudentKey)
      .filter(Boolean)
      .sort();

  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every(
    (key, index) =>
      key === keysB[index]
  );
}

async function neprasStatsReadLastGoodSnapshot() {
  try {
    const stored =
      await chrome.storage.local.get(
        NEPRAS_SCHOOL_STATS_STORAGE_KEY
      );

    return (
      stored?.[
        NEPRAS_SCHOOL_STATS_STORAGE_KEY
      ] || null
    );
  } catch (_) {
    return null;
  }
}

function neprasStatsCachedGradeCount(
  cached,
  gradeName
) {
  const wanted =
    normalizeText(
      String(gradeName || "")
    );

  const row =
    Array.isArray(cached?.grades)
      ? cached.grades.find(g => {
          const n =
            normalizeText(
              String(g?.grade || "")
            );

          return (
            n === wanted ||
            n.includes(wanted) ||
            wanted.includes(n)
          );
        })
      : null;

  return Number(
    row?.total || 0
  );
}

async function neprasStatsFetchGradeStable(
  grade,
  state = {}
) {
  let lastReason = "";
  let sessionWasRefreshed =
    state.sessionWasRefreshed === true;

  for (
    let attempt = 0;
    attempt < NEPRAS_STATS_API_ATTEMPTS;
    attempt++
  ) {
    neprasStatsThrowIfStopped();

    if (attempt > 0) {
      const waitMs =
        NEPRAS_STATS_RETRY_DELAYS_MS[
          Math.min(
            attempt,
            NEPRAS_STATS_RETRY_DELAYS_MS.length - 1
          )
        ];

      if (
        typeof showFloatingStatus ===
        "function"
      ) {
        showFloatingStatus(
          `🔄 إعادة محاولة ${grade.text} (${attempt + 1}/${NEPRAS_STATS_API_ATTEMPTS})...`
        );
      }

      await neprasStatsSleep(
        waitMs
      );
    }

    const fast =
      await window.neprasApiTryRowsForGrade(
        grade.text,
        grade.value
      );

    if (fast?.userStopped || String(fast?.reason || "").includes("USER_STOPPED")) {
      neprasStatsThrowIfStopped();
      const error = new Error("USER_STOPPED");
      error.code = "USER_STOPPED";
      throw error;
    }

    neprasStatsThrowIfStopped();

    if (fast?.ok) {
      const rows =
        Array.isArray(fast.rows)
          ? fast.rows
          : [];

      // لو النتيجة 0..3 طلاب فقط، نثبتها بطلب ثانٍ.
      // هذا لا يضاعف الحمل على المدارس العادية الكبيرة،
      // لكنه يمنع اعتماد نتيجة "طالب واحد" عشوائية.
      if (rows.length <= 3) {
        await neprasStatsSleep(550);

        const confirm =
          await window.neprasApiTryRowsForGrade(
            grade.text,
            grade.value
          );

        if (
          confirm?.ok &&
          neprasStatsSameSmallResult(
            rows,
            Array.isArray(confirm.rows)
              ? confirm.rows
              : []
          )
        ) {
          return {
            ok: true,
            rows,
            sessionWasRefreshed
          };
        }

        lastReason =
          confirm?.reason ||
          "UNSTABLE_SMALL_RESULT";

        continue;
      }

      return {
        ok: true,
        rows,
        sessionWasRefreshed
      };
    }

    lastReason =
      String(
        fast?.reason ||
        "FAST_API_FAILED"
      );

    if (fast?.authFailure) {
      // مرة واحدة فقط: جدد سياق الطلب من الموقع نفسه ثم أعد المحاولة.
      if (
        !sessionWasRefreshed &&
        typeof window.neprasApiAutoPrimeSession ===
          "function"
      ) {
        sessionWasRefreshed = true;

        await window.neprasApiAutoPrimeSession(
          grade.text
        );

        await neprasStatsSleep(700);
        continue;
      }

      break;
    }

    const transient =
      typeof window.neprasApiIsTransientServerFailure ===
        "function"
        ? window.neprasApiIsTransientServerFailure(
            lastReason
          )
        : (
            lastReason.includes(
              "API_HTTP_500"
            ) ||
            lastReason.includes(
              "API_HTTP_502"
            ) ||
            lastReason.includes(
              "API_HTTP_503"
            ) ||
            lastReason.includes(
              "API_HTTP_504"
            ) ||
            lastReason.includes(
              "API_HTTP_429"
            )
          );

    // 500 أحيانًا يكون بسبب سياق جلسة وزارة قديم.
    // نجدد الرؤوس مرة واحدة، ثم نكمل retry/backoff.
    if (
      transient &&
      !sessionWasRefreshed &&
      typeof window.neprasApiAutoPrimeSession ===
        "function"
    ) {
      sessionWasRefreshed = true;

      await window.neprasApiAutoPrimeSession(
        grade.text
      );

      await neprasStatsSleep(800);
      continue;
    }

    if (!transient) {
      break;
    }
  }

  return {
    ok: false,
    rows: [],
    sessionWasRefreshed,
    reason:
      lastReason ||
      "STATS_GRADE_FETCH_FAILED"
  };
}

// مصدر واحد لجلب كل طلاب المدرسة صفًّا صفًّا: خطة صفوف المرحلة (أو قائمة الصف الظاهرة في الصفحة إن لم تُحدَّد مرحلة)
// + الجلب الثابت (إعادة محاولة وتجديد جلسة). يعيد [{ grade: {value,text}, rows }] بترتيب الخطة.
// يستعمله: جامع إحصاء المدرسة، و«قوائم الفصول»، و«السجلات والكشوف».
// - أي صف يفشل يرمي خطأ باسم الصف: لا نعيد نتيجة ناقصة بصمت (كشف بلا صف كامل أسوأ من كشف لم يُنشأ).
// - الإيقاف يرمي USER_STOPPED (code) كما في بقية الدوال.
// - خطة فارغة ترمي GRADE_PLAN_EMPTY ليقرّر المستدعي (مثلًا قراءة جدول الصفحة).
// - ننتظر gapMs بين الصفوف (لا بعد الأخير) كي لا نُرسل طلبات متتابعة بلا فاصل؛ gapMs: 0 يعطّله.
// onGrade(grade, index, total): لعرض التقدم فقط.
// report: كائن اختياري يُملأ بـ sessionWasRefreshed (هل جُدّدت الجلسة أثناء الجلب) لمن يسجّلها.
async function neprasStatsFetchStageRows(stageKey = "", { onGrade, gapMs = NEPRAS_STATS_GRADE_GAP_MS, report } = {}) {
  if (typeof window.neprasApiTryRowsForGrade !== "function") {
    throw new Error("FAST_API_NOT_AVAILABLE");
  }

  const grades = neprasStatsFastGradePlan(stageKey);
  if (!grades.length) {
    throw new Error("GRADE_PLAN_EMPTY");
  }

  const out = [];
  let sessionWasRefreshed = false;

  for (let i = 0; i < grades.length; i++) {
    neprasStatsThrowIfStopped();

    const grade = grades[i];
    if (typeof onGrade === "function") onGrade(grade, i, grades.length);

    const fetched = await neprasStatsFetchGradeStable(grade, { sessionWasRefreshed });
    neprasStatsThrowIfStopped();

    sessionWasRefreshed = fetched.sessionWasRefreshed === true;

    if (!fetched.ok) {
      throw new Error(`تعذر تنزيل بيانات ${grade.text} بصورة موثوقة: ${fetched.reason || "API_FAILED"}`);
    }

    out.push({ grade, rows: Array.isArray(fetched.rows) ? fetched.rows : [] });

    if (gapMs > 0 && i < grades.length - 1) await neprasStatsSleep(gapMs);
  }

  if (report && typeof report === "object") report.sessionWasRefreshed = sessionWasRefreshed;
  return out;
}

function neprasValidateSchoolStatsSnapshot(
  result,
  previous = null
) {
  const errors = [];

  const total =
    Number(result?.total || 0);

  const boys =
    Number(result?.boys || 0);

  const girls =
    Number(result?.girls || 0);

  const unknownGender =
    Number(
      result?.unknownGender || 0
    );

  const detailCount =
    Array.isArray(result?.detailRows)
      ? result.detailRows.length
      : 0;

  if (total <= 0) {
    errors.push(
      "الإجمالي صفر"
    );
  }

  if (
    boys +
      girls +
      unknownGender !==
    total
  ) {
    errors.push(
      "مجموع النوع لا يساوي الإجمالي"
    );
  }

  if (detailCount !== total) {
    errors.push(
      "عدد تفاصيل الطلاب لا يساوي الإجمالي"
    );
  }

  const integrated =
    Number(
      result?.integrated || 0
    );

  if (
    integrated < 0 ||
    integrated > total
  ) {
    errors.push(
      "عدد طلاب الدمج غير منطقي"
    );
  }

  const seen = new Set();
  let duplicates = 0;

  for (const row of result?.rows || []) {
    const key =
      neprasStatsStudentKey(row);

    if (!key) continue;

    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
    }
  }

  if (duplicates > 0) {
    errors.push(
      `تكرار ${duplicates} طالب بين الصفوف`
    );
  }

  const sameSchool =
    previous?.schoolKey &&
    result?.schoolKey &&
    String(previous.schoolKey) ===
      String(result.schoolKey) &&
    String(previous.stage || "") ===
      String(result.stage || "");

  if (sameSchool) {
    const oldTotal =
      Number(previous.total || 0);

    // لا نقبل انهيارًا مفاجئًا لأقل من 40% من آخر لقطة سليمة
    // لنفس المدرسة/المرحلة. نحتفظ باللقطة السابقة بدل عرض رقم خاطئ.
    if (
      oldTotal >= 20 &&
      total <
        Math.max(
          4,
          Math.floor(
            oldTotal * 0.40
          )
        )
    ) {
      errors.push(
        `انخفاض غير منطقي من ${oldTotal} إلى ${total}`
      );
    }

    for (const grade of result?.grades || []) {
      const oldCount =
        neprasStatsCachedGradeCount(
          previous,
          grade?.grade
        );

      const newCount =
        Number(grade?.total || 0);

      if (
        oldCount >= 10 &&
        newCount <
          Math.max(
            2,
            Math.floor(
              oldCount * 0.25
            )
          )
      ) {
        errors.push(
          `انخفاض غير منطقي في ${grade?.grade || "صف"} من ${oldCount} إلى ${newCount}`
        );
      }
    }
  }

  return {
    ok:
      errors.length === 0,
    errors
  };
}

async function neprasCollectSchoolStatisticsViaFastApi(stageKey = "") {
  if (
    typeof window.neprasApiTryRowsForGrade !==
    "function"
  ) {
    throw new Error(
      "FAST_API_NOT_AVAILABLE"
    );
  }

  const previous =
    await neprasStatsReadLastGoodSnapshot();

  let apiContext = {};

  try {
    if (
      typeof window.neprasApiGetContext ===
      "function"
    ) {
      apiContext =
        await window.neprasApiGetContext();
    }
  } catch (_) {}

  // الجلب نفسه (خطة الصفوف، الجلب الثابت، الانتظار بين الصفوف، الإيقاف) من الدالة المشتركة.
  const report = {};
  let fetchedGrades;

  try {
    fetchedGrades =
      await neprasStatsFetchStageRows(
        stageKey,
        {
          report,
          onGrade: (grade, i, count) => {
            if (
              typeof showFloatingStatus ===
              "function"
            ) {
              showFloatingStatus(
                `⚡ إحصاء المدرسة: ${grade.text} (${i + 1}/${count})...`
              );
            }
          }
        }
      );
  } catch (error) {
    if (error?.message === "GRADE_PLAN_EMPTY") {
      throw new Error(
        "لم يتم التعرف على صفوف المرحلة التعليمية المختارة."
      );
    }

    throw error;
  }

  const sessionWasRefreshed =
    report.sessionWasRefreshed === true;

  const gradeSummaries = [];
  const allRows = [];

  for (const { grade, rows } of fetchedGrades) {
    // نجاح API مع صف بلا طلاب مسموح.
    if (!rows.length) {
      gradeSummaries.push({
        grade: grade.text,
        total: 0,
        boys: 0,
        girls: 0,
        unknownGender: 0,
        classes: new Set(),
        homes: 0,
        integrated: 0,
        statuses: {},
        breakdown: {},
        rows: []
      });

      continue;
    }

    const apiGradeName =
      neprasStatsValue(
        rows[0],
        ["الصف"]
      ) ||
      grade.text;

    const summary =
      neprasStatsGradeSummary(
        apiGradeName,
        rows,
        rows,
        null,
        []
      );

    gradeSummaries.push(
      summary
    );

    allRows.push(
      ...summary.rows.map(
        row => ({
          ...row,
          __neprasGrade:
            apiGradeName
        })
      )
    );
  }

  const total =
    gradeSummaries.reduce(
      (sum, grade) =>
        sum +
        Number(grade.total || 0),
      0
    );

  const boys =
    gradeSummaries.reduce(
      (sum, grade) =>
        sum +
        Number(grade.boys || 0),
      0
    );

  const girls =
    gradeSummaries.reduce(
      (sum, grade) =>
        sum +
        Number(grade.girls || 0),
      0
    );

  const unknownGender =
    gradeSummaries.reduce(
      (sum, grade) =>
        sum +
        Number(
          grade.unknownGender || 0
        ),
      0
    );

  const integrated =
    gradeSummaries.reduce(
      (sum, grade) =>
        sum +
        Number(
          grade.integrated || 0
        ),
      0
    );

  const homes =
    gradeSummaries.reduce(
      (sum, grade) =>
        sum +
        Number(grade.homes || 0),
      0
    );

  const classes =
    gradeSummaries.reduce(
      (sum, grade) =>
        sum +
        Number(
          grade.classes?.size || 0
        ),
      0
    );

  const statuses = {};

  gradeSummaries.forEach(
    grade => {
      Object.entries(
        grade.statuses || {}
      ).forEach(
        ([name, value]) => {
          neprasStatsInc(
            statuses,
            name,
            value
          );
        }
      );
    }
  );

  const result = {
    version: 161,
    source:
      "GetSchoolStudent API v1.0 — validated snapshot",
    schoolName:
      neprasStatsDetectSchoolName(),
    schoolKey:
      String(
        apiContext?.schoolKey || ""
      ),
    stage: stageKey,
    generatedAt:
      new Date().toISOString(),

    total,
    boys,
    girls,
    unknownGender,
    classes,
    homes,
    integrated,
    statuses,

    grades:
      gradeSummaries.map(
        grade => ({
          grade: grade.grade,
          total:
            Number(
              grade.total || 0
            ),
          boys:
            Number(
              grade.boys || 0
            ),
          girls:
            Number(
              grade.girls || 0
            ),
          unknownGender:
            Number(
              grade.unknownGender || 0
            ),
          classes:
            Number(
              grade.classes?.size || 0
            ),
          homes:
            Number(
              grade.homes || 0
            ),
          integrated:
            Number(
              grade.integrated || 0
            ),
          statuses:
            grade.statuses || {},
          breakdown:
            grade.breakdown || {}
        })
      ),

    rows: allRows,

    detailRows:
      allRows.map(
        row =>
          neprasStatsGetStudentDisplayRow(
            row
          )
      ),

    integrity: {
      complete:
        true,
      gradeRequests:
        fetchedGrades.length,
      sessionWasRefreshed,
      committedAtomically:
        true
    }
  };

  const validation =
    neprasValidateSchoolStatsSnapshot(
      result,
      previous
    );

  if (!validation.ok) {
    throw new Error(
      `تم رفض نتيجة غير مستقرة: ${validation.errors.join(" | ")}`
    );
  }

  // ATOMIC COMMIT:
  // لا نكتب أي رقم في التخزين إلا بعد نجاح كل الصفوف + التحقق النهائي.
  neprasStatsThrowIfStopped();

  const rawCode = String(
    apiContext?.schoolcode ||
    apiContext?.schoolCode ||
    apiContext?.schoolKey ||
    result.schoolKey ||
    ""
  ).trim();
  const cleanSchoolCode = rawCode.replace(/\D/g, "");
  const detectedSchoolName = String(
    result.schoolName ||
    apiContext?.schoolName ||
    neprasStatsDetectSchoolName() ||
    ""
  ).trim();
  const currentSchoolKey = cleanSchoolCode || detectedSchoolName || "المدرسة الحالية";
  result.schoolKey = currentSchoolKey;
  if (detectedSchoolName && detectedSchoolName !== "المدرسة الحالية") {
    result.schoolName = detectedSchoolName;
  }
  const prevSchoolKey = String(previous?.schoolKey || previous?.schoolName || "").trim();
  const isSameSchool = !prevSchoolKey || !currentSchoolKey || prevSchoolKey === currentSchoolKey;

  let mergedCachedStudents =
    (result.detailRows && result.detailRows.length) ? result.detailRows : (result.rows || []);

  try {
    // ندمج فقط إذا كانت البيانات تخص نفس المدرسة؛ عند الانتقال لمدرسة/مرحلة أخرى لا نخلط الطلاب القدامى
    if (isSameSchool) {
      const prevStore = await chrome.storage.local.get("neprasCachedStudentsList");
      const prevList = Array.isArray(prevStore?.neprasCachedStudentsList) ? prevStore.neprasCachedStudentsList : [];
      if (prevList.length) {
        const prevByKey = new Map();
        for (const p of prevList) {
          if (!p || typeof p !== "object") continue;
          const kCode = String(p.code || p.studentCode || p["كود التلميذ"] || p["كود الطالب"] || "").trim();
          const kNid = String(p.nationalId || p["الرقم القومي"] || "").trim();
          if (kCode) prevByKey.set(`c:${kCode}`, p);
          if (kNid) prevByKey.set(`n:${kNid}`, p);
        }
        mergedCachedStudents = mergedCachedStudents.map(cur => {
          const kCode = String(cur.code || cur["كود التلميذ"] || "").trim();
          const kNid = String(cur.nationalId || cur["الرقم القومي"] || "").trim();
          const prev = (kCode && prevByKey.get(`c:${kCode}`)) || (kNid && prevByKey.get(`n:${kNid}`)) || null;
          if (!prev) return cur;
          const mother = cur.motherName || cur["اسم الأم"] || prev.motherFullName || prev.motherName || prev["اسم الأم"] || prev["اسم الام"] || "";
          const mobile = cur.mobile || cur["رقم المحمول"] || prev.mobile || prev.phone || prev["رقم المحمول"] || prev["المحمول"] || "";
          const address = cur.address || cur["العنوان"] || prev.address || prev["العنوان"] || "";
          const lang1 = cur.lang1 || cur["اللغة الأجنبية الأولى"] || prev.lang1 || prev["اللغة الأجنبية الأولى"] || "";
          const lang2 = cur.lang2 || cur["اللغة الأجنبية الثانية"] || prev.lang2 || prev["اللغة الأجنبية الثانية"] || "";
          const section = cur.section || cur["الشعبة"] || prev.section || prev["الشعبة"] || "";
          const specialization = cur.specialization || cur["التخصص"] || prev.specialization || prev["التخصص"] || "";
          const religion = cur.religion || cur["الديانة"] || prev.religion || prev["الديانة"] || "";
          const father = cur.fatherFullName || cur.fatherName || cur["اسم الأب"] || cur["اسم الوالد"] || prev.fatherFullName || prev.fatherName || prev["اسم الأب"] || prev["اسم الوالد"] || "";
          const birthGov = cur.birthGov || cur["محافظة الميلاد"] || prev.birthGov || prev["محافظة الميلاد"] || "";
          const dob = cur.dob || cur["تاريخ الميلاد"] || prev.dob || prev["تاريخ الميلاد"] || "";
          return {
            ...prev,
            ...cur,
            ...(mother ? { motherName: mother, "اسم الأم": mother } : {}),
            ...(mobile ? { mobile, "رقم المحمول": mobile } : {}),
            ...(address ? { address, "العنوان": address } : {}),
            ...(lang1 ? { lang1, "اللغة الأجنبية الأولى": lang1 } : {}),
            ...(lang2 ? { lang2, "اللغة الأجنبية الثانية": lang2 } : {}),
            ...(section ? { section, "الشعبة": section } : {}),
            ...(specialization ? { specialization, "التخصص": specialization } : {}),
            ...(religion ? { religion, "الديانة": religion } : {}),
            ...(father ? { fatherFullName: father, "اسم الوالد": father } : {}),
            ...(birthGov ? { birthGov, "محافظة الميلاد": birthGov } : {}),
            ...(dob ? { dob, "تاريخ الميلاد": dob } : {})
          };
        });
      }
    }
  } catch (_) {}

  try {
    window.neprasCachedStudentsList = mergedCachedStudents;
  } catch (_) {}

  // تسجيل المدرسة/المرحلة في الفهرس المستقل وحفظ بياناتها معزولة تلقائياً
  try {
    if (globalThis.NeprasSchoolManager && cleanSchoolCode) {
      if (globalThis.NeprasSchoolManager.registerOrUpdateSchool) {
        await globalThis.NeprasSchoolManager.registerOrUpdateSchool({
          code: cleanSchoolCode,
          name: detectedSchoolName,
          stage: stageKey || result.stage || "",
          directorate: result.directorate || "",
          administration: result.administration || ""
        });
      }
      if (globalThis.NeprasSchoolManager.saveSchoolStats) {
        await globalThis.NeprasSchoolManager.saveSchoolStats(cleanSchoolCode, result, mergedCachedStudents);
      }
    } else if (globalThis.NeprasSchoolManager?.saveSchoolStats) {
      await globalThis.NeprasSchoolManager.saveSchoolStats(currentSchoolKey, result, mergedCachedStudents);
    }
    if (typeof window.refreshSchoolProfilesUI === "function") {
      await window.refreshSchoolProfilesUI(cleanSchoolCode || currentSchoolKey);
    }
  } catch (_) {}

  await chrome.storage.local.set({
    [NEPRAS_SCHOOL_STATS_STORAGE_KEY]:
      result,
    neprasCachedStudentsList:
      mergedCachedStudents,
    neprasSchoolStatsLastError:
      null
  });

  return result;
}

async function neprasCollectSchoolStatistics(stageKey = "") {
  try { window.neprasResetGlobalStop?.(); } catch (_) { try { window.__NEPRAS_STOP_ALL_REQUESTED__ = false; } catch (_) {} }

  if (
    neprasSchoolStatsRunning ||
    window.__NEPRAS_SCHOOL_STATS_RUNNING_V161__
  ) {
    throw new Error(
      "إحصاء المدرسة يعمل بالفعل. انتظر انتهاء العملية الحالية."
    );
  }

  neprasSchoolStatsRunning = true;
  window.__NEPRAS_SCHOOL_STATS_RUNNING_V161__ =
    true;

  try {
    if (
      stageKey &&
      typeof window.neprasSetSelectedStage ===
        "function"
    ) {
      window.neprasSetSelectedStage(
        stageKey,
        true
      );
    }

    if (
      typeof window.neprasApiTryRowsForGrade !==
      "function"
    ) {
      throw new Error(
        "محرك API السريع غير جاهز. أعد تحميل صفحة بيانات التلميذ."
      );
    }

    try {
      const fastResult =
        await neprasCollectSchoolStatisticsViaFastApi(
          stageKey
        );

      if (
        typeof showFloatingStatus ===
        "function"
      ) {
        showFloatingStatus(
          `✅ تم تحديث إحصاء المدرسة بصورة موثوقة — ${fastResult.total} طالب`,
          true
        );

        hideFloatingStatus?.(
          3000
        );
      }

      return fastResult;
    } catch (fastError) {
      if (neprasStatsStopRequested() || fastError?.code === "USER_STOPPED" || String(fastError?.message || "").includes("USER_STOPPED")) {
        const stopped = new Error("USER_STOPPED");
        stopped.code = "USER_STOPPED";
        throw stopped;
      }

      const fastMessage =
        String(
          fastError?.message ||
          fastError ||
          ""
        );

      console.error(
        "Nepras School Stats rejected:",
        fastError
      );

      const previous =
        await neprasStatsReadLastGoodSnapshot();

      if (
        typeof showFloatingStatus ===
        "function"
      ) {
        showFloatingStatus(
          previous?.total
            ? `⚠️ تعذر الحصول على لقطة كاملة من API الوزارة. لم يتم تغيير الإحصاء، وتم الاحتفاظ بآخر نتيجة صحيحة (${previous.total} طالب).`
            : `❌ تعذر الحصول على إحصاء كامل وموثوق. لم يتم حفظ أي نتيجة جزئية.`,
          false
        );

        hideFloatingStatus?.(
          5500
        );
      }

      throw new Error(
        `لم يتم اعتماد الإحصاء لأن بيانات API لم تكتمل: ${fastMessage}`
      );
    }
  } finally {
    neprasSchoolStatsRunning = false;
    window.__NEPRAS_SCHOOL_STATS_RUNNING_V161__ =
      false;
  }
}

function neprasStatsBreakdownCount(breakdown, section, statusName, mode, gender) {
  if (!breakdown) return 0;

  if (section === "status") {
    return Number(
      breakdown.statuses?.[statusName]?.[mode]?.[gender] || 0
    );
  }

  return Number(
    breakdown?.[section]?.[mode]?.[gender] || 0
  );
}

function neprasExportSchoolStatisticsExcel(stats) {
  if (!stats?.grades?.length) {
    throw new Error(
      "لا توجد بيانات إحصاء محفوظة للتصدير."
    );
  }

  if (
    typeof window.neprasStudentBuildMultiSheetXlsx !==
      "function" ||
    typeof downloadWorkbook !==
      "function"
  ) {
    throw new Error(
      "محرك Excel متعدد الصفحات غير جاهز."
    );
  }

  const statusNames =
    neprasStatsOrderedStatusNames(
      stats.statuses || {}
    );

  const detailPairs = [
    ["منتظم", "بنين"],
    ["منتظم", "بنات"],
    ["منازل", "بنين"],
    ["منازل", "بنات"]
  ];

  const summaryHeaders = [
    "الصف",
    "إجمالي الطلاب",
    "بنين",
    "بنات",
    "عدد الفصول",
    "طلاب المنازل",
    "طلاب الدمج",
    "منتظم - بنين",
    "منتظم - بنات",
    "منازل - بنين",
    "منازل - بنات",
    "دمج منتظم - بنين",
    "دمج منتظم - بنات",
    "دمج منازل - بنين",
    "دمج منازل - بنات",
    ...statusNames.flatMap(
      status =>
        detailPairs.map(
          ([mode, gender]) =>
            `${status} - ${mode} - ${gender}`
        )
    )
  ];

  const summaryRows =
    stats.grades.map(
      g => [
        g.grade,
        g.total,
        g.boys,
        g.girls,
        g.classes,
        g.homes || 0,
        g.integrated || 0,

        neprasStatsBreakdownCount(
          g.breakdown,
          "enrollment",
          "",
          "منتظم",
          "بنين"
        ),
        neprasStatsBreakdownCount(
          g.breakdown,
          "enrollment",
          "",
          "منتظم",
          "بنات"
        ),
        neprasStatsBreakdownCount(
          g.breakdown,
          "enrollment",
          "",
          "منازل",
          "بنين"
        ),
        neprasStatsBreakdownCount(
          g.breakdown,
          "enrollment",
          "",
          "منازل",
          "بنات"
        ),

        neprasStatsBreakdownCount(
          g.breakdown,
          "integration",
          "",
          "منتظم",
          "بنين"
        ),
        neprasStatsBreakdownCount(
          g.breakdown,
          "integration",
          "",
          "منتظم",
          "بنات"
        ),
        neprasStatsBreakdownCount(
          g.breakdown,
          "integration",
          "",
          "منازل",
          "بنين"
        ),
        neprasStatsBreakdownCount(
          g.breakdown,
          "integration",
          "",
          "منازل",
          "بنات"
        ),

        ...statusNames.flatMap(
          status =>
            detailPairs.map(
              ([mode, gender]) =>
                neprasStatsBreakdownCount(
                  g.breakdown,
                  "status",
                  status,
                  mode,
                  gender
                )
            )
        )
      ]
    );

  const totalRow =
    ["الإجمالي"];

  for (
    let c = 1;
    c < summaryHeaders.length;
    c++
  ) {
    totalRow.push(
      summaryRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row[c] || 0
          ),
        0
      )
    );
  }

  summaryRows.push(
    totalRow
  );

  const detailHeaders = [
    "م",
    "اسم التلميذ",
    "كود التلميذ",
    "الرقم القومي",
    "الصف",
    "الفصل",
    "النوع",
    "نوع التعليم",
    "الدمج",
    "نوع الدمج",
    "حالة القيد"
  ];

  const canonicalDetails =
    (
      Array.isArray(stats.detailRows) &&
      stats.detailRows.length
        ? stats.detailRows
        : (
            Array.isArray(stats.rows)
              ? stats.rows.map(
                  neprasStatsGetStudentDisplayRow
                )
              : []
          )
    )
      .map(row => {
        // توافق مع لقطة v1.0 المعيارية بشكل خاطئ.
        if (
          Object.prototype.hasOwnProperty.call(
            row || {},
            "name"
          )
        ) {
          return {
            grade:
              String(row.grade || ""),
            code:
              String(row.code || ""),
            name:
              String(row.name || ""),
            nationalId:
              String(
                row.nationalId || ""
              ),
            gender:
              String(
                row.gender || ""
              ),
            mode:
              String(row.mode || ""),
            className:
              String(
                row.className || ""
              ),
            integrated:
              String(
                row.integrated || "لا"
              ),
            integrationType:
              String(
                row.integrationType ||
                "—"
              ),
            status:
              String(row.status || "")
          };
        }

        return {
          grade:
            String(
              row?.["الصف"] || ""
            ),
          code:
            String(
              row?.["كود التلميذ"] || ""
            ),
          name:
            String(
              row?.["اسم التلميذ"] || ""
            ),
          nationalId:
            String(
              row?.["الرقم القومي"] || ""
            ),
          gender:
            String(
              row?.["النوع"] || ""
            ),
          mode:
            String(
              row?.["نوعية التعليم"] ||
              row?.["نوع التعليم"] ||
              ""
            ),
          className:
            String(
              row?.["الفصل"] || ""
            ),
          integrated:
            String(
              row?.["الدمج"] || "لا"
            ),
          integrationType:
            String(
              row?.["نوع الدمج"] ||
              "—"
            ),
          status:
            String(
              row?.["حالة القيد"] || ""
            )
        };
      });

  function detailRowsFor(rows) {
    return rows.map(
      (row, index) => [
        index + 1,
        row.name,
        row.code,
        row.nationalId,
        row.grade,
        row.className,
        row.gender,
        row.mode,
        row.integrated,
        row.integrationType || "—",
        row.status
      ]
    );
  }

  const sheetSpecs = [
    {
      name:
        "ملخص الإحصاء",
      headers:
        summaryHeaders,
      rows:
        summaryRows,
      title:
        `إحصاء المدرسة التفصيلي - ${stats.schoolName || ""}`
    },
    {
      name:
        "كل الطلاب",
      headers:
        detailHeaders,
      rows:
        detailRowsFor(
          canonicalDetails
        ),
      title:
        `كل الطلاب - ${stats.schoolName || ""}`
    },
    {
      name:
        "طلاب الدمج",
      headers:
        detailHeaders,
      rows:
        detailRowsFor(
          canonicalDetails.filter(
            row =>
              row.integrated ===
              "نعم"
          )
        ),
      title:
        `طلاب الدمج - ${stats.schoolName || ""}`
    },
    {
      name:
        "طلاب المنازل",
      headers:
        detailHeaders,
      rows:
        detailRowsFor(
          canonicalDetails.filter(
            row =>
              row.mode ===
              "منازل"
          )
        ),
      title:
        `طلاب المنازل - ${stats.schoolName || ""}`
    }
  ];

  // كل حالة قيد في Tab مستقل.
  for (const status of statusNames) {
    const statusRows =
      canonicalDetails.filter(
        row =>
          String(
            row.status || ""
          ).trim() ===
          String(status).trim()
      );

    sheetSpecs.push({
      name:
        status,
      headers:
        detailHeaders,
      rows:
        detailRowsFor(
          statusRows
        ),
      title:
        `${status} - ${stats.schoolName || ""}`
    });
  }

  const wb = {
    __neprasStudentXlsxBytes:
      window.neprasStudentBuildMultiSheetXlsx(
        sheetSpecs
      )
  };

  downloadWorkbook(
    wb,
    `إحصاء_المدرسة_${stats.schoolName || "المدرسة"}_تفصيلي`,
    "إحصاء المدرسة"
  );
}

// ============================================================
// v1.0 — تفاصيل الإحصاء بدون أي سحب جديد
// البيانات تأتي من rows المحفوظة أثناء الإحصاء نفسه.
// ============================================================

function neprasStatsRowMatchesFilter(row, filter = {}) {
  if (!row) return false;

  if (
    filter.grade &&
    String(row.__neprasGrade || "").trim() !== String(filter.grade).trim()
  ) {
    return false;
  }

  if (
    filter.gender &&
    String(row.__neprasStatsGender || "").trim() !== String(filter.gender).trim()
  ) {
    return false;
  }

  if (
    filter.mode &&
    String(row.__neprasStatsMode || "").trim() !== String(filter.mode).trim()
  ) {
    return false;
  }

  if (
    filter.integrated === true &&
    String(row.__neprasStatsIntegrated || "") !== "نعم"
  ) {
    return false;
  }

  if (
    filter.integrated === false &&
    String(row.__neprasStatsIntegrated || "") === "نعم"
  ) {
    return false;
  }

  if (
    filter.status &&
    String(row.__neprasStatsStatus || "").trim() !== String(filter.status).trim()
  ) {
    return false;
  }

  return true;
}

function neprasStatsGetDetailRows(stats, filter = {}) {
  // detailRows هي النسخة المعيارية الجديدة المحفوظة خصيصًا للعرض.
  if (Array.isArray(stats?.detailRows) && stats.detailRows.length) {
    return stats.detailRows.filter(row => {
      if (
        filter.grade &&
        String(row.grade || "").trim() !== String(filter.grade).trim()
      ) return false;

      if (
        filter.gender &&
        String(row.gender || "").trim() !== String(filter.gender).trim()
      ) return false;

      if (
        filter.mode &&
        String(row.mode || "").trim() !== String(filter.mode).trim()
      ) return false;

      if (
        filter.integrated === true &&
        String(row.integrated || "") !== "نعم"
      ) return false;

      if (
        filter.integrated === false &&
        String(row.integrated || "") === "نعم"
      ) return false;

      if (
        filter.status &&
        String(row.status || "").trim() !== String(filter.status).trim()
      ) return false;

      return true;
    });
  }

  // توافق مع أي إحصاء قديم محفوظ قبل v1.0.
  return (Array.isArray(stats?.rows) ? stats.rows : [])
    .filter(row => neprasStatsRowMatchesFilter(row, filter));
}

function neprasStatsGetStudentDisplayRow(row) {
  const raw =
    row?.__neprasApiRaw || {};

  const code =
    neprasStatsValue(
      row,
      [
        "كود التلميذ",
        "كود الطالب",
        "كود",
        "studentCode",
        "code"
      ]
    ) || "";

  const name =
    neprasStatsValue(
      row,
      [
        "اسم التلميذ",
        "اسم الطالب",
        "الاسم",
        "fullName",
        "name"
      ]
    ) || "";

  const nationalId =
    neprasStatsEnglishDigits(
      neprasStatsValue(
        row,
        [
          "الرقم القومي",
          "رقم قومي",
          "nationalId",
          "nid"
        ]
      ) || ""
    );

  const className =
    neprasStatsValue(
      row,
      [
        "الفصل",
        "الصف الفصل",
        "اسم الفصل",
        "classRoom",
        "className"
      ]
    ) || "";

  const integrated =
    neprasStatsIntegrationFromRow(row)
      ? "نعم"
      : "لا";

  let integrationType =
    String(
      raw.obstacleName ||
      neprasStatsValue(
        row,
        [
          "نوع الدمج",
          "الموقف من الدمج",
          "حالة الدمج",
          "حاله الدمج",
          "damg",
          "integrationType"
        ]
      ) ||
      ""
    ).trim();

  const normalizedIntegrationType =
    neprasStatsNorm(
      integrationType
    );

  if (
    integrated !== "نعم" ||
    !integrationType ||
    normalizedIntegrationType ===
      neprasStatsNorm("لا يوجد") ||
    normalizedIntegrationType ===
      neprasStatsNorm("لايوجد")
  ) {
    integrationType = "—";
  }

  const resolvedGrade = row.__neprasGrade || neprasStatsValue(row, ["الصف", "grade"]) || raw.className || "";
  const resolvedGender = row.__neprasStatsGender || neprasStatsGender(row);
  const resolvedMode = neprasStatsValue(row, ["نوعية التعليم", "نوع التعليم", "نظام التعليم", "eduSystem", "studyType", "mode"]) || row.__neprasStatsMode || raw.studyTypeName || "";
  const resolvedStatus = neprasStatsValue(row, ["حالة القيد", "حاله القيد", "enrollStatus", "status"]) || row.__neprasStatsStatus || raw.status || "";
  const resolvedReligion =
    neprasStatsValue(row, ["الديانة", "الديانه", "religion", "rel"]) ||
    (raw.religionName) ||
    (Number(raw.religionId) === 1 ? "مسلم" : Number(raw.religionId) === 2 ? "مسيحي" : "") ||
    (globalThis.NeprasEgypt?.resolveReligion ? globalThis.NeprasEgypt.resolveReligion(row) : "");
  const resolvedDamgText = integrated === "نعم" ? (integrationType && integrationType !== "—" ? integrationType : "دمج تربوي") : "لا يوجد";
  const resolvedSection = neprasStatsValue(row, ["الشعبة", "الشعبه", "section"]) || String(raw.generalName || "").trim();
  const resolvedSpecialization = neprasStatsValue(row, ["التخصص", "specialization"]) || String(raw.specialName || "").trim();

  return {
    ...(row && typeof row === "object" ? row : {}),
    grade: resolvedGrade,
    code,
    studentCode: code,
    name,
    fullName: name,
    nationalId,
    gender: resolvedGender,
    mode: resolvedMode,
    eduSystem: resolvedMode,
    className,
    classRoom: className,
    integrated,
    integrationType,
    damg: resolvedDamgText,
    status: resolvedStatus,
    enrollStatus: resolvedStatus,
    religion: resolvedReligion,
    ...(resolvedSection ? { section: resolvedSection, "الشعبة": resolvedSection } : {}),
    ...(resolvedSpecialization ? { specialization: resolvedSpecialization, "التخصص": resolvedSpecialization } : {}),
    "الصف": resolvedGrade,
    "كود التلميذ": code,
    "اسم التلميذ": name,
    "الاسم بالكامل": name,
    "الرقم القومي": nationalId,
    "النوع": resolvedGender,
    "نوع التعليم": resolvedMode,
    "نوعية التعليم": resolvedMode,
    "الفصل": className,
    "الدمج": integrated,
    "الموقف من الدمج": resolvedDamgText,
    "نوع الدمج": integrationType,
    "حالة القيد": resolvedStatus,
    "الديانة": resolvedReligion
  };
}

function neprasStatsBuildDetailTitle(filter = {}) {
  const parts = [];

  if (filter.grade) parts.push(filter.grade);
  else parts.push("كل الصفوف");

  if (filter.status) parts.push(filter.status);
  if (filter.integrated === true) parts.push("طلاب الدمج");
  if (filter.mode) parts.push(filter.mode);
  if (filter.gender) parts.push(filter.gender);

  if (
    !filter.status &&
    filter.integrated !== true &&
    !filter.mode &&
    !filter.gender
  ) {
    parts.push("إجمالي الطلاب");
  }

  return parts.join(" — ");
}

function neprasStatsGetDetailPayload(stats, filter = {}) {
  const rawRows = neprasStatsGetDetailRows(stats, filter);

  const rows =
    Array.isArray(stats?.detailRows) && stats.detailRows.length
      ? rawRows.map(row => ({ ...row }))
      : rawRows.map(neprasStatsGetStudentDisplayRow);

  return {
    title: neprasStatsBuildDetailTitle(filter),
    count: rows.length,
    filter,
    rows
  };
}

function neprasExportSchoolStatisticsDetailExcel(stats, filter = {}) {
  if (!stats?.rows?.length && !stats?.detailRows?.length) {
    throw new Error("لا توجد بيانات طلاب محفوظة داخل الإحصاء.");
  }

  if (
    typeof neprasStudentBuildXlsx !== "function" ||
    typeof downloadWorkbook !== "function"
  ) {
    throw new Error("محرك Excel غير جاهز.");
  }

  const rawRows = neprasStatsGetDetailRows(stats, filter);

  if (!rawRows.length) {
    throw new Error("لا يوجد طلاب مطابقون للتفاصيل المحددة.");
  }

  // مطابقة تامة مع أعمدة وتريتب الجدول المعروض في نافذة تفاصيل الإحصاء
  const headers = [
    "م",
    "اسم التلميذ",
    "كود التلميذ",
    "الرقم القومي",
    "الصف",
    "الفصل",
    "النوع",
    "نوع التعليم",
    "الدمج",
    "نوع الدمج",
    "حالة القيد"
  ];

  const dataRows = rawRows.map((row, idx) => {
    const display =
      Object.prototype.hasOwnProperty.call(row || {}, "name")
        ? row
        : neprasStatsGetStudentDisplayRow(row);

    return [
      idx + 1,
      display.name || "",
      display.code || "",
      display.nationalId || "",
      display.grade || "",
      display.className || "",
      display.gender || "",
      display.mode || "",
      display.integrated || "",
      display.integrationType || "—",
      display.status || ""
    ];
  });

  const detailTitle =
    `تفاصيل إحصاء المدرسة - ${neprasStatsBuildDetailTitle(filter)}`;

  const wb = {
    __neprasStudentXlsxBytes:
      neprasStudentBuildXlsx(
        headers,
        dataRows,
        detailTitle
      )
  };

  const safeName =
    neprasStatsBuildDetailTitle(filter)
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_");

  downloadWorkbook(
    wb,
    `إحصاء_${stats.schoolName || "المدرسة"}_${safeName}`,
    "إحصاء المدرسة"
  );
}


function neprasStatsAggregateFromRows(rowsInput, stageKey = "") {
  const list = Array.isArray(rowsInput) ? rowsInput : [];
  if (!list.length) return null;

  const byGrade = new Map();
  for (const r of list) {
    const gName = neprasStatsValue(r, ["الصف"]) || String(r?.grade || r?.__neprasGrade || "غير محدد").trim() || "غير محدد";
    if (!byGrade.has(gName)) byGrade.set(gName, []);
    byGrade.get(gName).push(r);
  }

  const gradeSummaries = [];
  const allRows = [];
  for (const [gName, gRows] of byGrade.entries()) {
    const summary = neprasStatsGradeSummary(gName, gRows, gRows, null, []);
    gradeSummaries.push(summary);
    allRows.push(...summary.rows.map(row => ({ ...row, __neprasGrade: gName })));
  }

  const statuses = {};
  gradeSummaries.forEach(grade => {
    Object.entries(grade.statuses || {}).forEach(([name, value]) => {
      neprasStatsInc(statuses, name, value);
    });
  });

  return {
    version: 161,
    source: "Aggregated rows",
    schoolName: typeof neprasStatsDetectSchoolName === "function" ? neprasStatsDetectSchoolName() : "",
    stage: stageKey,
    generatedAt: new Date().toISOString(),
    total: gradeSummaries.reduce((sum, g) => sum + Number(g.total || 0), 0),
    boys: gradeSummaries.reduce((sum, g) => sum + Number(g.boys || 0), 0),
    girls: gradeSummaries.reduce((sum, g) => sum + Number(g.girls || 0), 0),
    unknownGender: gradeSummaries.reduce((sum, g) => sum + Number(g.unknownGender || 0), 0),
    classes: gradeSummaries.reduce((sum, g) => sum + Number(g.classes?.size || 0), 0),
    homes: gradeSummaries.reduce((sum, g) => sum + Number(g.homes || 0), 0),
    integrated: gradeSummaries.reduce((sum, g) => sum + Number(g.integrated || 0), 0),
    statuses,
    grades: gradeSummaries.map(g => ({
      grade: g.grade,
      total: Number(g.total || 0),
      boys: Number(g.boys || 0),
      girls: Number(g.girls || 0),
      unknownGender: Number(g.unknownGender || 0),
      classes: Number(g.classes?.size || 0),
      homes: Number(g.homes || 0),
      integrated: Number(g.integrated || 0),
      statuses: g.statuses || {},
      breakdown: g.breakdown || {}
    })),
    rows: allRows,
    detailRows: allRows.map(row => neprasStatsGetStudentDisplayRow(row))
  };
}

window.neprasStatsAggregateFromRows = neprasStatsAggregateFromRows;
window.neprasCollectSchoolStatistics = neprasCollectSchoolStatistics;
window.neprasExportSchoolStatisticsExcel = neprasExportSchoolStatisticsExcel;
window.neprasStatsGetDetailPayload = neprasStatsGetDetailPayload;
window.neprasExportSchoolStatisticsDetailExcel = neprasExportSchoolStatisticsDetailExcel;
