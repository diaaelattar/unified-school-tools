// ============================================================
// Nepras — Fast Student API Engine
// يستخدم الـ API الذي يستعمله student.emis.gov.eg نفسه.
// مع fallback كامل للمحرك القديم إذا تعذر الـ API.
// ============================================================

const NEPRAS_STUDENT_API_BASE = "https://studaapi.emis.gov.eg/api/Student";

// v1.0 — كل طلبات API تحترم الإيقاف الموحد.
function neprasApiStopRequested() {
  try {
    return window.__NEPRAS_STOP_ALL_REQUESTED__ === true ||
      (typeof window.neprasIsGlobalStopRequested === "function" && window.neprasIsGlobalStopRequested());
  } catch (_) {
    return false;
  }
}

function neprasApiThrowIfStopped() {
  if (!neprasApiStopRequested()) return;
  const error = new Error("USER_STOPPED");
  error.code = "USER_STOPPED";
  throw error;
}

function neprasApiClean(value) {
  return value === undefined || value === null
    ? ""
    : String(value).trim();
}

function neprasApiSexName(sexId, nationalId = "") {
  const id = Number(sexId);

  // مؤكد من صفحة الطالب: sexId=1 يظهر «ذكر».
  if (id === 1) return "ذكر";
  if (id === 2) return "أنثى";

  // fallback من الرقم القومي المصري.
  const nid = String(nationalId || "").replace(/\D/g, "");
  if (nid.length === 14) {
    const genderDigit = Number(nid[12]);
    if (Number.isFinite(genderDigit)) {
      return genderDigit % 2 ? "ذكر" : "أنثى";
    }
  }

  return "";
}

function neprasApiMapSchoolStudent(item) {
  item = item || {};

  const religion =
    item.religionName ||
    item.religion ||
    (Number(item.religionId) === 1 ? "مسلم" : Number(item.religionId) === 2 ? "مسيحي" : "") ||
    (globalThis.NeprasEgypt?.resolveReligion ? globalThis.NeprasEgypt.resolveReligion(item) : "");

  // نفس أعمدة السحب العادي القديمة قدر الإمكان.
  // «النوع» مطلوب للإحصاء، لكن نجعله non-enumerable حتى لا نغير
  // شكل ملف السحب العادي الذي اعتاده المستخدم.
  const row = {
    "كود التلميذ": neprasApiClean(item.studentCode),
    "اسم التلميذ": neprasApiClean(item.studentName),
    "الرقم القومي": neprasApiClean(item.nationalId),
    "الصف": neprasApiClean(item.className),
    "الفصل": neprasApiClean(item.classNumber),
    "نوعية التعليم": neprasApiClean(item.studyTypeName),
    "حالة القيد": neprasApiClean(item.status),
    "الموقف من الدمج": neprasApiClean(item.obstacleName),
    "العام الأكاديمي": neprasApiClean(item.acdyear),
    "الجنسية": neprasApiClean(item.nationality)
  };

  Object.defineProperty(row, "النوع", {
    value: neprasApiSexName(item.sexId, item.nationalId),
    enumerable: false,
    configurable: true
  });

  Object.defineProperty(row, "الديانة", {
    value: religion,
    enumerable: false,
    configurable: true
  });

  Object.defineProperty(row, "religion", {
    value: religion,
    enumerable: false,
    configurable: true
  });

  Object.defineProperty(row, "__neprasApiRaw", {
    value: item,
    enumerable: false,
    configurable: true
  });

  return row;
}

function neprasApiMapTransferStudent(item) {
  item = item || {};

  return {
    "كود التلميذ": neprasApiClean(item.studentCode),
    "اسم التلميذ": neprasApiClean(item.studentName),
    "الرقم القومي": neprasApiClean(item.nationalId),
    "الصف": neprasApiClean(item.className),
    "الفصل": neprasApiClean(item.classNumber),
    "الجنسية": neprasApiClean(item.nationality)
  };
}

async function neprasApiFetchJson(url, options = {}) {
  neprasApiThrowIfStopped();

  // v1.0:
  // نرسل الطلب إلى service worker.
  // الـ service worker ينفذ fetch مباشرة إلى studaapi باستخدام
  // Authorization / schoolcode / schoolstage التي التقطها من الموقع.
  const response = await chrome.runtime.sendMessage({
    action: "NEPRAS_STUDENT_PAGE_FETCH",
    url: String(url || ""),
    options: {
      method: String(options.method || "GET").toUpperCase(),
      body: options.body ?? null,
      headers: options.headers || {}
    }
  });

  neprasApiThrowIfStopped();

  if (!response?.ok) {
    const reason =
      response?.message ||
      (response?.status ? `API_HTTP_${response.status}` : "STUDENT_API_FETCH_FAILED");
    const via = response?.via ? ` [${response.via}]` : "";
    throw new Error(`${reason}${via}`);
  }

  return response.data;
}


async function neprasApiSaveStudentAbsence(
  payloadRows
) {
  neprasApiThrowIfStopped();
  if (
    !Array.isArray(payloadRows) ||
    !payloadRows.length
  ) {
    throw new Error(
      "ATTENDANCE_PAYLOAD_EMPTY"
    );
  }

  // v1.0:
  // الكتابة تتم من MAIN world داخل student.emis.gov.eg
  // وليس من extension service worker.
  // السبب: WAF الوزارة رفض POST القادم من extension origin
  // رغم صحة Authentication.
  const response =
    await chrome.runtime.sendMessage({
      action:
        "NEPRAS_ATTENDANCE_PAGE_SAVE",
      payload:
        payloadRows
    });

  neprasApiThrowIfStopped();

  if (!response?.ok) {
    let detail =
      response?.statusText ||
      "ATTENDANCE_PAGE_SAVE_FAILED";

    if (
      typeof response?.data ===
      "string" &&
      response.data
    ) {
      // لا نعرض صفحة HTML كاملة في التنبيه.
      if (
        /<html|request rejected/i.test(
          response.data
        )
      ) {
        detail =
          "ATTENDANCE_PAGE_REQUEST_REJECTED";
      } else {
        detail =
          response.data.slice(
            0,
            240
          );
      }
    }

    throw new Error(
      `ATTENDANCE_SAVE_NOT_CONFIRMED:${detail}`
    );
  }

  if (
    response.data !== true
  ) {
    throw new Error(
      "ATTENDANCE_SAVE_RESPONSE_NOT_TRUE"
    );
  }

  return true;
}

async function neprasApiGetSchoolStudents(acdYearCode) {
  const gradeCode = String(acdYearCode ?? "").trim();

  if (!gradeCode) {
    throw new Error("GRADE_CODE_REQUIRED");
  }

  let data = await neprasApiFetchJson(
    `${NEPRAS_STUDENT_API_BASE}/GetSchoolStudent`,
    {
      method: "POST",
      body: JSON.stringify({
        acdYearCode: gradeCode
      })
    }
  );

  if (typeof data === "string") {
    const trimmed = data.trim().replace(/^\uFEFF/, "");
    try {
      data = JSON.parse(trimmed);
    } catch (_) {}
  }

  let list = null;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.data)) list = data.data;
    else if (Array.isArray(data.result)) list = data.result;
    else if (Array.isArray(data.items)) list = data.items;
    else if (Array.isArray(data.value)) list = data.value;
    else if (Array.isArray(data.students)) list = data.students;
    else if (Array.isArray(data.studentList)) list = data.studentList;
  } else if (data === null || data === undefined || data === "") {
    list = [];
  }

  if (!Array.isArray(list)) {
    const sample = typeof data === "string" ? data.slice(0, 160) : JSON.stringify(data || "").slice(0, 160);
    throw new Error(`INVALID_SCHOOL_STUDENTS_RESPONSE: ${sample}`);
  }

  return list;
}

async function neprasApiGetSchoolStudentRows(acdYearCode) {
  const raw = await neprasApiGetSchoolStudents(acdYearCode);
  return raw.map(neprasApiMapSchoolStudent);
}

async function neprasApiGetTransferRows(acdYearCode) {
  const raw = await neprasApiGetSchoolStudents(acdYearCode);
  return raw.map(neprasApiMapTransferStudent);
}

async function neprasApiGetStudentByCode(studentCode) {
  const code = String(studentCode ?? "").replace(/\D/g, "");

  if (!code) {
    throw new Error("STUDENT_CODE_REQUIRED");
  }

  return await neprasApiFetchJson(
    `${NEPRAS_STUDENT_API_BASE}/GetStudentByStudentCode?studentCode=${encodeURIComponent(code)}`,
    {
      method: "GET"
    }
  );
}

// v1.0: البريد الموحد/البديل ورقم الموبايل الثاني — Endpoint منفصل تمامًا
// (صفحة /unifiedemails/update)، شفته في طلبات الشبكة الحقيقية للموقع.
// الحقول الدقيقة في الاستجابة لسه غير مؤكدة 100%، فـ neprasBuildDeepStudentFromApi
// بيجرّب أكتر من اسم محتمل.
const NEPRAS_UNIFIED_EMAILS_API_BASE = "https://studaapi.emis.gov.eg/api/UnifiedEmails";

async function neprasApiGetStudentEmailInfo(studentCode) {
  const code = String(studentCode ?? "").replace(/\D/g, "");

  if (!code) {
    throw new Error("STUDENT_CODE_REQUIRED");
  }

  return await neprasApiFetchJson(
    `${NEPRAS_UNIFIED_EMAILS_API_BASE}/GetStudentEmailInfo?StudentCode=${encodeURIComponent(code)}`,
    {
      method: "GET"
    }
  );
}


// v1.0: caller distinguishes auth/session failure from a real not-found result.
async function neprasApiLookupStudentByNationalId(nationalId) {
  const nid = String(nationalId ?? "").replace(/\D/g, "");

  if (!/^\d{14}$/.test(nid)) {
    throw new Error("NATIONAL_ID_14_DIGITS_REQUIRED");
  }

  return await neprasApiFetchJson(
    `${NEPRAS_STUDENT_API_BASE}/IsDocumentIdValid?DocumentId=${encodeURIComponent(nid)}&IdType=1`,
    { method: "GET" }
  );
}



const neprasApiStaticDeepLookupCache = new Map();

function neprasApiArrayPayload(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.result)) {
    return data.result;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
}

function neprasApiLookupMapFromRows(
  rows,
  idKeys = [],
  nameKeys = []
) {
  const map = {};

  for (const row of neprasApiArrayPayload(rows)) {
    if (!row || typeof row !== "object") {
      continue;
    }

    let id = "";

    for (const key of idKeys) {
      const value = row?.[key];
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        id = String(value).trim();
        break;
      }
    }

    let name = "";

    for (const key of nameKeys) {
      const value = row?.[key];
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        name = neprasApiClean(value);
        break;
      }
    }

    if (!id || !name) {
      continue;
    }

    map[id] = name;

    // Angular sometimes serializes numeric IDs as "1.0".
    const num = Number(id);
    if (
      Number.isFinite(num) &&
      !map[String(num)]
    ) {
      map[String(num)] = name;
    }
  }

  return map;
}

async function neprasApiGetSimpleLookup(
  endpointName
) {
  const endpoint =
    String(endpointName || "").trim();

  if (
    ![
      "Religion",
      "Languages",
      "Nationalities",
      "BirthBranch",
      "Obstacle"
    ].includes(endpoint)
  ) {
    throw new Error(
      "DEEP_LOOKUP_ENDPOINT_NOT_ALLOWED"
    );
  }

  return await neprasApiFetchJson(
    `https://studaapi.emis.gov.eg/api/${endpoint}`,
    {
      method: "GET"
    }
  );
}

async function neprasApiGetStaticDeepLookups() {
  const cacheKey = "static-v1.0";

  if (
    neprasApiStaticDeepLookupCache.has(
      cacheKey
    )
  ) {
    return neprasApiStaticDeepLookupCache.get(
      cacheKey
    );
  }

  const specs = {
    Religion: {
      key: "religion",
      ids: [
        "religionId",
        "id",
        "code",
        "value"
      ],
      names: [
        "religionName",
        "name",
        "text",
        "label"
      ]
    },

    Languages: {
      key: "language",
      ids: [
        "languageId",
        "langId",
        "id",
        "code",
        "value"
      ],
      names: [
        "languageName",
        "langName",
        "name",
        "text",
        "label"
      ]
    },

    Nationalities: {
      key: "nationality",
      ids: [
        "nationalityId",
        "natId",
        "id",
        "code",
        "value"
      ],
      names: [
        "nationalityName",
        "natName",
        "name",
        "text",
        "label"
      ]
    },

    BirthBranch: {
      key: "birthGov",
      ids: [
        "branchId",
        "birthBranchId",
        "governorateId",
        "govId",
        "id",
        "code",
        "value"
      ],
      names: [
        "branchName",
        "birthBranchName",
        "governorateName",
        "govName",
        "name",
        "text",
        "label"
      ]
    },

    Obstacle: {
      key: "obstacle",
      ids: [
        "obstacleId",
        "disabilityId",
        "id",
        "code",
        "value"
      ],
      names: [
        "obstacleName",
        "disabilityName",
        "name",
        "text",
        "label"
      ]
    }
  };

  const result = {
    religion: { map: { "1": "مسلم", "2": "مسيحي" }, selectedValue: "", selectedText: "" },
    lang1: { map: {}, selectedValue: "", selectedText: "" },
    lang2: { map: {}, selectedValue: "", selectedText: "" },
    nationality: { map: { "1": "مصري" }, selectedValue: "", selectedText: "" },
    birthGov: { map: {}, selectedValue: "", selectedText: "" },
    obstacle: { map: {}, selectedValue: "", selectedText: "" },
    diagnostics: {}
  };

  const entries =
    Object.entries(specs);

  const loaded =
    await Promise.all(
      entries.map(
        async ([endpoint, spec]) => {
          try {
            const rows =
              await neprasApiGetSimpleLookup(
                endpoint
              );

            const map =
              neprasApiLookupMapFromRows(
                rows,
                spec.ids,
                spec.names
              );

            return {
              endpoint,
              spec,
              map,
              ok: true
            };
          } catch (error) {
            return {
              endpoint,
              spec,
              map: {},
              ok: false,
              reason:
                error?.message ||
                String(error)
            };
          }
        }
      )
    );

  for (const item of loaded) {
    result.diagnostics[
      item.endpoint
    ] = {
      ok: item.ok,
      count:
        Object.keys(
          item.map || {}
        ).length,
      reason:
        item.reason || ""
    };

    if (item.spec.key === "language") {
      result.lang1.map = {
        ...result.lang1.map,
        ...item.map
      };
      result.lang2.map = {
        ...result.lang2.map,
        ...item.map
      };
      continue;
    }

    if (result[item.spec.key]) {
      result[item.spec.key].map = {
        ...result[item.spec.key].map,
        ...item.map
      };
    }
  }

  neprasApiStaticDeepLookupCache.set(
    cacheKey,
    result
  );

  return result;
}

async function neprasApiGetStudentByCodeRetry(
  studentCode,
  maxAttempts = 2
) {
  let lastError = null;

  const attempts =
    Math.max(
      1,
      Math.min(
        3,
        Number(maxAttempts) || 2
      )
    );

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await neprasApiGetStudentByCode(
        studentCode
      );
    } catch (error) {
      lastError = error;

      if (
        typeof neprasApiIsAuthFailure === "function" &&
        neprasApiIsAuthFailure(error)
      ) {
        throw error;
      }

      if (attempt < attempts) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              250 * attempt
            )
        );
      }
    }
  }

  throw lastError ||
    new Error(
      "STUDENT_DETAILS_RETRY_FAILED"
    );
}

async function neprasApiGetStudentEmailInfoRetry(
  studentCode,
  maxAttempts = 2
) {
  let lastError = null;

  const attempts =
    Math.max(1, Math.min(3, Number(maxAttempts) || 2));

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await neprasApiGetStudentEmailInfo(studentCode);
    } catch (error) {
      lastError = error;

      if (
        typeof neprasApiIsAuthFailure === "function" &&
        neprasApiIsAuthFailure(error)
      ) {
        throw error;
      }

      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw lastError || new Error("STUDENT_EMAIL_INFO_RETRY_FAILED");
}

const neprasApiGeneralSpecialCache = new Map();


function neprasApiTransientErrorReason(
  errorOrReason
) {
  return String(
    errorOrReason?.message ||
    errorOrReason ||
    ""
  );
}

function neprasApiIsTransientServerFailure(
  errorOrReason
) {
  const msg =
    neprasApiTransientErrorReason(
      errorOrReason
    );

  return (
    msg.includes("API_HTTP_429") ||
    msg.includes("API_HTTP_500") ||
    msg.includes("API_HTTP_502") ||
    msg.includes("API_HTTP_503") ||
    msg.includes("API_HTTP_504") ||
    msg.includes("STUDENT_API_FETCH_FAILED") ||
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError")
  );
}

async function neprasApiGetContext() {
  const response =
    await chrome.runtime.sendMessage({
      action: "NEPRAS_STUDENT_API_CONTEXT"
    });

  if (!response?.ok) {
    throw new Error(
      response?.message ||
      "STUDENT_API_CONTEXT_FAILED"
    );
  }

  return {
    schoolstage:
      String(
        response.schoolstage || ""
      ).trim(),
    hasAuth:
      response.hasAuth === true,
    schoolcode:
      String(
        response.schoolcode || response.schoolKey || ""
      ).trim(),
    schoolName:
      String(
        response.schoolName || ""
      ).trim(),
    schoolKey:
      String(
        response.schoolcode || response.schoolKey || ""
      ).trim()
  };
}

async function neprasApiGetGeneral(stageCode, acdCode) {
  const stage =
    String(stageCode ?? "").trim();

  const acd =
    String(acdCode ?? "").trim();

  if (!stage || !acd) {
    throw new Error(
      "GENERAL_LOOKUP_PARAMS_REQUIRED"
    );
  }

  const data =
    await neprasApiFetchJson(
      `https://studaapi.emis.gov.eg/api/General?stageCode=${encodeURIComponent(stage)}&AcdCode=${encodeURIComponent(acd)}`,
      { method: "GET" }
    );

  return Array.isArray(data)
    ? data
    : [];
}

async function neprasApiGetSpecial(
  stageCode,
  acdCode,
  generalCode
) {
  const stage =
    String(stageCode ?? "").trim();

  const acd =
    String(acdCode ?? "").trim();

  const general =
    String(generalCode ?? "").trim();

  if (!stage || !acd || !general) {
    throw new Error(
      "SPECIAL_LOOKUP_PARAMS_REQUIRED"
    );
  }

  const data =
    await neprasApiFetchJson(
      `https://studaapi.emis.gov.eg/api/Special?stageCode=${encodeURIComponent(stage)}&AcdCode=${encodeURIComponent(acd)}&GeneralCode=${encodeURIComponent(general)}`,
      { method: "GET" }
    );

  return Array.isArray(data)
    ? data
    : [];
}

async function neprasApiGetGeneralSpecialLookups(
  acdCode,
  explicitStageCode = ""
) {
  const acd =
    String(acdCode ?? "").trim();

  if (!acd) {
    throw new Error(
      "ACD_CODE_REQUIRED_FOR_GENERAL_SPECIAL"
    );
  }

  let stageCode =
    String(
      explicitStageCode || ""
    ).trim();

  if (!stageCode) {
    const ctx =
      await neprasApiGetContext();

    stageCode =
      String(
        ctx.schoolstage || ""
      ).trim();
  }

  if (!stageCode) {
    throw new Error(
      "SCHOOL_STAGE_NOT_CAPTURED"
    );
  }

  const cacheKey =
    `${stageCode}|${acd}`;

  if (
    neprasApiGeneralSpecialCache.has(
      cacheKey
    )
  ) {
    return neprasApiGeneralSpecialCache.get(
      cacheKey
    );
  }

  const generalRows =
    await neprasApiGetGeneral(
      stageCode,
      acd
    );

  const sectionMap = {};
  const specializationMap = {};
  const specializationByGeneral = {};

  for (const row of generalRows) {
    const id =
      String(
        row?.generalId ?? ""
      ).trim();

    const name =
      neprasApiClean(
        row?.generalName
      );

    if (id && name) {
      sectionMap[id] = name;
    }
  }

  const specialGroups =
    await Promise.all(
      generalRows
        .map(row =>
          String(
            row?.generalId ?? ""
          ).trim()
        )
        .filter(Boolean)
        .map(async generalId => {
          try {
            const rows =
              await neprasApiGetSpecial(
                stageCode,
                acd,
                generalId
              );

            return {
              generalId,
              rows
            };
          } catch (error) {
            console.warn(
              `Nepras Special lookup failed for GeneralCode=${generalId}:`,
              error
            );

            return {
              generalId,
              rows: []
            };
          }
        })
    );

  for (const group of specialGroups) {
    const nested = {};

    for (const row of group.rows) {
      const id =
        String(
          row?.specialId ?? ""
        ).trim();

      const name =
        neprasApiClean(
          row?.specialName
        );

      if (!id || !name) {
        continue;
      }

      nested[id] = name;

      // Flat map remains useful when specialId is globally unique.
      // If the same ID appears under another General, nested lookup
      // in export.js takes precedence.
      if (!specializationMap[id]) {
        specializationMap[id] = name;
      }
    }

    specializationByGeneral[
      String(group.generalId)
    ] = nested;
  }

  const result = {
    stageCode,
    acdCode: acd,
    section: {
      map: sectionMap,
      selectedValue: "",
      selectedText: ""
    },
    specialization: {
      map: specializationMap,
      selectedValue: "",
      selectedText: ""
    },
    specializationByGeneral,
    rawGeneral: generalRows,
    rawSpecial: specialGroups
  };

  neprasApiGeneralSpecialCache.set(
    cacheKey,
    result
  );

  return result;
}

function neprasApiGradeOrdinalFromName(gradeName) {
  const n = typeof normalizeText === "function"
    ? normalizeText(gradeName)
    : String(gradeName || "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/\s+/g, "");

  const names = [
    ["الاول", "اول", "المستوىالاول", "kg1"],
    ["الثاني", "ثاني", "المستوىالثاني", "kg2"],
    ["الثالث", "ثالث"],
    ["الرابع", "رابع"],
    ["الخامس", "خامس"],
    ["السادس", "سادس"]
  ];

  for (let i = 0; i < names.length; i++) {
    if (names[i].some(x => n.includes(x))) {
      return String(i + 1);
    }
  }

  return "";
}

function neprasApiResolveGradeCode(gradeName) {
  const wanted =
    typeof normalizeText === "function"
      ? normalizeText(gradeName)
      : String(gradeName || "")
          .replace(/\s+/g, "")
          .trim();

  // 1) أفضل مصدر: قيمة option الحقيقية في صفحة الوزارة.
  try {
    const select =
      typeof neprasFindGradeSelectByLabel === "function"
        ? neprasFindGradeSelectByLabel()?.sel
        : null;

    if (select) {
      const option =
        Array.from(select.options || [])
          .find(opt => {
            const text =
              typeof cleanValue === "function"
                ? cleanValue(opt.text || opt.textContent || "")
                : String(opt.text || opt.textContent || "").trim();

            const normalized =
              typeof normalizeText === "function"
                ? normalizeText(text)
                : text.replace(/\s+/g, "");

            return (
              normalized === wanted ||
              normalized.includes(wanted) ||
              wanted.includes(normalized)
            );
          });

      if (
        option?.value !== undefined &&
        option?.value !== null &&
        /^\d+$/.test(String(option.value))
      ) {
        return String(option.value);
      }
    }
  } catch (_) {}

  // 2) API الوزارة يستخدم acdYearCode رقميًا: 1،2،3...
  const ordinal =
    neprasApiGradeOrdinalFromName(
      gradeName
    );

  if (ordinal) {
    return ordinal;
  }

  // 3) لا نرسل pseudo keys مثل S1 / T2 / P3 إلى API.
  return "";
}

function neprasApiIsAuthFailure(errorOrReason) {
  const msg =
    String(
      errorOrReason?.message ||
      errorOrReason ||
      ""
    );

  return (
    msg.includes("AUTH_HEADERS_NOT_CAPTURED") ||
    msg.includes("API_HTTP_401") ||
    msg.includes("API_HTTP_403") ||
    msg.includes("INVALID_SCHOOL_STUDENTS_RESPONSE") ||
    /\b401\b/.test(msg) ||
    /\b403\b/.test(msg)
  );
}

let neprasApiPrimePromise = null;

async function neprasApiAutoPrimeSession(preferredGradeName = "", explicitGradeCode = "") {
  if (neprasApiPrimePromise) {
    return neprasApiPrimePromise;
  }

  neprasApiPrimePromise = (async () => {
    try {
      if (typeof showFloatingStatus === "function") {
        showFloatingStatus(
          "🔐 تجهيز الاتصال السريع ببيانات التلميذ تلقائيًا..."
        );
      }

      let gradeName =
        String(preferredGradeName || "").trim();

      if (!gradeName) {
        try {
          const grades =
            typeof neprasGetStageGradesForToolbar === "function"
              ? neprasGetStageGradesForToolbar()
              : [];

          gradeName =
            String(grades?.[0]?.name || "").trim();
        } catch (_) {}
      }

      if (!gradeName) {
        gradeName = "الصف الأول";
      }

      // في صفحة طلبات النقل نستخدم بحث الصفحة نفسها حتى لا نغادرها.
      try {
        if (
          typeof neprasIsTransferRouteStrict === "function" &&
          neprasIsTransferRouteStrict() &&
          typeof selectGradeAndSearchTransferModal === "function"
        ) {
          const result =
            await selectGradeAndSearchTransferModal(
              gradeName,
              explicitGradeCode
            );

          if (result?.success) {
            await (
              typeof sleep === "function"
                ? sleep(700)
                : new Promise(r => setTimeout(r, 700))
            );
            return true;
          }
        }
      } catch (_) {}

      // في صفحة «بحث عن تلميذ» نضغط بحث آليًا مرة واحدة فقط
      // ليمر الطلب الحقيقي عبر Angular Interceptor ويلتقط نبراس الرؤوس.
      try {
        const isStudentList =
          /\/student\/list/i.test(
            String(location?.pathname || "")
          );

        if (
          isStudentList &&
          typeof selectGradeAndSearchMain === "function"
        ) {
          const result =
            await selectGradeAndSearchMain(
              gradeName
            );

          if (result?.success) {
            await (
              typeof sleep === "function"
                ? sleep(700)
                : new Promise(r => setTimeout(r, 700))
            );
            return true;
          }
        }
      } catch (_) {}

      return false;
    } finally {
      setTimeout(() => {
        neprasApiPrimePromise = null;
      }, 300);
    }
  })();

  return neprasApiPrimePromise;
}

async function neprasApiTryRowsForGrade(
  gradeName,
  explicitCode = "",
  options = {}
) {
  if (neprasApiStopRequested()) {
    return { ok: false, rows: [], gradeCode: "", reason: "USER_STOPPED", userStopped: true };
  }
  const gradeCode =
    String(explicitCode || "").trim() ||
    neprasApiResolveGradeCode(gradeName);

  if (!gradeCode) {
    return {
      ok: false,
      rows: [],
      gradeCode: "",
      reason: "GRADE_CODE_NOT_FOUND"
    };
  }

  const transferOnly =
    options?.transferOnly === true;

  const loadRows = async () =>
    transferOnly
      ? await neprasApiGetTransferRows(gradeCode)
      : await neprasApiGetSchoolStudentRows(gradeCode);

  try {
    const rows = await loadRows();

    if (neprasApiStopRequested()) {
      return { ok: false, rows: [], gradeCode, reason: "USER_STOPPED", userStopped: true };
    }

    return {
      ok: true,
      rows,
      gradeCode,
      count: rows.length,
      primed: false
    };
  } catch (error) {
    if (neprasApiStopRequested() || error?.code === "USER_STOPPED" || String(error?.message || "").includes("USER_STOPPED")) {
      return { ok: false, rows: [], gradeCode, reason: "USER_STOPPED", userStopped: true };
    }

    // لا نطلب من المستخدم فتح البحث يدويًا.
    // إذا كانت الجلسة لم تُلتقط/انتهت، ننفذ بحث الوزارة مرة واحدة
    // تلقائيًا ثم نعيد نفس Request السريع.
    if (neprasApiIsAuthFailure(error)) {
      const primed =
        await neprasApiAutoPrimeSession(
          gradeName,
          gradeCode
        );

      if (primed) {
        try {
          const rows = await loadRows();

          return {
            ok: true,
            rows,
            gradeCode,
            count: rows.length,
            primed: true
          };
        } catch (retryError) {
          return {
            ok: false,
            rows: [],
            gradeCode,
            reason:
              retryError?.message ||
              String(retryError),
            authFailure:
              neprasApiIsAuthFailure(
                retryError
              )
          };
        }
      }
    }

    console.warn(
      "Nepras Fast API:",
      gradeName,
      error
    );

    return {
      ok: false,
      rows: [],
      gradeCode,
      reason:
        error?.message ||
        String(error),
      authFailure:
        neprasApiIsAuthFailure(error)
    };
  }
}

window.neprasApiGetSchoolStudents = neprasApiGetSchoolStudents;
window.neprasApiSaveStudentAbsence = neprasApiSaveStudentAbsence;
window.neprasApiGetSchoolStudentRows = neprasApiGetSchoolStudentRows;
window.neprasApiGetTransferRows = neprasApiGetTransferRows;
window.neprasApiGetStudentByCode = neprasApiGetStudentByCode;
window.neprasApiGetStudentEmailInfo = neprasApiGetStudentEmailInfo;
window.neprasApiGetStudentEmailInfoRetry = neprasApiGetStudentEmailInfoRetry;
window.neprasApiLookupStudentByNationalId = neprasApiLookupStudentByNationalId;
window.neprasApiGetStudentByCodeRetry = neprasApiGetStudentByCodeRetry;
window.neprasApiGetStaticDeepLookups = neprasApiGetStaticDeepLookups;
window.neprasApiGetContext = neprasApiGetContext;
window.neprasApiGetGeneral = neprasApiGetGeneral;
window.neprasApiGetSpecial = neprasApiGetSpecial;
window.neprasApiGetGeneralSpecialLookups = neprasApiGetGeneralSpecialLookups;
window.neprasApiResolveGradeCode = neprasApiResolveGradeCode;
window.neprasApiTryRowsForGrade = neprasApiTryRowsForGrade;
window.neprasApiAutoPrimeSession = neprasApiAutoPrimeSession;
window.neprasApiIsAuthFailure = neprasApiIsAuthFailure;
window.neprasApiIsTransientServerFailure = neprasApiIsTransientServerFailure;
