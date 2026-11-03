/**
 * نبراس - قوائم الفصول Excel من بيانات /student/list (v1.2.25)
 *
 * الفرق عن المسار القديم (صفحة التوزيع /class/assign):
 *   - المصدر: GetSchoolStudent (نفس واجهة تصدير الطلاب) لا التنقل بين القوائم المنسدلة.
 *   - الأعمدة: م / كود التلميذ / اسم التلميذ / حالة القيد.
 *   - الترويسة: المحافظة والمديرية والإدارة والمدرسة والعام الدراسي (بدل النقاط الفارغة).
 *   - اسم الكشف: «قائمة تلاميذ فصل ( 2 - 5 إعدادي )» = ( رقم الصف - رقم الفصل مرحلة ).
 *
 * كل شيء داخل IIFE لأن كل الملفات المحقونة تشترك في عالم معزول واحد
 * (انظر PHASE_NOTES.md، هوتفيكس NEPRAS_ZIP_CRC_TABLE).
 *
 * `NeprasClassLists` (في آخر الملف) مصدر مشترك: وحدة «السجلات والكشوف» تبني قوائم العمودين على نفس التجميع
 * (الصف ثم الفصل رقميًا، والأسماء أبجديًا) ونفس ترويسة المدرسة (المحافظة والمديرية والإدارة)، وتحتفظ بالتخطيط وحده.
 *
 * تعتمد وقت التشغيل على دوال من ملفات أخرى: neprasStatsFetchStageRows (school_stats.js)، neprasStudentBuildMultiSheetXlsx
 * و downloadWorkbook (export.js)، window.neprasApiLookupStudentByNationalId (student_api.js).
 */
(() => {
  if (window.neprasExportClassListsFromStudentList) return;

  const BLANK = "................";
  const NO_CLASS = "بدون فصل";
  const DOWNLOAD_FOLDER = "قوائم الفصول";

  const STAGE_LABELS = {
    KG: "رياض أطفال",
    PRIMARY: "ابتدائي",
    PREP: "إعدادي",
    GENERAL_SECONDARY: "ثانوي",
    TECHNICAL_SECONDARY: "ثانوي فني"
  };

  // أسماء المحافظات من الجدول المشترك (modules/egypt_ids.js) دون «خارج الجمهورية» (رمز 88): مصدر واحد للأسماء.
  let governorateNames = null;
  function getGovernorateNames() {
    if (!governorateNames) {
      governorateNames = Object.entries(NeprasEgypt.GOVERNORATES).filter(([code]) => code !== "88").map(([, name]) => name);
    }
    return governorateNames;
  }

  // ---------- أدوات نصوص ----------
  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  // توحيد الهمزات والياء/الألف المقصورة والتاء المربوطة وحذف التشكيل والتطويل.
  function norm(value) {
    return clean(value)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه");
  }

  function isPlaceholderSchool(name) {
    const n = norm(name);
    return !n || n === "المدرسه";
  }

  // ---------- المحافظة / المديرية / الإدارة ----------
  // نطابق اسم المحافظة من قائمة المحافظات الـ27 المعروفة داخل نص المديرية/الإدارة،
  // ولا نخمّن من نص حر (مثل قص «ب» من أول الكلمة، فتضيع «بني سويف»).
  function detectGovernorate(...texts) {
    for (const text of texts) {
      const hay = norm(text).replace(/\s+/g, "");
      if (!hay) continue;
      let best = null;
      for (const gov of getGovernorateNames()) {
        const needle = norm(gov).replace(/\s+/g, "");
        const idx = hay.indexOf(needle);
        if (idx < 0) continue;
        if (!best || needle.length > best.len || (needle.length === best.len && idx < best.idx)) {
          best = { gov, len: needle.length, idx };
        }
      }
      if (best) return best.gov;
    }
    return "";
  }

  function formatDirectorate(raw) {
    const v = clean(raw);
    if (!v) return "";
    if (norm(v).includes("مديريه")) return v;
    return `مديرية التربية والتعليم ب${v}`;
  }

  function formatAdministration(raw) {
    const v = clean(raw);
    if (!v) return "";
    if (norm(v).includes("اداره")) return v;
    return `إدارة ${v} التعليمية`;
  }

  // ---------- التجميع والعناوين ----------
  function compareClassNo(a, b) {
    if (a === NO_CLASS && b !== NO_CLASS) return 1;
    if (b === NO_CLASS && a !== NO_CLASS) return -1;
    const na = Number(NeprasEgypt.toLatinDigits(a));
    const nb = Number(NeprasEgypt.toLatinDigits(b));
    const aNum = Number.isFinite(na) && clean(a) !== "";
    const bNum = Number.isFinite(nb) && clean(b) !== "";
    if (aNum && bNum && na !== nb) return na - nb;
    if (aNum !== bNum) return aNum ? -1 : 1;
    return norm(a).localeCompare(norm(b), "ar");
  }

  function compareNames(a, b) {
    return norm(a.name).localeCompare(norm(b.name), "ar") || String(a.code).localeCompare(String(b.code));
  }

  function isStudentMale(s) {
    if (globalThis.NeprasEgypt?.isMale) {
      return globalThis.NeprasEgypt.isMale(s);
    }
    const g = String(s?.gender || "").trim();
    if (/أنثى|انثى|بنات|بنت|مؤنث|female/i.test(g)) return false;
    if (/ذكر|بنين|ولد|مذكر|male/i.test(g)) return true;
    const nid = String(s?.national_id || s?.nationalId || s?.["الرقم القومي"] || "").trim();
    if (/^[23]\d{13}$/.test(nid)) {
      return (parseInt(nid.charAt(12), 10) % 2 !== 0);
    }
    return true;
  }

  // أسبقية نظام التعليم الإدارية المعتمدة (النظامي أولاً، يليه المنازل، يليه العمال)
  function studentStudyPriority(s) {
    const raw = String(
      s?.study_type || s?.studyType || s?.["نوعية التعليم"] || s?.["نوع التعليم"] || s?.__neprasApiRaw?.studyTypeName || ""
    );
    const n = norm(raw);
    const status = norm(String(s?.status || s?.["حالة القيد"] || ""));
    if (s?.is_worker || n.includes("عمال") || n.includes("عمل") || status.includes("عمال")) return 3;
    if (s?.is_manazel || n.includes("منازل") || n.includes("منزل") || status.includes("منازل")) return 2;
    return 1; // منتظم / نظامي
  }

  function sortStudentsList(list, sortMode = "alpha") {
    if (!sortMode || sortMode === "site") return list;
    return list.sort((a, b) => {
      // 1. أسبقية فئة التعليم أولاً: النظامي يليه المنازل يليه العمال
      const pA = studentStudyPriority(a);
      const pB = studentStudyPriority(b);
      if (pA !== pB) return pA - pB;

      // 2. نمط الترتيب المعتمد داخل كل فئة
      if (sortMode === "gender" || sortMode === "gender_boys") {
        const maleA = isStudentMale(a);
        const maleB = isStudentMale(b);
        if (maleA && !maleB) return -1;
        if (!maleA && maleB) return 1;
        return compareNames(a, b);
      }
      if (sortMode === "gender_girls") {
        const maleA = isStudentMale(a);
        const maleB = isStudentMale(b);
        if (!maleA && maleB) return -1;
        if (maleA && !maleB) return 1;
        return compareNames(a, b);
      }
      return compareNames(a, b);
    });
  }

  /**
   * قلب التجميع المشترك. items: [{ gradeIndex, gradeText, ordinal, classNo, student }]
   * الناتج مجموعات { gradeIndex, gradeText, ordinal, classNo, students }: الصفوف بترتيب gradeIndex، وفصول كل صف رقميًا
   * («بدون فصل» أخيرًا)، وطلاب كل فصل حسب نمط الترتيب المختار.
   */
  function buildGroups(items, sortMode = "alpha") {
    const byGrade = new Map();
    items.forEach(item => {
      if (!byGrade.has(item.gradeIndex)) {
        byGrade.set(item.gradeIndex, { gradeText: item.gradeText, ordinal: item.ordinal, classes: new Map() });
      }
      const grade = byGrade.get(item.gradeIndex);
      if (!grade.classes.has(item.classNo)) grade.classes.set(item.classNo, []);
      grade.classes.get(item.classNo).push(item.student);
    });

    const groups = [];
    [...byGrade.keys()].sort((a, b) => a - b).forEach(gradeIndex => {
      const grade = byGrade.get(gradeIndex);
      [...grade.classes.keys()].sort(compareClassNo).forEach(classNo => {
        groups.push({
          gradeIndex,
          gradeText: grade.gradeText,
          ordinal: grade.ordinal,
          classNo,
          students: sortStudentsList(grade.classes.get(classNo), sortMode)
        });
      });
    });
    return groups;
  }

  /**
   * يجمّع صفوف GetSchoolStudent المحوّلة (أعمدة عربية) حسب (الصف، الفصل).
   * gradeResults: [{ grade: {value,text}, ordinal, rows: [...] }]
   */
  function groupClassRows(gradeResults, sortMode = "alpha") {
    const items = [];
    (gradeResults || []).forEach((gr, gradeIndex) => {
      (gr.rows || []).forEach(row => {
        const code = clean(row?.["كود التلميذ"]);
        const name = clean(row?.["اسم التلميذ"]);
        if (!code && !name) return;
        items.push({
          gradeIndex,
          gradeText: gr.grade?.text || "",
          ordinal: gr.ordinal,
          classNo: clean(row?.["الفصل"]) || NO_CLASS,
          student: {
            code,
            name,
            gender: clean(row?.["النوع"] || ""),
            national_id: clean(row?.["الرقم القومي"] || ""),
            status: clean(row?.["حالة القيد"]),
            study_type: clean(row?.["نوعية التعليم"] || row?.["نوع التعليم"] || "")
          }
        });
      });
    });
    return buildGroups(items, sortMode);
  }

  function detectGradeOrdinal(gradeText, fallbackIdx) {
    const n = norm(gradeText);
    if (n.includes("اول") || /\b1\b/.test(n)) return 1;
    if (n.includes("ثاني") || /\b2\b/.test(n)) return 2;
    if (n.includes("ثالث") || /\b3\b/.test(n)) return 3;
    if (n.includes("رابع") || /\b4\b/.test(n)) return 4;
    if (n.includes("خامس") || /\b5\b/.test(n)) return 5;
    if (n.includes("سادس") || /\b6\b/.test(n)) return 6;
    return fallbackIdx + 1;
  }

  /**
   * نفس التجميع لسجلات الطلاب الموحّدة في «السجلات والكشوف» ({ name, code, grade, class_number, class_name, ... }).
   * يبقى كل سجل بحقوله كاملة (الديانة والحالة...). ترتيب الصفوف = ترتيب أول ظهور لها (وهو ترتيب الخطة عند الجلب من API).
   * رقم الفصل يُنزع منه لفظ «فصل»؛ والفارغ أو «عام» = «بدون فصل».
   */
  function groupStudentRecords(students, sortMode = "gender_boys") {
    const gradeOrder = new Map();
    const items = [];
    (students || []).forEach(student => {
      const gradeText = clean(student?.grade) || "الصف الدراسي";
      const gradeKey = norm(gradeText);
      if (!gradeOrder.has(gradeKey)) gradeOrder.set(gradeKey, gradeOrder.size);
      const gIdx = gradeOrder.get(gradeKey);
      const rawClass = clean(String(student?.class_number || student?.class_name || "").replace(/^\s*فصل\s*/, ""));
      items.push({
        gradeIndex: gIdx,
        gradeText,
        ordinal: detectGradeOrdinal(gradeText, gIdx),
        classNo: !rawClass || rawClass === "عام" || rawClass === "بدون فصل" ? NO_CLASS : rawClass,
        student
      });
    });
    return buildGroups(items, sortMode);
  }

  function classLabel(group, stageLabel) {
    const stage = stageLabel ? ` ${stageLabel}` : "";
    if (group.classNo === NO_CLASS) {
      return `${group.gradeText || `الصف ${group.ordinal}`} ( ${NO_CLASS} )`;
    }
    return `( ${group.ordinal} - ${group.classNo}${stage} )`;
  }

  function classTitle(group, stageLabel) {
    return group.classNo === NO_CLASS
      ? `قائمة تلاميذ ${classLabel(group, stageLabel)}`
      : `قائمة تلاميذ فصل ${classLabel(group, stageLabel)}`;
  }

  function classSheetName(group, stageLabel) {
    return group.classNo === NO_CLASS
      ? `${group.gradeText || `الصف ${group.ordinal}`} - ${NO_CLASS}`
      : `فصل ${classLabel(group, stageLabel)}`;
  }

  // أسطر ترويسة المدرسة (تتركها منقّطة للكتابة اليدوية إن لم تُعرف) — مشتركة بين القوائم الأحادية وقوائم العمودين.
  function schoolInfoLines(ctx) {
    return [
      `المحافظة: ${ctx.governorate || BLANK}`,
      `المديرية: ${ctx.directorate || BLANK}`,
      `الإدارة: ${ctx.administration || BLANK}`,
      `المدرسة: ${ctx.school || BLANK}`
    ];
  }

  function buildSheetSpecs(groups, ctx, stageLabel) {
    const infoLines = schoolInfoLines(ctx);
    const countLabel = ctx.academicYear
      ? `العام الدراسي ${ctx.academicYear} — عدد التلاميذ`
      : "عدد التلاميذ";

    return groups.map(group => ({
      name: classSheetName(group, stageLabel),
      title: classTitle(group, stageLabel),
      headers: ["م", "كود التلميذ", "اسم التلميذ", "حالة القيد"],
      rows: group.students.map((s, i) => [String(i + 1), s.code, s.name, s.status]),
      recordCount: group.students.length,
      countLabel,
      infoLines,
      rightAlignCols: [2],
      printFit: true
    }));
  }

  // ---------- سياق المدرسة ----------
  function mostCommon(values) {
    const counts = new Map();
    values.map(clean).filter(Boolean).forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    let best = "";
    let bestCount = 0;
    counts.forEach((count, v) => { if (count > bestCount) { best = v; bestCount = count; } });
    return best;
  }

  async function collectSchoolContext(allRows, throwIfStopped) {
    let school = "";
    try {
      if (typeof getSchoolNameFromPage === "function") {
        const fromPage = clean(getSchoolNameFromPage());
        if (!isPlaceholderSchool(fromPage)) school = fromPage;
      }
    } catch (_) {}

    const academicYear = mostCommon(allRows.map(r => r?.["العام الأكاديمي"]));

    let administration = "";
    let directorate = "";

    // بعض الاستجابات تحمل الإدارة/المديرية مباشرة.
    for (const row of allRows) {
      const raw = row?.__neprasApiRaw || {};
      administration = administration || clean(raw.edaraName || raw.administrationName || raw.administration);
      directorate = directorate || clean(raw.mudName || raw.directorateName || raw.directorate);
      school = school || clean(raw.schoolName);
      if (administration && directorate) break;
    }

    // وإلا نقرأ طالبًا واحدًا (حتى 5 محاولات): كل طلاب القائمة في مدرسة/إدارة/مديرية واحدة.
    if ((!administration || !directorate || !school) &&
        typeof window.neprasApiLookupStudentByNationalId === "function") {
      const samples = allRows
        .map(r => clean(r?.["الرقم القومي"]))
        .filter(nid => /^\d{14}$/.test(nid))
        .slice(0, 5);

      let loggedKeys = false;
      for (const nid of samples) {
        throwIfStopped();
        try {
          const info = await window.neprasApiLookupStudentByNationalId(nid);
          if (!info || typeof info !== "object") continue;
          if (!loggedKeys) {
            loggedKeys = true;
            // أسماء الحقول فقط (بلا قيم) لتسهيل إضافة حقل المحافظة لو وُجد صراحةً.
            console.info("[ClassLists][DEBUG] حقول استجابة البحث القومي:", Object.keys(info).join(","));
          }
          school = school || clean(info.schoolName);
          administration = administration || clean(info.edaraName);
          directorate = directorate || clean(info.mudName);
          if (school && administration && directorate) break;
        } catch (_) { /* نجرب الرقم التالي */ }
      }
    }

    const governorate = detectGovernorate(directorate, administration);

    return {
      school,
      academicYear,
      administration: formatAdministration(administration),
      directorate: formatDirectorate(directorate),
      governorate
    };
  }

  // ---------- التنفيذ ----------
  function stopRequested() {
    return (typeof window.neprasIsGlobalStopRequested === "function" && window.neprasIsGlobalStopRequested()) ||
      window.__NEPRAS_STOP_ALL_REQUESTED__ === true;
  }

  function throwIfStopped() {
    if (stopRequested()) {
      const error = new Error("USER_STOPPED");
      error.code = "USER_STOPPED";
      throw error;
    }
  }

  function status(message) {
    try { if (typeof showFloatingStatus === "function") showFloatingStatus(message); } catch (_) {}
  }

  async function neprasExportClassListsFromStudentList(stageKey) {
    const stage = clean(stageKey);
    if (!stage) throw new Error("اختر المرحلة التعليمية أولًا.");
    if (typeof neprasStudentBuildMultiSheetXlsx !== "function" || typeof downloadWorkbook !== "function") {
      throw new Error("محرك تصدير Excel غير محمّل. حدّث الصفحة وأعد المحاولة.");
    }

    if (typeof neprasStatsFetchStageRows !== "function") {
      throw new Error("محرك بيانات الطلاب غير محمّل. حدّث الصفحة وأعد المحاولة.");
    }

    const stageLabel = STAGE_LABELS[stage] || "";

    try {
      let perGrade;
      try {
        perGrade = await neprasStatsFetchStageRows(stage, {
          onGrade: (grade, i, total) => status(`📋 قوائم الفصول: تنزيل ${grade.text} (${i + 1}/${total})...`)
        });
      } catch (error) {
        if (error?.message === "GRADE_PLAN_EMPTY") throw new Error("لم يتم التعرف على صفوف المرحلة التعليمية المختارة.");
        throw error;
      }

      const gradeResults = perGrade.map(({ grade, rows }, i) => {
        const numeric = Number(grade.value);
        return { grade, ordinal: Number.isFinite(numeric) && numeric > 0 ? numeric : i + 1, rows };
      });

      const allRows = gradeResults.flatMap(g => g.rows);
      if (!allRows.length) {
        throw new Error("لا توجد بيانات طلاب في هذه المرحلة لإنشاء قوائم الفصول.");
      }

      status("📋 قوائم الفصول: قراءة بيانات المحافظة والإدارة والمديرية...");
      const ctx = await collectSchoolContext(allRows, throwIfStopped);
      throwIfStopped();

      const groups = groupClassRows(gradeResults);
      const specs = buildSheetSpecs(groups, ctx, stageLabel);
      if (!specs.length) throw new Error("لم يتم العثور على فصول لإنشاء القوائم.");

      status("📋 قوائم الفصول: إنشاء ملف Excel...");
      const bytes = neprasStudentBuildMultiSheetXlsx(specs);

      const schoolPart = (ctx.school || "المدرسة").replace(/[/\\?%*:|"<>]/g, "_");
      const fileName = `قوائم_فصول_${stageLabel || "المرحلة"}_${schoolPart}`;
      await downloadWorkbook({ __neprasStudentXlsxBytes: bytes }, fileName, DOWNLOAD_FOLDER);

      return {
        ok: true,
        sheets: specs.length,
        students: specs.reduce((n, s) => n + s.recordCount, 0),
        withoutClass: groups.filter(g => g.classNo === NO_CLASS).reduce((n, g) => n + g.students.length, 0),
        context: ctx
      };
    } finally {
      try { if (typeof hideFloatingStatus === "function") hideFloatingStatus(1200); } catch (_) {}
    }
  }

  window.neprasExportClassListsFromStudentList = neprasExportClassListsFromStudentList;
  window.NeprasClassLists = Object.freeze({
    norm, detectGovernorate, formatDirectorate, formatAdministration,
    groupClassRows, groupStudentRecords, sortStudentsList, buildSheetSpecs, schoolInfoLines, collectSchoolContext,
    classLabel, classTitle, classSheetName, NO_CLASS
  });
})();
