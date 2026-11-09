// ============================================================
// Nepras — المصروفات والإعفاءات
// ============================================================

const NEPRAS_EXPENSES_STORAGE_KEY = "neprasExpensesAnalysisV1";

function neprasExpensesStopRequested() {
  try {
    return window.__NEPRAS_STOP_ALL_REQUESTED__ === true ||
      (typeof window.neprasIsGlobalStopRequested === "function" && window.neprasIsGlobalStopRequested());
  } catch (_) {
    return false;
  }
}

function neprasExpensesThrowIfStopped() {
  if (!neprasExpensesStopRequested()) return;
  const error = new Error("USER_STOPPED");
  error.code = "USER_STOPPED";
  throw error;
}

function neprasExpensesClean(v) {
  return v == null ? "" : String(v).trim();
}

function neprasExpensesNorm(v) {
  return neprasExpensesClean(v)
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function neprasExpensesRule(excName) {
  const raw = neprasExpensesClean(excName);
  const n = neprasExpensesNorm(raw);

  if (!raw) {
    return { kind: "none", percent: 0, label: "لا يوجد إعفاء" };
  }

  if (
    n.includes("ابناء العاملين") &&
    n.includes("التربيه والتعليم")
  ) {
    return {
      kind: "partial",
      percent: 50,
      label: "تخفيض 50% وفق القرار"
    };
  }

  const fullPatterns = [
    "يتامي الاب",
    "بحث اجتماعي",
    "التعليم المجتمعي",
    "شهداء",
    "تكافل",
    "كرامه",
    "الضمان الاجتماعي",
    "دور الرعايه",
    "المراه المعيله",
    "المطلقه",
    "مهجوره العائل"
  ];

  if (fullPatterns.some(p => n.includes(p))) {
    return {
      kind: "full",
      percent: 100,
      label: "إعفاء وفق القرار"
    };
  }

  return {
    kind: "review",
    percent: null,
    label: "يحتاج مراجعة"
  };
}

function neprasExpensesStudentFromRow(row) {
  const raw = row?.__neprasApiRaw || {};
  const code = neprasExpensesClean(
    row?.["كود التلميذ"] || raw.studentCode
  );

  const studyType = neprasExpensesClean(
    row?.["نوعية التعليم"] ||
    row?.["نوع التعليم"] ||
    raw.studyTypeName
  );

  const studyTypeId =
    Number(
      raw.studentStudyType ??
      raw.studyTypeId ??
      0
    ) || 0;

  const studyTypeNorm =
    neprasExpensesNorm(studyType);

  // من واقع بيانات بوابة الطلاب:
  // studentStudyType = 2 يمثل المنازل في القوائم الحالية،
  // مع إبقاء فحص الاسم حتى تظل الأداة ديناميكية لو تغير الرقم مستقبلًا.
  const isHome =
    studyTypeNorm.includes("منازل") ||
    studyTypeId === 2;

  return {
    code,
    nationalId: neprasExpensesClean(
      row?.["الرقم القومي"] || raw.nationalId
    ),
    name: neprasExpensesClean(
      row?.["اسم التلميذ"] || raw.studentName
    ),
    grade: neprasExpensesClean(
      row?.["الصف"] || raw.className
    ),
    className: neprasExpensesClean(
      row?.["الفصل"] || raw.classNumber
    ),
    gender: neprasExpensesClean(
      row?.["النوع"] ||
      (Number(raw.sexId) === 1 ? "ذكر" : Number(raw.sexId) === 2 ? "أنثى" : "")
    ),
    studyType,
    studyTypeId,
    isHome,
    status: neprasExpensesClean(
      row?.["حالة القيد"] || raw.status
    ),

    // v1.0: حقول «الحالة الحالية» في كشف المسددين.
    // بيانات الصف/القيد متاحة بالفعل من قائمة المدرسة الحالية،
    // أما المدرسة/الإدارة/المديرية فنلتقطها من الـ API إن كانت موجودة،
    // ثم نكمل الناقص مرة واحدة من البحث القومي في الدالة التالية.
    currentSchoolName: neprasExpensesClean(
      raw.currentSchoolName ||
      raw.schoolName ||
      raw.schoolname ||
      raw.school
    ),
    currentAdministration: neprasExpensesClean(
      raw.currentAdministration ||
      raw.edaraName ||
      raw.edara ||
      raw.administrationName ||
      raw.administration
    ),
    currentDirectorate: neprasExpensesClean(
      raw.currentDirectorate ||
      raw.mudName ||
      raw.moderyaName ||
      raw.directorateName ||
      raw.directorate
    ),
    currentGrade: neprasExpensesClean(
      row?.["الصف"] || raw.className
    ),
    currentStatus: neprasExpensesClean(
      row?.["حالة القيد"] || raw.status
    )
  };
}

async function neprasExpensesEnrichCurrentSchoolContext(allStudents) {
  const students = Array.isArray(allStudents) ? allStudents : [];
  if (!students.length) return students;

  let schoolName = neprasExpensesClean(
    students.find(s => neprasExpensesClean(s?.currentSchoolName))?.currentSchoolName
  );
  let administration = neprasExpensesClean(
    students.find(s => neprasExpensesClean(s?.currentAdministration))?.currentAdministration
  );
  let directorate = neprasExpensesClean(
    students.find(s => neprasExpensesClean(s?.currentDirectorate))?.currentDirectorate
  );

  // اسم المدرسة معروف من رأس بوابة الطلاب؛ نستخدمه بدون أي طلب إضافي.
  if (!schoolName && typeof getSchoolNameFromPage === "function") {
    try {
      const fromPage = neprasExpensesClean(getSchoolNameFromPage());
      const n = neprasExpensesNorm(fromPage);
      if (fromPage && n !== "المدرسه") schoolName = fromPage;
    } catch (_) {}
  }

  // الإدارة والمديرية لا ترجعان دائمًا في GetSchoolStudent.
  // بدل البحث عن كل طالب، نقرأ طالبًا حاليًا واحدًا فقط؛
  // فالطلاب الموجودون في قائمة المدرسة الحالية يشتركون في نفس المدرسة/الإدارة/المديرية.
  if (
    (!schoolName || !administration || !directorate) &&
    typeof window.neprasApiLookupStudentByNationalId === "function"
  ) {
    const samples = students
      .map(s => neprasExpensesClean(s?.nationalId))
      .filter(nid => /^\d{14}$/.test(nid))
      .slice(0, 5);

    for (const nid of samples) {
      neprasExpensesThrowIfStopped();
      try {
        const info = await window.neprasApiLookupStudentByNationalId(nid);
        if (!info || typeof info !== "object") continue;

        schoolName = schoolName || neprasExpensesClean(info.schoolName);
        administration = administration || neprasExpensesClean(info.edaraName);
        directorate = directorate || neprasExpensesClean(info.mudName);

        if (schoolName && administration && directorate) break;
      } catch (_) {}
    }
  }

  for (const s of students) {
    s.currentSchoolName =
      neprasExpensesClean(s?.currentSchoolName) || schoolName;
    s.currentAdministration =
      neprasExpensesClean(s?.currentAdministration) || administration;
    s.currentDirectorate =
      neprasExpensesClean(s?.currentDirectorate) || directorate;
    s.currentGrade =
      neprasExpensesClean(s?.currentGrade) || neprasExpensesClean(s?.grade);
    s.currentStatus =
      neprasExpensesClean(s?.currentStatus) || neprasExpensesClean(s?.status);
  }

  return students;
}


async function neprasExpensesEnsureCurrentSession(stageKey = "") {
  neprasExpensesThrowIfStopped();

  // المصروفات يجب أن تعمل مباشرة بدون اشتراط تشغيل «إحصاء المدرسة» أولًا.
  // نجهز سياق جلسة الوزارة ببحث خفيف واحد على أول صف حالي، وهو نفس
  // التهيئة التي كانت تحدث ضمنيًا عند تشغيل الإحصاء قبل تحليل المصروفات.
  try {
    if (stageKey && typeof window.neprasSetSelectedStage === "function") {
      window.neprasSetSelectedStage(stageKey, true);
    }
    if (typeof window.neprasRefreshGradesListFromPage === "function") {
      try { window.neprasRefreshGradesListFromPage(); } catch (_) {}
    }

    const grades = typeof window.neprasGetAvailableGradesForPopup === "function"
      ? window.neprasGetAvailableGradesForPopup().filter(g => g && g.value && g.text && String(g.value) !== "-1")
      : [];

    const first = grades[0] || null;
    if (typeof window.neprasApiAutoPrimeSession === "function") {
      if (typeof showFloatingStatus === "function") {
        showFloatingStatus("💰 جاري تجهيز بيانات المصروفات...");
      }
      const primed = await window.neprasApiAutoPrimeSession(
        first?.text || "",
        first?.value || ""
      );
      neprasExpensesThrowIfStopped();
      if (!primed) {
        // قد تكون الجلسة ملتقطة بالفعل؛ نتحقق من السياق قبل اعتبار ذلك فشلًا.
        try {
          const ctx = typeof window.neprasApiGetContext === "function"
            ? await window.neprasApiGetContext()
            : null;
          if (!ctx?.hasAuth) throw new Error("تعذر تجهيز اتصال بيانات المدرسة. أعد تحميل صفحة بيانات التلميذ ثم حاول مرة أخرى.");
        } catch (error) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error?.code === "USER_STOPPED" || String(error?.message || "").includes("USER_STOPPED")) throw error;
    throw new Error(error?.message || "تعذر تجهيز بيانات المدرسة لتحليل المصروفات.");
  }
}

async function neprasExpensesCollectAllStudents() {
  if (typeof window.neprasGetAvailableGradesForPopup !== "function") {
    throw new Error("تعذر التعرف على صفوف المدرسة.");
  }

  const grades = window.neprasGetAvailableGradesForPopup()
    .filter(g => g && g.value && g.text && String(g.value) !== "-1");

  if (!grades.length) {
    throw new Error("لا توجد صفوف متاحة للتحليل.");
  }

  const all = [];
  const seen = new Set();

  for (let i = 0; i < grades.length; i++) {
    neprasExpensesThrowIfStopped();
    const grade = grades[i];

    if (typeof showFloatingStatus === "function") {
      showFloatingStatus(
        `💰 تجهيز بيانات المصروفات: ${grade.text} (${i + 1}/${grades.length})...`
      );
    }

    if (typeof window.neprasApiTryRowsForGrade !== "function") {
      throw new Error("محرك بيانات الطلاب السريع غير متاح.");
    }

    const result = await window.neprasApiTryRowsForGrade(
      grade.text,
      grade.value
    );

    if (result?.userStopped || String(result?.reason || "").includes("USER_STOPPED")) {
      neprasExpensesThrowIfStopped();
      const stopped = new Error("USER_STOPPED");
      stopped.code = "USER_STOPPED";
      throw stopped;
    }

    neprasExpensesThrowIfStopped();

    if (!result?.ok || !Array.isArray(result.rows)) {
      throw new Error(`تعذر تنزيل بيانات ${grade.text}.`);
    }

    for (const row of result.rows) {
      const s = neprasExpensesStudentFromRow(row);
      if (!s.code || seen.has(s.code)) continue;
      seen.add(s.code);
      all.push(s);
    }
  }

  return all;
}

async function neprasExpensesEnrichPaidReportRows(allStudents, remote) {
  const reportRows = Array.isArray(remote?.paidReportRows) ? remote.paidReportRows : [];
  if (!reportRows.length) return remote;
  const currentCodes = new Set((Array.isArray(allStudents) ? allStudents : []).map(s => neprasExpensesClean(s?.code)).filter(Boolean));
  const currentNids = new Set((Array.isArray(allStudents) ? allStudents : []).map(s => neprasExpensesClean(s?.nationalId)).filter(Boolean));
  const missing = reportRows.filter(row => {
    const code = neprasExpensesClean(row?.studentCode);
    const nid = neprasExpensesClean(row?.nationalId);
    return !((code && currentCodes.has(code)) || (nid && currentNids.has(nid)));
  });
  if (!missing.length || typeof window.neprasApiLookupStudentByNationalId !== "function") return remote;

  const dataByNid = new Map();
  let cursor = 0;
  async function worker() {
    while (true) {
      neprasExpensesThrowIfStopped();
      const i = cursor++;
      if (i >= missing.length) return;
      const row = missing[i];
      const nid = neprasExpensesClean(row?.nationalId);
      if (!/^\d{14}$/.test(nid)) continue;
      try {
        const data = await window.neprasApiLookupStudentByNationalId(nid);
        neprasExpensesThrowIfStopped();
        const name = neprasExpensesClean(data?.firstName);
        if (!name) continue;
        dataByNid.set(nid, {
          name, schoolName: neprasExpensesClean(data?.schoolName),
          administration: neprasExpensesClean(data?.edaraName),
          directorate: neprasExpensesClean(data?.mudName),
          status: neprasExpensesClean(data?.resultStatelName),
          grade: neprasExpensesClean(data?.acdYear),
          classNumber: neprasExpensesClean(data?.classNumber),
          studentCode: neprasExpensesClean(data?.stdStudentId)
        });
      } catch (error) {
        if (neprasExpensesStopRequested() || error?.code === "USER_STOPPED" || String(error?.message || "").includes("USER_STOPPED")) throw error;
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(6, missing.length)}, () => worker()));
  neprasExpensesThrowIfStopped();
  if (!dataByNid.size) return remote;
  return {
    ...remote,
    paidReportRows: reportRows.map(row => {
      const info = dataByNid.get(neprasExpensesClean(row?.nationalId));
      return info ? { ...row, studentName: info.name, currentSchoolName: info.schoolName, currentAdministration: info.administration, currentDirectorate: info.directorate, currentStatus: info.status, currentGrade: info.grade, currentClassNumber: info.classNumber, lookupStudentCode: info.studentCode } : row;
    })
  };
}

function neprasExpensesClassify(allStudents, remote) {
  const paidPairs = Array.isArray(remote?.paidPairs) ? remote.paidPairs : [];
  const paidReportRows = Array.isArray(remote?.paidReportRows) ? remote.paidReportRows : [];
  const exemptions = Array.isArray(remote?.exemptions) ? remote.exemptions : [];

  const allCodes = new Set(allStudents.map(s => s.code));
  const studentsByNationalId = new Map(
    allStudents
      .filter(s => s.nationalId)
      .map(s => [s.nationalId, s])
  );

  const paidMap = new Map();
  let paidMatchedByNationalId = 0;

  for (const p of paidPairs) {
    const code = neprasExpensesClean(p?.studentCode);
    const nationalId = neprasExpensesClean(p?.nationalId);

    if (code && allCodes.has(code)) {
      paidMap.set(code, { studentCode: code, nationalId });
      continue;
    }

    const byNid = nationalId ? studentsByNationalId.get(nationalId) : null;
    if (byNid?.code) {
      paidMap.set(byNid.code, {
        studentCode: byNid.code,
        nationalId
      });
      paidMatchedByNationalId++;
    }
  }

  const exemptMap = new Map();
  for (const e of exemptions) {
    const code = neprasExpensesClean(e?.studentCode);
    const nationalId = neprasExpensesClean(e?.nationalId);

    if (code && allCodes.has(code)) {
      exemptMap.set(code, e);
      continue;
    }

    const byNid = nationalId ? studentsByNationalId.get(nationalId) : null;
    if (byNid?.code) {
      exemptMap.set(byNid.code, e);
    }
  }

  const rows = allStudents.map(s => {
    const paid = paidMap.has(s.code);
    const exc = exemptMap.get(s.code) || null;
    const excName = neprasExpensesClean(exc?.excName);
    const rule = neprasExpensesRule(excName);

    let financeStatus = "مطلوب السداد";

    // طلاب المنازل لا يتم تسجيل سدادهم إلكترونيًا في تقرير البنك؛
    // لذلك لا يدخلون مطلقًا ضمن «غير المسددين» أو «مطلوب السداد».
    if (s.isHome) {
      financeStatus = "منازل — السداد بالمدرسة";
    } else if (paid) {
      financeStatus = "مسدد";
    } else if (rule.kind === "full") {
      financeStatus = "معفى وفق القرار";
    } else if (rule.kind === "partial") {
      financeStatus = "مطلوب السداد بالقيمة المخفضة";
    } else if (rule.kind === "review") {
      financeStatus = "يحتاج مراجعة";
    }

    return {
      ...s,
      paid,
      exemptionType: excName || "—",
      exemptionClass: rule.kind,
      exemptionPercent: rule.percent,
      exemptionLabel: rule.label,
      financeStatus
    };
  });

  const currentCodes = new Set(rows.map(r => r.code).filter(Boolean));
  const currentNids = new Set(rows.map(r => r.nationalId).filter(Boolean));

  const unmatchedPaidReportRows = paidReportRows
    .filter(p => {
      const code = neprasExpensesClean(p?.studentCode);
      const nid = neprasExpensesClean(p?.nationalId);
      return !((code && currentCodes.has(code)) || (nid && currentNids.has(nid)));
    })
    .map(p => {
      const realName =
        neprasExpensesClean(
          p?.studentName
        );

      return {
      code: neprasExpensesClean(p?.studentCode),
      nationalId: neprasExpensesClean(p?.nationalId),
      name:
        realName
          ? `${realName} — مسدد بالتقرير — غير موجود حاليًا بالمدرسة`
          : "مسدد بالتقرير — غير موجود حاليًا بالمدرسة",
      grade:
        neprasExpensesClean(p?.grade) ||
        "—",
      className: "—",
      gender: "—",
      studyType: "—",
      studyTypeId: 0,
      isHome: false,
      status: "غير موجود بالقائمة الحالية",
      paid: true,
      exemptionType: "—",
      exemptionClass: "none",
      exemptionPercent: 0,
      exemptionLabel: "—",
      financeStatus:
        "مسدد بالتقرير — غير موجود حاليًا بالمدرسة",
      currentSchoolName: neprasExpensesClean(p?.currentSchoolName),
      currentAdministration: neprasExpensesClean(p?.currentAdministration),
      currentDirectorate: neprasExpensesClean(p?.currentDirectorate),
      currentStatus: neprasExpensesClean(p?.currentStatus),
      currentGrade: neprasExpensesClean(p?.currentGrade),
      __paidReportOnly: true
      };
    });

  const paidReportDetailedRows = [
    ...rows.filter(r => r.paid),
    ...unmatchedPaidReportRows
  ];

  const groups = {
    all: rows,
    paidReport: paidReportDetailedRows,
    homes: rows.filter(r => r.isHome),
    regular: rows.filter(r => !r.isHome),
    paid: rows.filter(r => !r.isHome && r.paid),
    // «غير المسددين» = طلاب غير منازل وغير موجودين في تقرير السداد.
    unpaid: rows.filter(r => !r.isHome && !r.paid),
    // كروت الإعفاء تعرض جميع الطلاب المسجل لهم الإعفاء سواء سددوا أم لا.
    allExemptions: rows.filter(r => r.exemptionClass !== "none"),
    fullExempt: rows.filter(r => r.exemptionClass === "full"),
    partialExempt: rows.filter(r => r.exemptionClass === "partial"),
    // المطلوب فعليًا: غير منازل + غير مسدد + لا إعفاء كامل.
    // أصحاب تخفيض 50% يظلون مستحقين للقيمة المخفضة.
    due: rows.filter(
      r =>
        !r.isHome &&
        !r.paid &&
        (r.exemptionClass === "none" || r.exemptionClass === "partial")
    ),
    review: rows.filter(
      r =>
        !r.isHome &&
        !r.paid &&
        r.exemptionClass === "review"
    )
  };

  return {
    rows,
    groups,
    paidReportRows: groups.paidReport,
    diagnostics: {
      paidReportEntries:
        Number(remote?.paidReportCount || remote?.paidRawCount || paidPairs.length) || 0,
      paidMatched: paidMap.size,
      paidMatchedByNationalId,
      paidUnmatched: Math.max(
        0,
        (Number(remote?.paidReportCount || remote?.paidRawCount || paidPairs.length) || 0) - paidMap.size
      ),
      exemptionEntries: exemptions.length,
      exemptionMatched: exemptMap.size
    }
  };
}

async function neprasAnalyzeExpensesAndExemptions(stageKey = "") {
  try { window.neprasResetGlobalStop?.(); } catch (_) { try { window.__NEPRAS_STOP_ALL_REQUESTED__ = false; } catch (_) {} }
  neprasExpensesThrowIfStopped();

  await neprasExpensesEnsureCurrentSession(stageKey);
  neprasExpensesThrowIfStopped();

  const students = await neprasExpensesCollectAllStudents();
  neprasExpensesThrowIfStopped();

  // v1.0: أكمل حقول المدرسة/الإدارة/المديرية والصف/القيد
  // للطلاب الحاليين قبل دمجهم مع تقرير السداد.
  await neprasExpensesEnrichCurrentSchoolContext(students);
  neprasExpensesThrowIfStopped();

  if (typeof showFloatingStatus === "function") {
    showFloatingStatus("💰 تنزيل تقرير السداد والإعفاءات من موقع الوزارة...");
  }

  neprasExpensesThrowIfStopped();

  const remote = await chrome.runtime.sendMessage({
    action: "NEPRAS_EXPENSES_REMOTE_DATA",
    students: students.map(s => ({
      studentCode: s.code,
      nationalId: s.nationalId
    }))
  });

  neprasExpensesThrowIfStopped();

  if (!remote?.ok) {
    throw new Error(remote?.message || "تعذر تنزيل بيانات المصروفات والإعفاءات.");
  }

  if (typeof showFloatingStatus === "function") {
    showFloatingStatus(
      "💰 استكمال أسماء المسددين غير الموجودين بالقائمة الحالية..."
    );
  }

  const enrichedRemote =
    await neprasExpensesEnrichPaidReportRows(
      students,
      remote
    );

  neprasExpensesThrowIfStopped();

  const classified =
    neprasExpensesClassify(
      students,
      enrichedRemote
    );
  const groups = classified.groups;

  // Accuracy guard: never approve a financial analysis when the PDF itself indicates
  // more paid records than we were able to classify. A wrong success result is worse
  // than asking the user to retry/send the report for diagnosis.
  const expectedPaidReport = Number(classified?.diagnostics?.paidReportEntries || 0);
  const classifiedPaidReport = Number(groups?.paidReport?.length || 0);
  if (expectedPaidReport > classifiedPaidReport) {
    const missing = expectedPaidReport - classifiedPaidReport;
    throw new Error(
      `لم يكتمل التحقق من تقرير السداد (${missing} سجل). أعد التحليل، وإذا تكرر الأمر أرسل ملف تقرير السداد لفحصه.`
    );
  }

  const result = {
    version: 1,
    stage: stageKey || "",
    generatedAt: new Date().toISOString(),
    total: students.length,
    regular: groups.regular.length,
    homes: groups.homes.length,
    paid: groups.paid.length,
    paidReport:
      Math.max(
        groups.paidReport.length,
        Number(classified?.diagnostics?.paidReportEntries || 0)
      ),
    paidReportMatched:
      groups.paid.length,
    unpaid: groups.unpaid.length,
    allExemptions: groups.allExemptions.length,
    fullExempt: groups.fullExempt.length,
    partialExempt: groups.partialExempt.length,
    due: groups.due.length,
    review: groups.review.length,
    rows: classified.rows,
    paidReportRows: Array.isArray(classified.paidReportRows) ? classified.paidReportRows : [],
    diagnostics: classified.diagnostics
  };

  neprasExpensesThrowIfStopped();

  await chrome.storage.local.set({
    [NEPRAS_EXPENSES_STORAGE_KEY]: result,
    neprasExpensesLastError: ""
  });

  try { hideFloatingStatus?.(400); } catch (_) {}
  return result;
}

function neprasExpensesRowsByCategory(result, category) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];

  if (category === "homes") return rows.filter(r => r.isHome);

  if (category === "paid") {
    if (Array.isArray(result?.paidReportRows) && result.paidReportRows.length) {
      return [...result.paidReportRows];
    }
    return rows.filter(r => !r.isHome && r.paid);
  }

  if (category === "reportOnly") return (Array.isArray(result?.paidReportRows) ? result.paidReportRows : []).filter(r => r.__paidReportOnly);
  if (category === "paidCurrent") return rows.filter(r => !r.isHome && r.paid);
  if (category === "unpaid") return rows.filter(r => !r.isHome && !r.paid);
  if (category === "allExemptions") return rows.filter(r => r.exemptionClass !== "none");
  if (category === "fullExempt") return rows.filter(r => r.exemptionClass === "full");
  if (category === "partialExempt") return rows.filter(r => r.exemptionClass === "partial");
  if (category === "due") return rows.filter(r => !r.isHome && !r.paid && (r.exemptionClass === "none" || r.exemptionClass === "partial"));
  if (category === "review") return rows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "review");
  return rows;
}

function neprasExpensesCategoryTitle(category) {
  const map = {
    all: "كل الطلاب",
    homes: "طلاب المنازل",
    paid: "الطلاب المسددون",
    reportOnly: "مسددون بالتقرير وغير موجودين حاليًا",
    unpaid: "غير المسددين إجمالًا",
    allExemptions: "كل الإعفاءات",
    fullExempt: "المعفون وفق القرار",
    partialExempt: "أصحاب التخفيض 50%",
    due: "المطلوب منهم السداد",
    review: "حالات تحتاج مراجعة"
  };
  return map[category] || "بيانات المصروفات";
}

function neprasExpensesExcelRows(rows) {
  return rows.map((r, i) => {
    const cleanStudentName = String(r?.name || "")
      .replace(/\s*[—-]\s*مسدد بالتقرير\s*[—-]\s*غير موجود حاليًا بالمدرسة\s*$/i, "")
      .trim();

    return [
      i + 1,
      cleanStudentName || r?.name || "—",
      r.financeStatus || "—",
      r.code || "—",
      r.nationalId || "—",
      r.currentSchoolName || "—",
      r.currentAdministration || "—",
      r.currentDirectorate || "—",
      r.currentGrade || "—",
      r.currentStatus || "—",
      r.grade || "—",
      r.className || "—",
      r.gender || "—",
      r.studyType || "—",
      r.isHome ? "نعم" : "لا",
      r.paid ? "نعم" : "لا",
      r.exemptionType || "—",
      r.exemptionPercent == null ? "—" : `${r.exemptionPercent}%`
    ];
  });
}

function neprasExpensesExcelHeaders() {
  return [
    "م",
    "اسم التلميذ",
    "الحالة المالية",
    "كود التلميذ",
    "الرقم القومي",
    "المدرسة الحالية",
    "الإدارة الحالية",
    "المديرية الحالية",
    "الصف الحالي",
    "حالة القيد الحالية",
    "الصف ببيانات المدرسة",
    "الفصل",
    "النوع",
    "نوع التعليم",
    "منازل",
    "مسدد",
    "نوع الإعفاء",
    "نسبة الإعفاء"
  ];
}


function neprasExpensesIsBoy(r) {
  if (typeof window?.NeprasEgypt?.isMale === "function") {
    const m = window.NeprasEgypt.isMale(r);
    if (typeof m === "boolean") return m;
  }
  const g = String(r?.gender || r?.["النوع"] || "").trim();
  if (g.includes("بنين") || g.includes("ذكر")) return true;
  const nid = String(r?.nationalId || r?.["الرقم القومي"] || "").replace(/\D/g, "");
  if (nid.length === 14) return Number(nid[12]) % 2 === 1;
  return false;
}

function neprasExpensesIsGirl(r) {
  if (typeof window?.NeprasEgypt?.isMale === "function") {
    const m = window.NeprasEgypt.isMale(r);
    if (typeof m === "boolean") return !m;
  }
  const g = String(r?.gender || r?.["النوع"] || "").trim();
  if (g.includes("بنات") || g.includes("انثى") || g.includes("أنثى")) return true;
  const nid = String(r?.nationalId || r?.["الرقم القومي"] || "").replace(/\D/g, "");
  if (nid.length === 14) return Number(nid[12]) % 2 === 0;
  return false;
}

function neprasBuildExpensesAnalysisSheets(result, tariffs = {}) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const tFull = Number(tariffs.tFull) || 395;
  const tPartial = Number(tariffs.tPartial) || 259.91;
  const tExempt = Number(tariffs.tExempt) || 39.22;

  const total = rows.length;
  const boys = rows.filter(neprasExpensesIsBoy).length;
  const girls = rows.filter(neprasExpensesIsGirl).length;
  const homes = rows.filter(r => r.isHome).length;

  const totPaidFull = rows.filter(r => !r.isHome && r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
  const totPaidPartial = rows.filter(r => !r.isHome && r.paid && r.exemptionClass === "partial").length;
  const totPaidExempt = rows.filter(r => !r.isHome && r.paid && r.exemptionClass === "full").length;
  const totPaidTotal = totPaidFull + totPaidPartial + totPaidExempt;

  const totUnpaidFull = rows.filter(r => !r.isHome && !r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
  const totUnpaidPartial = rows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "partial").length;
  const totUnpaidExempt = rows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "full").length;
  const totUnpaidTotal = totUnpaidFull + totUnpaidPartial + totUnpaidExempt;

  const overallRate = total > 0 ? ((totPaidTotal / total) * 100).toFixed(1) + "%" : "0.0%";

  // 1. Table: تحليل الصفوف الدراسية
  const gradesHeaders = [
    "الصف", "القيد", "المسددون (سداد كامل)", "المسددون (أبناء عاملين)", "المسددون (إعفاء)", "إجمالي المسددين",
    "غير المسددين (سداد كامل)", "غير المسددين (أبناء عاملين)", "غير المسددين (إعفاء)", "إجمالي غير المسددين",
    "منازل", "نسبة السداد"
  ];

  const gradesSet = new Set();
  rows.forEach(r => {
    const g = String(r.grade || "").trim();
    if (g) gradesSet.add(g);
  });

  const getRank = (name) => {
    const s = String(name || "").trim();
    if (s.includes("الاول") || s.includes("الأول") || s.includes("1")) return 1;
    if (s.includes("الثاني") || s.includes("2")) return 2;
    if (s.includes("الثالث") || s.includes("3")) return 3;
    if (s.includes("الرابع") || s.includes("4")) return 4;
    if (s.includes("الخامس") || s.includes("5")) return 5;
    if (s.includes("السادس") || s.includes("6")) return 6;
    return 99;
  };

  const gradesList = Array.from(gradesSet).sort((a, b) => {
    const rA = getRank(a);
    const rB = getRank(b);
    if (rA !== rB) return rA - rB;
    return a.localeCompare(b, "ar");
  });

  const gradesRows = gradesList.map(gradeName => {
    const gRows = rows.filter(r => String(r.grade || "").trim() === gradeName);
    const gCount = gRows.length;
    const gHomes = gRows.filter(r => r.isHome).length;

    const gPaidFull = gRows.filter(r => !r.isHome && r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
    const gPaidPartial = gRows.filter(r => !r.isHome && r.paid && r.exemptionClass === "partial").length;
    const gPaidExempt = gRows.filter(r => !r.isHome && r.paid && r.exemptionClass === "full").length;
    const gPaidTotal = gPaidFull + gPaidPartial + gPaidExempt;

    const gUnpaidFull = gRows.filter(r => !r.isHome && !r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
    const gUnpaidPartial = gRows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "partial").length;
    const gUnpaidExempt = gRows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "full").length;
    const gUnpaidTotal = gUnpaidFull + gUnpaidPartial + gUnpaidExempt;

    const gPct = gCount > 0 ? ((gPaidTotal / gCount) * 100).toFixed(1) + "%" : "0.0%";

    return [
      gradeName, gCount, gPaidFull, gPaidPartial, gPaidExempt, gPaidTotal,
      gUnpaidFull, gUnpaidPartial, gUnpaidExempt, gUnpaidTotal,
      gHomes, gPct
    ];
  });

  // Total footer row
  gradesRows.push([
    "الإجمالي", total, totPaidFull, totPaidPartial, totPaidExempt, totPaidTotal,
    totUnpaidFull, totUnpaidPartial, totUnpaidExempt, totUnpaidTotal,
    homes, overallRate
  ]);

  // 2. Table: الملخص المالي
  const finHeaders = [
    "البيان", "القيد", "بنين", "بنات", "سداد كامل", "أبناء عاملين (50%)", "إعفاءات حسب القرار", "إجمالي المسددين", "غير مسددين", "نسبة السداد"
  ];

  const mFull = totPaidFull * tFull;
  const mPartial = totPaidPartial * tPartial;
  const mExempt = totPaidExempt * tExempt;
  const mTotal = mFull + mPartial + mExempt;

  const finRows = [
    ["العدد", total, boys, girls, totPaidFull, totPaidPartial, totPaidExempt, totPaidTotal, totUnpaidTotal, overallRate],
    ["المبلغ (ج)", "—", "—", "—", Number(mFull.toFixed(2)), Number(mPartial.toFixed(2)), Number(mExempt.toFixed(2)), Number(mTotal.toFixed(2)), "—", "—"],
    ["التعريفة المطبقة (ج)", "—", "—", "—", tFull, tPartial, tExempt, "—", "—", "—"]
  ];

  return [
    {
      name: "تحليل الصفوف الدراسية",
      headers: gradesHeaders,
      rows: gradesRows,
      title: "تحليل الصفوف الدراسية — المسدد وغير المسدد حسب الفئة",
      recordCount: total,
      countLabel: "إجمالي القيد"
    },
    {
      name: "الملخص المالي",
      headers: finHeaders,
      rows: finRows,
      title: "الملخص المالي ومبالغ السداد المحصلة",
      recordCount: totPaidTotal,
      countLabel: "إجمالي المسددين"
    }
  ];
}

function neprasExportExpensesAnalysisReportExcel(result, tariffs = {}) {
  if (!result?.rows?.length) {
    throw new Error("لا توجد بيانات مصروفات محفوظة للتصدير.");
  }
  if (typeof window.neprasStudentBuildMultiSheetXlsx !== "function") {
    throw new Error("محرك Excel متعدد الصفحات غير جاهز.");
  }

  const sheets = neprasBuildExpensesAnalysisSheets(result, tariffs);
  const wb = {
    __neprasStudentXlsxBytes: window.neprasStudentBuildMultiSheetXlsx(sheets)
  };

  downloadWorkbook(wb, "جدول_تحليل_المصروفات_والملخص_المالي", "تحليل المصروفات والملخص المالي");
}

function neprasExportExpensesExcel(result) {
  if (!result?.rows?.length) {
    throw new Error("لا توجد بيانات مصروفات محفوظة للتصدير.");
  }

  if (typeof window.neprasStudentBuildMultiSheetXlsx !== "function") {
    throw new Error("محرك Excel متعدد الصفحات غير جاهز.");
  }

  const headers = neprasExpensesExcelHeaders();

  // 1. Add Analysis Sheets (Grades breakdown & Financial summary)
  const analysisSheets = neprasBuildExpensesAnalysisSheets(result);

  const categories = [
    "all", "homes", "paid", "reportOnly", "unpaid", "allExemptions", "fullExempt", "partialExempt", "due", "review"
  ];

  const sheets = [...analysisSheets];

  for (const category of categories) {
    const rows = neprasExpensesRowsByCategory(result, category);
    sheets.push({
      name: neprasExpensesCategoryTitle(category),
      headers,
      rows: neprasExpensesExcelRows(rows),
      title: neprasExpensesCategoryTitle(category),
      recordCount: category === "paid" ? Number(result.paidReport || rows.length) : rows.length,
      countLabel: "عدد الطلاب"
    });
  }

  const wb = {
    __neprasStudentXlsxBytes: window.neprasStudentBuildMultiSheetXlsx(sheets)
  };

  downloadWorkbook(wb, "تحليل_المصروفات_والإعفاءات_الشامل", "المصروفات والإعفاءات");
}

function neprasExportExpensesCategoryExcel(result, category) {
  if (!result) throw new Error("لا توجد بيانات مصروفات محفوظة.");
  if (typeof window.neprasStudentBuildMultiSheetXlsx !== "function") {
    throw new Error("محرك Excel غير جاهز.");
  }

  const rows = neprasExpensesRowsByCategory(result, category);
  const headers = neprasExpensesExcelHeaders();
  const title = neprasExpensesCategoryTitle(category);
  const wb = {
    __neprasStudentXlsxBytes: window.neprasStudentBuildMultiSheetXlsx([{
      name: title,
      headers,
      rows: neprasExpensesExcelRows(rows),
      title
    }])
  };
  downloadWorkbook(wb, title, "المصروفات والإعفاءات");
}

window.neprasAnalyzeExpensesAndExemptions = neprasAnalyzeExpensesAndExemptions;
window.neprasExpensesRowsByCategory = neprasExpensesRowsByCategory;
window.neprasExpensesCategoryTitle = neprasExpensesCategoryTitle;
window.neprasExportExpensesExcel = neprasExportExpensesExcel;
window.neprasExportExpensesAnalysisReportExcel = neprasExportExpensesAnalysisReportExcel;
window.neprasExportExpensesCategoryExcel = neprasExportExpensesCategoryExcel;
