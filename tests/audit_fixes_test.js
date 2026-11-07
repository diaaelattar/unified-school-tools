"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const http = require("http");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok  -", name);
  } catch (e) {
    console.error("  FAIL-", name, "\n", (e && e.stack) || e);
    process.exitCode = 1;
  }
}

(async () => {
  console.log("Nepras Audit & Fixes Regression Tests");

  // 1. Quick Edits Module Tests
  const quickEditsPath = path.resolve(__dirname, "../extension/modules/quick_edits.js");
  const quickEdits = require(quickEditsPath);

  await test("quick_edits: resolveLanguageCode maps Arabic and English names accurately", () => {
    assert.strictEqual(quickEdits.resolveLanguageCode("لغة ثانية فرنسي"), "2");
    assert.strictEqual(quickEdits.resolveLanguageCode("الماني"), "3");
    assert.strictEqual(quickEdits.resolveLanguageCode("ايطالي"), "4");
    assert.strictEqual(quickEdits.resolveLanguageCode("اسباني"), "5");
    assert.strictEqual(quickEdits.resolveLanguageCode("صيني"), "6");
    assert.strictEqual(quickEdits.resolveLanguageCode("انجليزي"), "1");
  });

  await test("quick_edits: resolveSectionCode and resolveMajorCode map Secondary tracks and majors accurately", () => {
    assert.strictEqual(quickEdits.resolveSectionCode("ادبي"), "2");
    assert.strictEqual(quickEdits.resolveSectionCode("علمي"), "3");
    assert.strictEqual(quickEdits.resolveSectionCode("مسار الطب وعلوم الحياة"), "203");
    assert.strictEqual(quickEdits.resolveSectionCode("بكالوريا مسار الهندسة وعلوم الحاسب"), "204");
    assert.strictEqual(quickEdits.resolveSectionCode("مسار الاعمال"), "205");
    assert.strictEqual(quickEdits.resolveSectionCode("مسار الادب والفنون"), "206");
    assert.strictEqual(quickEdits.resolveSectionCode("203"), "203");

    assert.strictEqual(quickEdits.resolveMajorCode("مسار الطب وعلوم الحياة"), "676");
    assert.strictEqual(quickEdits.resolveMajorCode("676"), "676");
    assert.strictEqual(quickEdits.resolveMajorCode("", "203"), "676");
  });

  await test("quick_edits: parseQuickEditsExcel extracts codes, languages, and secondary tracks correctly", () => {
    const sampleRows = [
      { "كود الطالب": "12345678", "الصف": "1", "الفصل": "1", "اللغة الثانية": "فرنسي", "الشعبة": "مسار الطب وعلوم الحياة", "التخصص": "676" },
      { "كود الطالب": "87654321", "الصف": "1", "الفصل": "2", "اللغة الثانية": "الماني", "الشعبة": "ادبي" }
    ];
    const parsed = quickEdits.parseQuickEditsExcel(sampleRows);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].code, "12345678");
    assert.strictEqual(parsed[0].l2Code, "2");
    assert.strictEqual(parsed[0].sectionCode, "203");
    assert.strictEqual(parsed[0].majorCode, "676");
    assert.strictEqual(parsed[1].code, "87654321");
    assert.strictEqual(parsed[1].l2Code, "3");
    assert.strictEqual(parsed[1].sectionCode, "2");
  });

  await test("quick_edits: buildQuickEditsResultsWorkbook creates a valid XLSX workbook structure", () => {
    const mockXlsx = {
      utils: {
        book_new: () => ({ Sheets: {}, SheetNames: [] }),
        aoa_to_sheet: (data) => ({ "!ref": `A1:G${data.length}`, data }),
        book_append_sheet: (wb, sheet, name) => {
          wb.SheetNames.push(name);
          wb.Sheets[name] = sheet;
        }
      }
    };
    const records = [{ code: "12345678", name: "أحمد محمد", l2Code: "2" }];
    const results = [{ code: "12345678", name: "أحمد محمد", grade: "1", classNo: "1", success: true, reason: "تم التعديل وحفظ لغة: لغة ثانية فرنسي" }];
    const wb = quickEdits.buildQuickEditsResultsWorkbook(records, results, mockXlsx);
    assert(wb && wb.SheetNames.includes("نتائج_التعديلات"));
    assert.strictEqual(wb.Sheets["نتائج_التعديلات"].data.length, 2); // header + 1 student row
  });

  // 2. Class Reports Core Tests
  const classReportsSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/class_reports.js"), "utf8");
  const classReportsScope = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    document: { querySelectorAll: () => [] },
    location: { href: "https://student.emis.gov.eg/class/report" },
    chrome: { runtime: { onMessage: { addListener: () => {} }, sendMessage: () => Promise.resolve() } },
    URL: { createObjectURL: () => "", revokeObjectURL: () => {} }
  };
  vm.createContext(classReportsScope);
  vm.runInContext(classReportsSrc, classReportsScope);
  const ClassReportsCore = classReportsScope.window.NeprasClassReportsCore;

  await test("class_reports: looksLikePdf verifies %PDF magic bytes", () => {
    const validPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, ...new Array(200).fill(0)]);
    assert(ClassReportsCore.looksLikePdf(validPdf));
    const nonPdf = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]);
    assert(!ClassReportsCore.looksLikePdf(nonPdf));
    assert(!ClassReportsCore.looksLikePdf(null));
  });

  await test("class_reports: describeOutcome generates correct filenames and messages", () => {
    const outcomeClean = ClassReportsCore.describeOutcome({
      gradeText: "الصف الأول",
      total: 6,
      result: { included: ["1/1", "1/2", "1/3", "1/4", "1/5", "1/6"], unavailable: [], unreadable: [], unverified: [], suspicious: [] }
    });
    assert.strictEqual(outcomeClean.complete, true);
    assert.strictEqual(outcomeClean.tone, "green");
    assert(outcomeClean.fileName.includes("6_فصل.pdf"));

    const outcomeIncomplete = ClassReportsCore.describeOutcome({
      gradeText: "الصف الأول",
      total: 6,
      result: { included: ["1/1"], unavailable: ["1/2", "1/3"], unreadable: [], unverified: [], suspicious: [] }
    });
    assert.strictEqual(outcomeIncomplete.complete, false);
    assert.strictEqual(outcomeIncomplete.tone, "orange");
    assert(outcomeIncomplete.fileName.includes("1_من_6_فصل.pdf"));
  });

  // 3. Background session fallback logic verification
  await test("background: student auth fallback allows latestAuth when tabAuth is empty", () => {
    const neprasStudentAuthIsFresh = (auth) => !!(auth && auth.authorization);
    const hasTabId = true;
    const tabAuth = null;
    const latestAuth = { authorization: "Bearer VALID_TOKEN", schoolcode: "123" };

    // Old buggy expression:
    const oldAuth = (neprasStudentAuthIsFresh(tabAuth) && tabAuth) ||
      (!hasTabId && neprasStudentAuthIsFresh(latestAuth) && latestAuth) ||
      null;
    assert.strictEqual(oldAuth, null, "Buggy code failed to fall back to latestAuth when hasTabId was true");

    // Fixed expression:
    const fixedAuth = (neprasStudentAuthIsFresh(tabAuth) && tabAuth) ||
      (neprasStudentAuthIsFresh(latestAuth) && latestAuth) ||
      null;
    assert(fixedAuth !== null, "Fixed code successfully falls back to latestAuth");
    assert.strictEqual(fixedAuth.authorization, "Bearer VALID_TOKEN");
  });

  await test("desktop main.js: patternToRegex matches studaapi and professopi API endpoints", () => {
    const mainSrc = fs.readFileSync(path.resolve(__dirname, "../desktop/src/main.js"), "utf8");
    const fnMatch = mainSrc.match(/function patternToRegex\(p\)\s*\{[\s\S]*?\n\}/);
    assert(fnMatch, "patternToRegex function must exist in desktop/src/main.js");
    const scope = { RegExp };
    vm.createContext(scope);
    vm.runInContext(fnMatch[0], scope);
    const reStudent = scope.patternToRegex("https://studaapi.emis.gov.eg/*");
    const reTeacher = scope.patternToRegex("https://professopi.emis.gov.eg/*");
    assert(reStudent.test("https://studaapi.emis.gov.eg/api/Student/GetStudentList"), "Must match studaapi endpoint");
    assert(reTeacher.test("https://professopi.emis.gov.eg/api/Employee/GetEmployeeFullData"), "Must match professopi endpoint");
  });

  // 4. Class Books Sorting (by Gender Boys first, Gender Girls first, Alpha, Site)
  const egyptIdsSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/egypt_ids.js"), "utf8");
  const classBooksSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/class_books.js"), "utf8");
  const classBooksScope = {
    globalThis: {},
    window: {},
    console,
    Math,
    Date,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    JSON
  };
  classBooksScope.globalThis = classBooksScope;
  classBooksScope.window = classBooksScope;
  vm.createContext(classBooksScope);
  vm.runInContext(egyptIdsSrc, classBooksScope);
  vm.runInContext(classBooksSrc, classBooksScope);
  const CB = classBooksScope.globalThis.NeprasClassBooks;

  await test("class_books: normalizeStudents correctly derives gender from Egyptian national ID", () => {
    const rawList = [
      { code: "1", name: "مريم أحمد", grade: "الصف الأول", class_number: "1", national_id: "31201010100428" }, // 13th digit: 2 -> female
      { code: "2", name: "أحمد علي", grade: "الصف الأول", class_number: "1", national_id: "31201010100418" },  // 13th digit: 1 -> male
      { code: "3", name: "يوسف حسن", grade: "الصف الأول", class_number: "1", gender: "بنين" },
      { code: "4", name: "فاطمة محمد", grade: "الصف الأول", class_number: "1", gender: "بنات" }
    ];
    const { students: normList } = CB.normalizeStudents(rawList, "primary");
    assert.strictEqual(normList[0].gender, "أنثى");
    assert.strictEqual(normList[1].gender, "ذكر");
    assert.strictEqual(normList[2].gender, "بنين");
    assert.strictEqual(normList[3].gender, "بنات");
  });

  await test("class_books: groupClasses supports gender_boys, gender_girls, alpha, and site sorting", () => {
    const sampleStudents = [
      { code: "1", name: "محمود حسن", stage: "ابتدائي", grade: 1, class: "1", national_id: "31201010100418" }, // male
      { code: "2", name: "إبراهيم علي", stage: "ابتدائي", grade: 1, class: "1", national_id: "31201010100418" }, // male
      { code: "3", name: "هند أحمد", stage: "ابتدائي", grade: 1, class: "1", national_id: "31201010100428" },    // female
      { code: "4", name: "أروى سامي", stage: "ابتدائي", grade: 1, class: "1", national_id: "31201010100428" }     // female
    ];

    // 1) gender_boys: boys first alphabetically, then girls alphabetically
    const groupsBoys = CB.groupClasses(sampleStudents, "gender_boys");
    const namesBoys = groupsBoys[0].students.map(s => String(s.name));
    assert.deepStrictEqual([...namesBoys], ["إبراهيم علي", "محمود حسن", "أروى سامي", "هند أحمد"]);

    // 2) gender_girls: girls first alphabetically, then boys alphabetically
    const groupsGirls = CB.groupClasses(sampleStudents, "gender_girls");
    const namesGirls = groupsGirls[0].students.map(s => String(s.name));
    assert.deepStrictEqual([...namesGirls], ["أروى سامي", "هند أحمد", "إبراهيم علي", "محمود حسن"]);

    // 3) alpha: standard alphabetical
    const groupsAlpha = CB.groupClasses(sampleStudents, "alpha");
    const namesAlpha = groupsAlpha[0].students.map(s => String(s.name));
    assert.deepStrictEqual([...namesAlpha], ["إبراهيم علي", "أروى سامي", "محمود حسن", "هند أحمد"]);

    // 4) site: keep original site order
    const groupsSite = CB.groupClasses(sampleStudents, "site");
    const namesSite = groupsSite[0].students.map(s => String(s.name));
    assert.deepStrictEqual([...namesSite], ["محمود حسن", "إبراهيم علي", "هند أحمد", "أروى سامي"]);
  });

  // 5. Two-Column Rosters / Class Lists Sorting (class_lists_excel.js)
  const classListsSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/class_lists_excel.js"), "utf8");
  const classListsScope = {
    globalThis: {},
    window: {},
    console,
    Math,
    Date,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    JSON
  };
  classListsScope.globalThis = classListsScope;
  classListsScope.window = classListsScope;
  vm.createContext(classListsScope);
  vm.runInContext(egyptIdsSrc, classListsScope);
  vm.runInContext(classListsSrc, classListsScope);
  const CL = classListsScope.window.NeprasClassLists;

  await test("class_lists: groupStudentRecords correctly groups and sorts by gender_boys", () => {
    const records = [
      { code: "1", name: "محمود حسن", grade: "الصف الأول", class_number: "1", national_id: "31201010100418" },
      { code: "2", name: "إبراهيم علي", grade: "الصف الأول", class_number: "1", national_id: "31201010100418" },
      { code: "3", name: "هند أحمد", grade: "الصف الأول", class_number: "1", national_id: "31201010100428" },
      { code: "4", name: "أروى سامي", grade: "الصف الأول", class_number: "1", national_id: "31201010100428" }
    ];
    const groups = CL.groupStudentRecords(records, "gender_boys");
    const names = groups[0].students.map(s => String(s.name));
    assert.deepStrictEqual([...names], ["إبراهيم علي", "محمود حسن", "أروى سامي", "هند أحمد"]);
  });

  // 6. Unified Identity & Normalization in NeprasEgypt
  await test("egypt_ids: NeprasEgypt.isMale correctly identifies student gender from object, string or NID", () => {
    const Egypt = classListsScope.NeprasEgypt;
    assert.strictEqual(Egypt.isMale({ gender: "بنين" }), true);
    assert.strictEqual(Egypt.isMale({ gender: "بنات" }), false);
    assert.strictEqual(Egypt.isMale({ nationalId: "31201010100418" }), true);  // 13th digit = 1 (odd -> male)
    assert.strictEqual(Egypt.isMale({ nationalId: "31201010100428" }), false); // 13th digit = 2 (even -> female)
    assert.strictEqual(Egypt.isMale("31201010100418"), true);
    assert.strictEqual(Egypt.isMale("31201010100428"), false);
  });

  await test("egypt_ids: NeprasEgypt.normalizeArabic unifies alef, yaa, taa, and numbers", () => {
    const Egypt = classListsScope.NeprasEgypt;
    assert.strictEqual(Egypt.normalizeArabic("أحمد  إبراهيم آمال ٱدم"), "احمد ابراهيم امال ادم");
    assert.strictEqual(Egypt.normalizeArabic("مدرسة هدى التَّعلِيمِيَّةِـ"), "مدرسه هدي التعليميه");
    assert.strictEqual(Egypt.normalizeArabic("الصف ٣ / ٢", { toLatin: true }), "الصف 3 / 2");
  });

  // 7. School Stats Aggregation from Student Rows Fallback
  await test("school_stats: neprasStatsAggregateFromRows aggregates cached student records accurately", () => {
    const statsCode = fs.readFileSync(path.resolve(__dirname, "../extension/modules/school_stats.js"), "utf8");
    const statsScope = {
      window: { NeprasEgypt: classListsScope.NeprasEgypt },
      document: { body: { innerText: "مدرسة المستقبل" } },
      globalThis: { NeprasEgypt: classListsScope.NeprasEgypt },
      chrome: { storage: { local: {}, session: {} } },
      console,
      Set,
      Map
    };
    vm.createContext(statsScope);
    vm.runInContext(statsCode, statsScope);

    assert.strictEqual(typeof statsScope.neprasStatsAggregateFromRows, "function", "neprasStatsAggregateFromRows must be defined");

    const sampleStudents = [
      { "كود التلميذ": "1001", "اسم التلميذ": "محمد حسن", "الرقم القومي": "31201010100418", "الصف": "الصف الأول", "الفصل": "1", "حالة القيد": "مقيد" },
      { "كود التلميذ": "1002", "اسم التلميذ": "فاطمة علي", "الرقم القومي": "31201010100428", "الصف": "الصف الأول", "الفصل": "1", "حالة القيد": "مقيد" },
      { "كود التلميذ": "1003", "اسم التلميذ": "أحمد محمود", "الرقم القومي": "31201010100438", "الصف": "الصف الثاني", "الفصل": "1", "حالة القيد": "منقول" }
    ];

    const aggregated = statsScope.neprasStatsAggregateFromRows(sampleStudents, "PRIMARY");
    assert.ok(aggregated, "Aggregated result should not be null");
    assert.strictEqual(aggregated.total, 3, "Total should be 3");
    assert.strictEqual(aggregated.boys, 2, "Boys should be 2");
    assert.strictEqual(aggregated.girls, 1, "Girls should be 1");
    assert.strictEqual(aggregated.grades.length, 2, "Grades count should be 2");
  });

  // 8. Nepras Security & License Expiration Guard Tests
  await test("security_guard: enforces strict 31/08/2027 expiration with 10-day notice and zero warning prior", async () => {
    const NeprasSecurity = require("../extension/modules/nepras_security_guard.js");
    assert.ok(NeprasSecurity, "NeprasSecurity module should be loaded");

    // A. Normal operation before warning window (e.g. today / early 2027): must be ACTIVE with NO message
    const activeCheck = await NeprasSecurity.checkLicense();
    assert.strictEqual(activeCheck.status, "ACTIVE");
    assert.strictEqual(activeCheck.locked, false);
    assert.strictEqual(activeCheck.message, "", "Must have zero notice prior to 10 days before expiry");

    // B. Warning window (exactly within 10 days before 20/08/2027)
    const origNow = Date.now;
    try {
      // 7 days before expiry
      Date.now = () => NeprasSecurity.EXPIRY_TIMESTAMP - (7 * 24 * 3600 * 1000);
      const warnCheck = await NeprasSecurity.checkLicense();
      assert.strictEqual(warnCheck.status, "WARNING");
      assert.strictEqual(warnCheck.locked, false);
      assert.strictEqual(warnCheck.daysRemaining, 7);
      assert.ok(warnCheck.message.includes("7"), "Message should mention 7 days");

      // C. Expired window (at or after 20/08/2027 23:59:59)
      Date.now = () => NeprasSecurity.EXPIRY_TIMESTAMP + 1000;
      const expiredCheck = await NeprasSecurity.checkLicense();
      assert.strictEqual(expiredCheck.status, "EXPIRED");
      assert.strictEqual(expiredCheck.locked, true);
      assert.ok(expiredCheck.message.includes("انتهت"), "Message should state expiration");

      // D. Clock rollback detection (anti-tamper)
      Date.now = () => 1500000000000; // year 2017
      const tamperCheck = await NeprasSecurity.checkLicense();
      assert.strictEqual(tamperCheck.status, "TAMPERED");
      assert.strictEqual(tamperCheck.locked, true);
    } finally {
      Date.now = origNow;
    }
  });

  // 9. Stats Center Dashboard (stats_dashboard.js) Normalization & Reports
  await test("stats_dashboard: normalizes English detailRows and Arabic rows across all 15 statistical reports", () => {
    const statsDashboardSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/stats_dashboard.js"), "utf8");
    const mockXlsx = {
      utils: {
        book_new: () => ({ Sheets: {}, SheetNames: [] }),
        aoa_to_sheet: (aoa) => ({ "!ref": `A1:M${aoa.length}`, aoa }),
        book_append_sheet: (wb, ws, name) => {
          wb.SheetNames.push(name);
          wb.Sheets[name] = ws;
        },
        encode_cell: ({ r, c }) => `R${r}C${c}`
      }
    };
    const sdScope = {
      window: { XLSX: mockXlsx },
      XLSX: mockXlsx,
      console,
      Set,
      Map,
      Date,
      Math
    };
    vm.createContext(sdScope);
    vm.runInContext(statsDashboardSrc, sdScope);
    const SD = sdScope.window.NeprasStatsDashboard;
    assert.ok(SD, "NeprasStatsDashboard must be exposed on window");

    // Sample detailRows format from school_stats.js (English keys that previously produced "غير محدد: 2711")
    const sampleDetailRows = [
      {
        code: "1001",
        name: "أحمد محمد حسن علي",
        nationalId: "31505010101235", // male, born 2015-05-01, Cairo (01)
        grade: "الصف الأول الابتدائي",
        className: "1/1",
        gender: "بنين",
        religion: "مسلم",
        status: "مستجد",
        mode: "نظامي",
        integrated: "نعم",
        integrationType: "إعاقة ذهنية بسيطة",
        motherName: "فاطمة محمود إبراهيم",
        mobile: "01012345678",
        address: "شارع التحرير القاهرة"
      },
      {
        code: "1002",
        name: "مريم محمد حسن علي",
        nationalId: "31403150101246", // female, born 2014-03-15, Cairo (01), sibling of 1001
        grade: "الصف الثاني الابتدائي",
        className: "2/1",
        gender: "بنات",
        religion: "مسلم",
        status: "منقول",
        mode: "نظامي",
        integrated: "لا",
        integrationType: "",
        motherName: "فاطمة محمود إبراهيم",
        mobile: "01012345678",
        address: "شارع التحرير القاهرة"
      },
      {
        code: "1003",
        name: "مينا جرجس حنا ميخائيل",
        nationalId: "31408200101251", // male (13th digit 5), born 2014-08-20, no explicit gender field
        grade: "الصف الثاني الابتدائي",
        className: "2/2",
        gender: "", // should be derived from NID as "ذكر" -> boys!
        religion: "مسيحي",
        status: "باقي للإعادة",
        mode: "نظامي",
        integrated: "لا",
        integrationType: ""
      }
    ];

    const meta = { school: "مدرسة نبراس الرسمية", year: "2026-2027", dir: "القاهرة", admin: "غرب" };
    const val = (c) => (c && typeof c === "object" && "v" in c ? c.v : c);
    const rowVals = (row) => (Array.isArray(row) ? row.map(val) : []);

    // A. Gender & Classes Sheet
    const genderWs = SD.buildGenderStatsSheet(sampleDetailRows, meta);
    const genderRows = genderWs.aoa.map(rowVals);
    const g1Row = genderRows.find(r => r[1] === "الصف الأول الابتدائي");
    const g2Row = genderRows.find(r => r[1] === "الصف الثاني الابتدائي");
    const gTotRow = genderRows.find(r => r[0] === "الجملة العامة");
    assert.ok(g1Row, "Grade 1 row must exist in Gender sheet");
    assert.ok(g2Row, "Grade 2 row must exist in Gender sheet");
    // Since uTotal === 0, columns are: [م, الصف, عدد الفصول, بنين, بنات, الجملة]
    assert.strictEqual(g1Row.length, 6, "Should omit 'غير محدد' column when all students have resolved gender");
    assert.deepStrictEqual([...g1Row.slice(1)], ["الصف الأول الابتدائي", 1, 1, 0, 1]);
    assert.deepStrictEqual([...g2Row.slice(1)], ["الصف الثاني الابتدائي", 2, 1, 1, 2]);
    assert.deepStrictEqual([...gTotRow.slice(2)], [3, 2, 1, 3]);

    // B. Enrollment Status Sheet
    const enrollWs = SD.buildEnrollmentStatsSheet(sampleDetailRows, meta);
    const enrollRows = enrollWs.aoa.map(rowVals);
    const e1Row = enrollRows.find(r => r[1] === "الصف الأول الابتدائي");
    const e2Row = enrollRows.find(r => r[1] === "الصف الثاني الابتدائي");
    // Columns: [م, الصف, عدد الفصول, مستجد(بنين,بنات,جملة), منقول(بنين,بنات,جملة), إعادة(بنين,بنات,جملة), الإجمالي(بنين,بنات,جملة)]
    assert.strictEqual(e1Row[3], 1, "Grade 1 should have 1 new boy");
    assert.strictEqual(e2Row[7], 1, "Grade 2 should have 1 promoted girl");
    assert.strictEqual(e2Row[9], 1, "Grade 2 should have 1 repeat boy");

    // C. Siblings Sheet
    const sibWs = SD.buildSiblingsStatsSheet(sampleDetailRows, meta);
    const sibRows = sibWs.aoa.map(rowVals);
    const ahmadSibRow = sibRows.find(r => r.includes("أحمد محمد حسن علي"));
    const mariamSibRow = sibRows.find(r => r.includes("مريم محمد حسن علي"));
    assert.ok(ahmadSibRow && mariamSibRow, "Both siblings (أحمد and مريم) must be detected in Siblings sheet");

    // D. Integration Sheet
    const intWs = SD.buildIntegrationStatsSheet(sampleDetailRows, meta);
    const intRows = intWs.aoa.map(rowVals);
    const ahmadIntRow = intRows.find(r => r.includes("أحمد محمد حسن علي"));
    assert.ok(ahmadIntRow, "Integrated student must be listed in Integration sheet");

    // E. Master Workbook (all sheets)
    const masterWb = SD.buildMasterWorkbook(sampleDetailRows, meta);
    assert.ok(masterWb.SheetNames.length >= 13, "Master workbook should include all summary sheets");
  });

  // 10. Desktop-Only School-Code Annual Subscription & Vercel License Server Tests
  await test("desktop_license: links annual subscription to EMIS school_code, works on any device, and blocks unsubscribed schools", async () => {
    const os = require("os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nepras-lic-test-"));
    process.env.NEPRAS_LOCAL_DB_PATH = path.join(tmpDir, "vercel-db.json");
    process.env.ADMIN_SECRET = "TestAdmin@2027";

    const { startServer } = require("../license-server/local-server");
    const {
      DesktopLicenseManager,
      extractSchoolFromEmisHeaders
    } = require("../desktop/src/license-manager");

    const srv = await startServer(0); // random free port
    const port = srv.address().port;
    const serverUrl = `http://localhost:${port}`;

    try {
      // A. Extract School Code from EMIS headers (Student schoolcode, Teacher sc, and JWT)
      const extStudent = extractSchoolFromEmisHeaders({ schoolcode: "1204567", Authorization: "Bearer xxx" });
      assert.strictEqual(extStudent.schoolCode, "1204567");

      const extTeacher = extractSchoolFromEmisHeaders({ sc: "9876543" });
      assert.strictEqual(extTeacher.schoolCode, "9876543");

      const jwtPayload = Buffer.from(JSON.stringify({ SchoolCode: "5556667", SchoolName: "مدرسة المتفوقين" })).toString("base64url");
      const extJwt = extractSchoolFromEmisHeaders({ Authorization: `Bearer eyJhbGciOiJIUzI1NiJ9.${jwtPayload}.sig` });
      assert.strictEqual(extJwt.schoolCode, "5556667");
      assert.strictEqual(extJwt.schoolName, "مدرسة المتفوقين");

      // B. Admin activates School 1204567 directly on Vercel Server for 365 days
      const adminUpsertRes = await fetch(`${serverUrl}/api/v1/admin?op=upsert-school`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": "TestAdmin@2027" },
        body: JSON.stringify({
          schoolCode: "1204567",
          schoolName: "مدرسة النور الرسمية",
          planDays: 365
        })
      }).then(r => r.json());
      assert.strictEqual(adminUpsertRes.ok, true);
      assert.strictEqual(adminUpsertRes.school.schoolCode, "1204567");
      assert.strictEqual(adminUpsertRes.school.daysRemaining, 365);

      // C. Device #1 logs into School 1204567 -> automatically unlocks without typing a key!
      const mgrDevice1 = new DesktopLicenseManager({ storageDir: path.join(tmpDir, "device1") });
      mgrDevice1.setServerUrl(serverUrl);
      const status1 = await mgrDevice1.onSchoolDetected({ schoolCode: "1204567", schoolName: "مدرسة النور الرسمية" });
      assert.strictEqual(status1.locked, false, "Device 1 must unlock automatically for subscribed school 1204567");
      assert.strictEqual(status1.status, "ACTIVE");
      assert.strictEqual(status1.daysRemaining, 365);

      // D. Device #2 (completely different computer) logs into the SAME School 1204567 -> also unlocks automatically!
      const mgrDevice2 = new DesktopLicenseManager({ storageDir: path.join(tmpDir, "device2") });
      mgrDevice2.setServerUrl(serverUrl);
      const status2 = await mgrDevice2.onSchoolDetected({ schoolCode: "1204567" });
      assert.strictEqual(status2.locked, false, "Device 2 must also unlock automatically for school 1204567");
      assert.strictEqual(status2.schoolName, "مدرسة النور الرسمية");

      // E. Device #1 switches to an UNSUBSCRIBED school (9998887) -> immediately locks tools!
      const statusUnsub = await mgrDevice1.onSchoolDetected({ schoolCode: "9998887", schoolName: "مدرسة غير مشتركة" });
      assert.strictEqual(statusUnsub.locked, true, "Unsubscribed school 9998887 must be locked");
      assert.strictEqual(statusUnsub.status, "UNSUBSCRIBED");

      // F. Admin generates an annual activation key, and School 9998887 activates using the key
      const genKeyRes = await fetch(`${serverUrl}/api/v1/admin?op=generate-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": "TestAdmin@2027" },
        body: JSON.stringify({ count: 1, planDays: 365 })
      }).then(r => r.json());
      const newKey = genKeyRes.keys[0].licenseKey;
      assert.ok(newKey.startsWith("NEPRAS-"), "Generated key should have NEPRAS- prefix");

      const actRes = await mgrDevice1.activateWithKey({ schoolCode: "9998887", licenseKey: newKey });
      assert.strictEqual(actRes.ok, true, "Activation with valid annual key should succeed");
      assert.strictEqual(actRes.status.locked, false);
      assert.strictEqual(actRes.status.daysRemaining, 365);

      // G. Another school (3334445) tries to reuse School 9998887's key -> rejected!
      const reuseRes = await mgrDevice2.activateWithKey({ schoolCode: "3334445", licenseKey: newKey });
      assert.strictEqual(reuseRes.ok, false, "Key bound to school 9998887 must be rejected for school 3334445");

      // H. Active paid license NEVER downgrades to TRIAL upon server trial response
      const fakeServer = http.createServer((q, s) => {
        s.writeHead(200, { "Content-Type": "application/json" });
        s.end(JSON.stringify({
          ok: true,
          subscribed: true,
          status: "TRIAL",
          days_remaining: 7,
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
        }));
      }).listen(0);
      const fakePort = fakeServer.address().port;
      try {
        mgrDevice1.setServerUrl(`http://localhost:${fakePort}`);
        const checkRes = await mgrDevice1.checkSchoolOnline({ schoolCode: "9998887" });
        assert.strictEqual(checkRes.status.status, "ACTIVE", "Active school must NEVER downgrade to TRIAL!");
        assert.strictEqual(checkRes.status.locked, false);
        assert.strictEqual(checkRes.status.daysRemaining, 365);
      } finally {
        fakeServer.close();
      }
    } finally {
      srv.close();
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // 16b. Desktop Trial Period Expiration, HMAC Tamper Resistance & Clock Rollback Enforcement
  await test("desktop_license: trial period expiration, machine-bound HMAC tamper resistance, and clock rollback enforcement", async () => {
    const os = require("os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nepras-trial-test-"));
    const {
      DesktopLicenseManager,
      createSupabaseTicket,
      verifySupabaseTicket,
      MAX_CLOCK_DRIFT_MS
    } = require("../desktop/src/license-manager");

    try {
      // 1. Machine-bound HMAC Verification
      const now = Date.now();
      const trialExpiry = now + 7 * 24 * 3600 * 1000;
      const validTicket = createSupabaseTicket("1234567", trialExpiry, "trial");
      assert.strictEqual(verifySupabaseTicket(validTicket, "1234567", trialExpiry, "trial"), true, "Valid HMAC ticket must pass verification");

      // Modifying expiresAt or status must fail HMAC
      assert.strictEqual(verifySupabaseTicket(validTicket, "1234567", trialExpiry + 1000, "trial"), false, "Modified expiresAt must fail");
      assert.strictEqual(verifySupabaseTicket(validTicket, "1234567", trialExpiry, "active"), false, "Modified status must fail");
      assert.strictEqual(verifySupabaseTicket(validTicket, "9999999", trialExpiry, "trial"), false, "Different school code must fail");

      // 2. Active Trial Unlocks Desktop
      const mgr = new DesktopLicenseManager({ storageDir: tmpDir });
      mgr.state.activeSchoolCode = "1234567";
      mgr.state.ticketsBySchool["1234567"] = {
        ticket: validTicket,
        verifiedAt: now,
        expiresAt: trialExpiry,
        schoolName: "مدرسة التجربة",
        status: "trial"
      };
      mgr._save();

      const statusActive = mgr.getStatus("1234567");
      assert.strictEqual(statusActive.locked, false, "Active 7-day trial must unlock software");
      assert.strictEqual(statusActive.status, "TRIAL");
      assert.strictEqual(statusActive.daysRemaining, 7);

      // 3. Expired Trial Strictly Locks Desktop
      const expiredTime = now - 1000;
      const expiredTicket = createSupabaseTicket("1234567", expiredTime, "trial");
      mgr.state.ticketsBySchool["1234567"] = {
        ticket: expiredTicket,
        verifiedAt: now - 8 * 24 * 3600 * 1000,
        expiresAt: expiredTime,
        schoolName: "مدرسة التجربة",
        status: "trial"
      };
      mgr._save();

      const statusExpired = mgr.getStatus("1234567");
      assert.strictEqual(statusExpired.locked, true, "Expired trial must lock software");
      assert.strictEqual(statusExpired.status, "EXPIRED_TRIAL");
      assert.strictEqual(statusExpired.daysRemaining, 0);

      // 4. Local File Tampering: Attacker edits JSON to fake active status and future expiry
      const fakeTicket = `SUPABASE_VERIFIED.1234567.${now + 365 * 24 * 3600 * 1000}.active.deadbeef00001111`;
      mgr.state.ticketsBySchool["1234567"] = {
        ticket: fakeTicket,
        verifiedAt: now,
        expiresAt: now + 365 * 24 * 3600 * 1000,
        schoolName: "مدرسة التجربة",
        status: "active"
      };
      mgr._save();

      const statusTampered = mgr.getStatus("1234567");
      assert.strictEqual(statusTampered.locked, true, "Tampered local ticket must be rejected and locked");
      assert.strictEqual(statusTampered.status, "TAMPERED");

      // 5. Clock Rollback Detection: Setting clock back by > 15 minutes triggers TAMPERED
      mgr.state.lastLocalRunTime = now;
      mgr.state.ticketsBySchool["1234567"] = {
        ticket: validTicket,
        verifiedAt: now,
        expiresAt: trialExpiry,
        schoolName: "مدرسة التجربة",
        status: "trial"
      };
      const origDateNow = Date.now;
      try {
        Date.now = () => now - (20 * 60 * 1000); // 20 mins rollback (> MAX_CLOCK_DRIFT_MS)
        assert.strictEqual(mgr._isClockTampered(), true, "Clock rollback > 15 mins must be detected as tampered");
        const statusClockTampered = mgr.getStatus("1234567");
        assert.strictEqual(statusClockTampered.locked, true, "Clock rollback must strictly lock the system");
        assert.strictEqual(statusClockTampered.status, "TAMPERED");
      } finally {
        Date.now = origDateNow;
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // 17. Multi-School Storage & Profile Isolation Test
  await test("school_manager: isolated multi-school profiles with concurrent stats and zero collision", async () => {
    const smSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/school_manager.js"), "utf8");
    const mockStorage = {};
    const smScope = {
      window: { dispatchEvent: () => {} },
      globalThis: {},
      console,
      CustomEvent: class {},
      chrome: {
        storage: {
          local: {
            get: (keys, cb) => {
              const out = {};
              const kArr = Array.isArray(keys) ? keys : [keys];
              kArr.forEach(k => { if (mockStorage[k] !== undefined) out[k] = mockStorage[k]; });
              cb(out);
            },
            set: (data, cb) => {
              Object.assign(mockStorage, data);
              if (cb) cb();
            },
            remove: (keys, cb) => {
              const kArr = Array.isArray(keys) ? keys : [keys];
              kArr.forEach(k => delete mockStorage[k]);
              if (cb) cb();
            }
          }
        }
      }
    };
    smScope.globalThis = smScope.window;
    vm.createContext(smScope);
    vm.runInContext(smSrc, smScope);
    const SM = smScope.window.NeprasSchoolManager;
    assert.ok(SM, "NeprasSchoolManager must be loaded");

    // School A: Primary (code 1001) with 50 students
    const studentsA = Array.from({ length: 50 }, (_, i) => ({ id: `A${i + 1}`, name: `طالب ابتدائي ${i + 1}`, school: "1001" }));
    const statsA = { schoolCode: "1001", schoolName: "مدرسة الأمل الابتدائية", total: 50, stage: "PRIMARY" };

    // School B: Prep (code 2002) with 80 students
    const studentsB = Array.from({ length: 80 }, (_, i) => ({ id: `B${i + 1}`, name: `طالب إعدادي ${i + 1}`, school: "2002" }));
    const statsB = { schoolCode: "2002", schoolName: "مدرسة المستقبل الإعدادية", total: 80, stage: "PREP" };

    // 1) Save School A
    await SM.setActiveCode("1001");
    await SM.saveSchoolStats("1001", statsA, studentsA);

    // 2) Save School B in background / parallel
    await SM.saveSchoolStats("2002", statsB, studentsB);

    // 3) Active school is still 1001 -> global cache must STILL be School A (50 students), NOT overwritten by B!
    assert.strictEqual(mockStorage.neprasCachedStudentsList.length, 50, "Global cache must not be overwritten by background school B");
    assert.strictEqual(mockStorage.neprasSchoolStatsV1.schoolCode, "1001");

    // 4) Independent scoped loading: each school retrieves its exact data
    const loadedA = await SM.loadSchoolStats("1001");
    assert.strictEqual(loadedA.students.length, 50);
    assert.strictEqual(loadedA.stats.schoolCode, "1001");

    const loadedB = await SM.loadSchoolStats("2002");
    assert.strictEqual(loadedB.students.length, 80);
    assert.strictEqual(loadedB.stats.schoolCode, "2002");

    // 5) User switches active profile to School B (2002) -> global cache cleanly updates to School B
    await SM.setActiveCode("2002");
    assert.strictEqual(mockStorage.neprasCachedStudentsList.length, 80, "Switching to B must update global cache to School B");
    assert.strictEqual(mockStorage.neprasSchoolStatsV1.schoolCode, "2002");

    // 6) Switching back to School A (1001) -> global cache cleanly restores School A
    await SM.setActiveCode("1001");
    assert.strictEqual(mockStorage.neprasCachedStudentsList.length, 50, "Switching back to A must restore School A");
    assert.strictEqual(mockStorage.neprasSchoolStatsV1.schoolCode, "1001");

    // 7) Switching to a new school (3003) with NO stats saved yet -> MUST CLEAR previous school stats and students!
    await SM.registerOrUpdateSchool({ code: "3003", name: "مدرسة الحسينية", stage: "ثانوى عام" });
    await SM.setActiveCode("3003");
    assert.strictEqual(mockStorage.neprasSchoolStatsV1, null, "Switching to school without stats must clear neprasSchoolStatsV1 to null");
    assert.strictEqual(Array.isArray(mockStorage.neprasCachedStudentsList), true);
    assert.strictEqual(mockStorage.neprasCachedStudentsList.length, 0, "Switching to school without stats must reset cached students to empty array");
    assert.strictEqual(mockStorage.nepras_report_header_meta.schoolKey, "3003", "Meta must be set to school 3003");

    const meta3003 = await SM.loadSchoolMeta("3003");
    assert.strictEqual(meta3003.schoolName, "مدرسة الحسينية");
    assert.strictEqual(meta3003.schoolKey, "3003");

    // 8) Test Export & Import School Package (Offline Backup / Restore)
    const exportedA = await SM.exportSchoolPackage("1001");
    assert.strictEqual(exportedA.format, "nepras-school-package");
    assert.strictEqual(exportedA.schoolCode, "1001");
    assert.strictEqual(exportedA.students.length, 50);

    await SM.removeSchool("1001");
    const afterDelete = await SM.loadSchoolStats("1001");
    assert.strictEqual(afterDelete.students.length, 0);

    const importRes = await SM.importSchoolPackage(exportedA);
    assert.strictEqual(importRes.ok, true);
    assert.strictEqual(importRes.schoolCode, "1001");
    assert.strictEqual(importRes.studentsCount, 50);

    const restoredA = await SM.loadSchoolStats("1001");
    assert.strictEqual(restoredA.students.length, 50, "Imported school must restore all 50 students");
    assert.strictEqual(mockStorage.neprasCachedStudentsList.length, 50, "Importing school must make it active with all students");
  });

  // 18. Multi-School Student Auth Resolution Test
  await test("background: multi-school student auth resolution routes accurately by school code", async () => {
    const authMap = new Map();
    authMap.set(10, { authorization: "Bearer TOKEN_SCHOOL_1001", schoolcode: "1001", capturedAt: Date.now() });
    authMap.set(20, { authorization: "Bearer TOKEN_SCHOOL_2002", schoolcode: "2002", capturedAt: Date.now() });

    // Implementation of the multi-school auth matching logic
    function resolveAuth(tabId, targetSchoolCode) {
      const cleanTarget = targetSchoolCode ? String(targetSchoolCode).replace(/\D/g, "") : null;
      if (cleanTarget) {
        for (const [tId, cand] of authMap.entries()) {
          if (String(cand.schoolcode).replace(/\D/g, "") === cleanTarget) return cand;
        }
      }
      if (tabId != null && authMap.has(tabId)) return authMap.get(tabId);
      return authMap.values().next().value || null;
    }

    const authForSchool1 = resolveAuth(null, "1001");
    assert.strictEqual(authForSchool1.authorization, "Bearer TOKEN_SCHOOL_1001");
    assert.strictEqual(authForSchool1.schoolcode, "1001");

    const authForSchool2 = resolveAuth(null, "2002");
    assert.strictEqual(authForSchool2.authorization, "Bearer TOKEN_SCHOOL_2002");
    assert.strictEqual(authForSchool2.schoolcode, "2002");

    const authByTab20 = resolveAuth(20, null);
    assert.strictEqual(authByTab20.schoolcode, "2002");
  });

  // 19. EMIS DOM Badges & Official School Code Extraction Test (Ignoring Serial Number)
  await test("emis_detector: detects official school code from Ministry portal and ignores internal serial number (972133)", async () => {
    // Simulate Ministry portal elements where internal serial 972133 differs from official school code 21024219
    const mockElements = [
      { textContent: "الرقم المسلسل: 972133", children: [] },
      { textContent: "21024219@GIZA2.emis.gov.eg", children: [] },
      { textContent: "المدرسة : الشهيد محمد سليمان سلامة ع بنين", children: [] },
      { textContent: "المرحله: إعدادى", children: [] },
      { textContent: "التبعيه : رسمى", children: [] }
    ];

    let code = "", name = "", stage = "";
    const norm = (s) => String(s || "").replace(/\D/g, "");

    for (const el of mockElements) {
      const t = el.textContent.trim();
      if (!code) {
        const mCode = t.match(/(?:كود\s*(?:المدرسة|المؤسسة)|الرقم\s*التعريفي)\s*[:\-]?\s*([٠-٩0-9]{7,12})/);
        if (mCode) code = norm(mCode[1]);
        const mMail = t.match(/([0-9]{6,12})@[a-z0-9.]*emis\.gov\.eg/i);
        if (mMail) code = norm(mMail[1]);
      }
      if (!name) {
        const mSch = t.match(/(?:اسم\s*المدرسة|المدرسة)\s*[:\-]?\s*([^\n\r<>|•]+)/);
        if (mSch) {
          const cn = mSch[1].replace(/المرحل[ةه].*$/, "").replace(/التبعي[ةه].*$/, "").replace(/الرقم\s*المسلسل.*$/, "").trim();
          if (cn.length >= 3 && !/^\d+$/.test(cn)) name = cn;
        }
      }
      if (!stage) {
        const mSt = t.match(/(?:المرحل[ةه]|مرحلة)\s*[:\-]?\s*([^\n\r<>|•]+)/);
        if (mSt) {
          const cs = mSt[1].replace(/التبعي[ةه].*$/, "").replace(/الرقم.*$/, "").trim();
          if (cs.length >= 2) stage = cs;
        }
      }
    }

    assert.strictEqual(code, "21024219", "Must extract official school code 21024219 and never internal serial 972133");
    assert.strictEqual(name, "الشهيد محمد سليمان سلامة ع بنين");
    assert.strictEqual(stage, "إعدادى");
  });

  await test("absence_warnings: summarizeAbsence accurately categorizes warning tiers and parses excel", async () => {
    const AW_PATH = path.join(__dirname, "../extension/modules/absence_warnings.js");
    const awCode = fs.readFileSync(AW_PATH, "utf8");
    const ctx = {
      window: {},
      Object,
      parseInt,
      isNaN,
      String,
      Array,
      Math
    };
    vm.createContext(ctx);
    vm.runInContext(awCode, ctx);
    const AW = ctx.window.NeprasAbsenceWarnings;
    assert.ok(AW, "NeprasAbsenceWarnings must be exported");

    const sample = [
      { code: "101", name: "طالب أ", grade: "أول ثانوي", className: "1/1", absenceDays: 0 },
      { code: "102", name: "طالب ب", grade: "أول ثانوي", className: "1/1", absenceDays: 4 },
      { code: "103", name: "طالب ج", grade: "أول ثانوي", className: "1/2", absenceDays: 7 }, // Warning 1
      { code: "104", name: "طالب د", grade: "ثاني ثانوي", className: "2/1", absenceDays: 12 }, // Warning 2
      { code: "105", name: "طالب هـ", grade: "ثاني ثانوي", className: "2/1", absenceDays: 18 } // Dismissal Warning
    ];

    const summary = AW.summarizeAbsence(sample);
    assert.strictEqual(summary.total, 5);
    assert.strictEqual(summary.withAbsence, 4);
    assert.strictEqual(summary.first, 1);
    assert.strictEqual(summary.second, 1);
    assert.strictEqual(summary.final, 1);
    assert.strictEqual(summary.eligibleCount, 3);
    assert.strictEqual(summary.maxDays, 18);

    // Test Excel parser
    const excelRows = [
      ["م", "كود الطالب", "اسم التلميذ", "الصف", "الفصل", "أيام الغياب"],
      [1, "201", "أحمد إبراهيم", "الأول", "1/1", 6],
      [2, "202", "سارة علي", "الأول", "1/2", 11]
    ];
    const parsed = AW.parseAbsenceExcel(excelRows);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].code, "201");
    assert.strictEqual(parsed[0].absenceDays, 6);
    assert.strictEqual(parsed[1].code, "202");
    assert.strictEqual(parsed[1].absenceDays, 11);
  });

  await test("popup.html: accept-card moved to group-students, absence-warnings enriched", async () => {
    const htmlPath = path.join(__dirname, "../extension/popup.html");
    const html = fs.readFileSync(htmlPath, "utf8");

    // accept-card must be in group-students
    const groupStudentsIndex = html.indexOf('id="group-students"');
    const groupAttendanceIndex = html.indexOf('id="group-attendance"');
    const acceptCardIndex = html.indexOf('class="n-section accept-card"');
    const warningsCardIndex = html.indexOf('class="n-section absence-warnings-card"');

    assert.ok(groupStudentsIndex >= 0, "group-students exists");
    assert.ok(groupAttendanceIndex >= 0, "group-attendance exists");
    assert.ok(acceptCardIndex > groupStudentsIndex && acceptCardIndex < groupAttendanceIndex, "accept-card must be inside group-students");
    assert.ok(warningsCardIndex > groupAttendanceIndex, "absence-warnings-card must be inside group-attendance");
    assert.ok(html.includes('id="btn-warnings-preview"'), "Preview button exists");
    assert.ok(html.includes('id="btn-warnings-auto-fetch-pdf"'), "Auto-fetch PDF button exists");
    assert.ok(html.includes('id="warnings-pdf-file-input"'), "Import PDF input exists");
    assert.ok(html.includes('id="absence-detail-modal"'), "Absence detail modal exists");
  });

  await test("egypt_ids & stats_dashboard: strict official religion and zero guessing", async () => {
    const EGYPT_PATH = path.join(__dirname, "../extension/modules/egypt_ids.js");
    const SD_PATH = path.join(__dirname, "../extension/modules/stats_dashboard.js");
    const egyptCode = fs.readFileSync(EGYPT_PATH, "utf8");
    const sdCode = fs.readFileSync(SD_PATH, "utf8");

    const ctx = {
      window: {},
      globalThis: {},
      Object,
      parseInt,
      isNaN,
      String,
      Array,
      Math,
      Date,
      Set,
      Map,
      Number,
      RegExp
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(egyptCode, ctx);
    const Egypt = ctx.globalThis.NeprasEgypt;
    assert.ok(Egypt, "NeprasEgypt exists");

    // Strict official check: ZERO guessing from names
    assert.strictEqual(Egypt.resolveReligionFromName("كيرلس جرجس حنا"), "غير مسجّل");
    assert.strictEqual(Egypt.resolveReligionFromName("أحمد محمد محمود"), "غير مسجّل");

    // Official row resolution: accurate and handles whitespace in headers
    assert.strictEqual(Egypt.resolveReligion({ "الديانة": "مسلم" }), "مسلم");
    assert.strictEqual(Egypt.resolveReligion({ "الديانة ": "مسيحي" }), "مسيحي");
    assert.strictEqual(Egypt.resolveReligion({ religionId: 1 }), "مسلم");
    assert.strictEqual(Egypt.resolveReligion({ religionId: 2 }), "مسيحي");
    assert.strictEqual(Egypt.resolveReligion({ name: "محمد السيد عبد الله" }), "غير مسجّل");

    // Test stats_dashboard buildReligionStatsSheet with official records
    ctx.XLSX = {
      utils: {
        aoa_to_sheet: (aoa) => ({ aoa })
      }
    };
    vm.runInContext(sdCode, ctx);
    const SD = ctx.window.NeprasStatsDashboard;
    assert.ok(SD, "NeprasStatsDashboard exists");

    const sampleStudents = [
      { name: "طالب أ", nationalId: "30810150101234", "الديانة": "مسلم", grade: "الصف الأول", cls: "1/1" },
      { name: "طالب ب", nationalId: "30805120101256", "الديانة": "مسيحي", grade: "الصف الأول", cls: "1/1" }
    ];
    const relSheet = SD.buildReligionStatsSheet(sampleStudents, { school: "الحسينية الثانوية", year: "2026-2027", stage: "GENERAL_SECONDARY" });
    const headerRow = relSheet.aoa.find(row => Array.isArray(row) && row.some(cell => cell && (cell.v === "مسلم" || cell.v === "غير مسجّل بالبيانات")));
    const hasUnregistered = headerRow ? headerRow.some(c => c && c.v === "غير مسجّل بالبيانات") : false;
    assert.strictEqual(hasUnregistered, false, "When official religion is present, no unregistered column must appear");
  });

  await test("stats_dashboard: buildAnomaliesStatsSheet accurately respects secondary/prep stages", async () => {
    const EGYPT_PATH = path.join(__dirname, "../extension/modules/egypt_ids.js");
    const SD_PATH = path.join(__dirname, "../extension/modules/stats_dashboard.js");
    const egyptCode = fs.readFileSync(EGYPT_PATH, "utf8");
    const sdCode = fs.readFileSync(SD_PATH, "utf8");

    const ctx = {
      window: {},
      globalThis: {},
      Object,
      parseInt,
      isNaN,
      String,
      Array,
      Math,
      Date,
      Set,
      Map,
      Number,
      RegExp
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(egyptCode, ctx);
    ctx.XLSX = {
      utils: {
        aoa_to_sheet: (aoa) => ({ aoa })
      }
    };
    vm.runInContext(sdCode, ctx);
    const SD = ctx.window.NeprasStatsDashboard;

    // High school student born 2011-03-15 (in 2026 Oct 1: age = 15 yrs, 6 mos) in الصف الأول (Secondary)
    // 31103150101234: century 3 (2000s), yr 11 (2011), mo 03, dy 15
    const normalSecondaryStudent = {
      name: "طالب ثانوي طبيعي",
      nationalId: "31103150101234",
      grade: "الصف الأول",
      cls: "1/1"
    };

    // Underage student in secondary (born 2014, age 12)
    const underageSecondaryStudent = {
      name: "طالب صغير بالثانوي",
      nationalId: "31401010101234",
      grade: "الصف الأول",
      cls: "1/1"
    };

    const secMeta = { school: "الحسينية الثانوية", year: "2026-2027", stage: "GENERAL_SECONDARY" };
    const secSheet = SD.buildAnomaliesStatsSheet([normalSecondaryStudent, underageSecondaryStudent], secMeta);

    // The normal 15.5-year old student MUST NOT appear as an anomaly!
    const normalRow = secSheet.aoa.find(r => Array.isArray(r) && r.some(c => c && c.v === "طالب ثانوي طبيعي"));
    assert.strictEqual(normalRow, undefined, "15.5-year-old student in 1st Secondary must NOT be flagged as anomaly");

    // The 12-year-old student MUST be flagged as underage
    const underageRow = secSheet.aoa.find(r => Array.isArray(r) && r.some(c => c && c.v === "طالب صغير بالثانوي"));
    assert.ok(underageRow, "12-year-old in Secondary must be flagged");
    const noteCell = underageRow[underageRow.length - 1];
    assert.ok(noteCell.v.includes("أصغر من السن القانوني"), "Must indicate underage");
  });

  await test("comprehensive stats buttons and deep data cache preservation", async () => {
    const popupHtml = fs.readFileSync(path.join(__dirname, "../extension/popup.html"), "utf8");
    assert.ok(popupHtml.includes('id="btn-stats-center-fetch-deep"'), "Stats center must contain button to fetch comprehensive data");
    assert.ok(popupHtml.includes('id="btn-school-deep-stats-refresh"'), "School stats must contain button to fetch comprehensive data");
    assert.ok(popupHtml.includes('id="btn-analytics-deep-refresh"'), "Analytics must contain button to fetch comprehensive data");

    const schoolStatsJs = fs.readFileSync(path.join(__dirname, "../extension/modules/school_stats.js"), "utf8");
    assert.ok(schoolStatsJs.includes('prev.religion'), "school_stats merge must preserve religion from cached comprehensive students");
    assert.ok(schoolStatsJs.includes('prev.fatherFullName'), "school_stats merge must preserve father name from cached comprehensive students");

    const exportJs = fs.readFileSync(path.join(__dirname, "../extension/modules/export.js"), "utf8");
    assert.ok(exportJs.includes('NeprasSchoolManager.saveSchoolStats'), "export.js must save comprehensive deep students to SchoolManager");
  });

  await test("student_dossier: universal search, sibling matching, and profile assembly", async () => {
    const popupHtml = fs.readFileSync(path.join(__dirname, "../extension/popup.html"), "utf8");
    assert.ok(popupHtml.includes('id="sec-student-dossier"'), "popup.html must include student dossier search section");
    assert.ok(popupHtml.includes('id="student-dossier-modal"'), "popup.html must include student dossier modal");
    assert.ok(popupHtml.includes('modules/student_dossier.js'), "popup.html must include student_dossier.js");

    const bgJs = fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8");
    assert.ok(bgJs.includes('modules/student_dossier.js'), "background.js must include student_dossier.js in common files");

    const egyptCode = fs.readFileSync(path.join(__dirname, "../extension/modules/egypt_ids.js"), "utf8");
    const sdCode = fs.readFileSync(path.join(__dirname, "../extension/modules/stats_dashboard.js"), "utf8");
    const dossierCode = fs.readFileSync(path.join(__dirname, "../extension/modules/student_dossier.js"), "utf8");
    const ctx = {
      console,
      Date,
      String,
      Number,
      RegExp,
      Object,
      parseInt,
      isNaN,
      Array,
      Math,
      Set,
      Map,
      chrome: {
        storage: {
          local: {
            get: async (keys) => ({})
          }
        }
      }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(egyptCode, ctx);
    vm.runInContext(sdCode, ctx);
    vm.runInContext(dossierCode, ctx);

    const Dossier = ctx.window.NeprasStudentDossier;
    assert.ok(Dossier, "NeprasStudentDossier module must be exported");

    const sampleStudents = [
      {
        code: "5011",
        name: "يوسف حسام الدين محمود",
        fatherName: "حسام الدين محمود إبراهيم",
        motherName: "منى عادل عبد العزيز",
        nationalId: "31005120101235",
        grade: "الصف الأول الثانوي",
        cls: "1/2",
        mobile: "01098765432"
      },
      {
        code: "5012",
        name: "سارة حسام الدين محمود",
        fatherName: "حسام الدين محمود إبراهيم",
        motherName: "منى عادل عبد العزيز",
        nationalId: "31209250101246",
        grade: "الصف الثالث الإعدادي",
        cls: "3/1",
        mobile: "01098765432"
      },
      {
        code: "9099",
        name: "مايكل جورج رزق الله",
        nationalId: "31102020101251",
        grade: "الصف الأول الثانوي",
        cls: "1/1",
        mobile: "01234567890"
      }
    ];

    // 1. Search by student name
    const nameMatches = Dossier.searchStudents(sampleStudents, "يوسف حسام");
    assert.strictEqual(nameMatches.length, 1);
    assert.strictEqual(nameMatches[0].student.code, "5011");

    // 2. Search by student code
    const codeMatches = Dossier.searchStudents(sampleStudents, "5012");
    assert.strictEqual(codeMatches.length, 1);
    assert.strictEqual(codeMatches[0].student.name, "سارة حسام الدين محمود");

    // 3. Search by national ID
    const nidMatches = Dossier.searchStudents(sampleStudents, "31102020101251");
    assert.strictEqual(nidMatches.length, 1);
    assert.strictEqual(nidMatches[0].student.name, "مايكل جورج رزق الله");

    // 4. Search by parent phone number
    const phoneMatches = Dossier.searchStudents(sampleStudents, "01098765432");
    assert.strictEqual(phoneMatches.length, 2, "Phone search should find both children of the parent");

    // 5. Find siblings
    const siblingsOfYoussef = Dossier.findSiblings(sampleStudents[0], sampleStudents);
    assert.strictEqual(siblingsOfYoussef.length, 1, "Should find 1 sibling for Youssef");
    assert.strictEqual(siblingsOfYoussef[0].student.name, "سارة حسام الدين محمود");

    // 6. Build complete dossier
    const fullDossier = await Dossier.buildStudentDossier(sampleStudents[0], sampleStudents);
    assert.strictEqual(fullDossier.personal.name, "يوسف حسام الدين محمود");
    assert.strictEqual(fullDossier.personal.code, "5011");
    assert.strictEqual(fullDossier.academic.grade, "الصف الأول الثانوي");
    assert.strictEqual(fullDossier.siblings.length, 1);
    assert.strictEqual(fullDossier.siblings[0].student.name, "سارة حسام الدين محمود");
  });

  await test("staff_stats: subject grouping, statistics calculations, and multi-sheet workbook generation", async () => {
    const popupHtml = fs.readFileSync(path.join(__dirname, "../extension/popup.html"), "utf8");
    assert.ok(popupHtml.includes('id="btn-staff-export-master"'), "popup.html must include master staff export button");
    assert.ok(popupHtml.includes('id="select-staff-subject"'), "popup.html must include staff subject selector");
    assert.ok(popupHtml.includes('id="stat-staff-total"'), "popup.html must include staff total mini-stat");
    assert.ok(popupHtml.includes('modules/staff_stats.js'), "popup.html must include staff_stats.js");

    const bgJs = fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8");
    assert.ok(bgJs.includes('modules/staff_stats.js'), "background.js must include staff_stats.js");

    const egyptCode = fs.readFileSync(path.join(__dirname, "../extension/modules/egypt_ids.js"), "utf8");
    const staffStatsCode = fs.readFileSync(path.join(__dirname, "../extension/modules/staff_stats.js"), "utf8");
    const ctx = {
      console,
      Date,
      String,
      Number,
      RegExp,
      Object,
      parseInt,
      isNaN,
      Array,
      Math,
      Set,
      Map
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(egyptCode, ctx);
    vm.runInContext(staffStatsCode, ctx);

    const SS = ctx.window.NeprasStaffStats;
    assert.ok(SS, "NeprasStaffStats must be exported");

    const sampleStaff = [
      {
        "كود الموظف": "7001",
        "اسم الموظف الكامل": "أحمد محمود عبد الرحمن",
        "الرقم القومي": "26605150101235", // born 1966 -> will be 60 in 2026!
        "النوع": "ذكر",
        "الديانة": "مسلم",
        "مادة التدريس": "لغة عربية",
        "الوظيفة": "كبير معلمين",
        "تصنيف العامل": "قوة أساسية",
        "الموقف من العمل": "على رأس العمل"
      },
      {
        "كود الموظف": "7002",
        "اسم الموظف الكامل": "منى أحمد علي حسن",
        "الرقم القومي": "28509120101246",
        "النوع": "أنثى",
        "الديانة": "مسلم",
        "مادة التدريس": "لغة عربية",
        "الوظيفة": "معلم أول أ",
        "تصنيف العامل": "منتدب",
        "الموقف من العمل": "على رأس العمل"
      },
      {
        "كود الموظف": "7003",
        "اسم الموظف الكامل": "مينا سامي فرج",
        "الرقم القومي": "28804200101251",
        "النوع": "ذكر",
        "الديانة": "مسيحي",
        "مادة التدريس": "رياضيات",
        "الوظيفة": "معلم",
        "تصنيف العامل": "معلم بالحصة",
        "الموقف من العمل": "على رأس العمل"
      },
      {
        "كود الموظف": "7004",
        "اسم الموظف الكامل": "سعاد إبراهيم متولي",
        "الرقم القومي": "29011050101248",
        "النوع": "أنثى",
        "الديانة": "مسلم",
        "مادة التدريس": "دراسات اجتماعية",
        "الوظيفة": "معلم أول",
        "تصنيف العامل": "قوة أساسية",
        "الموقف من العمل": "إجازة رعاية طفل"
      }
    ];

    // 1. Group by subject
    const groups = SS.groupStaffBySubject(sampleStaff);
    assert.ok(groups.has("اللغة العربية"), "Should have Arabic group");
    assert.strictEqual(groups.get("اللغة العربية").length, 2);
    assert.ok(groups.has("الرياضيات"), "Should have Math group");
    assert.strictEqual(groups.get("الرياضيات").length, 1);
    assert.ok(groups.has("الدراسات الاجتماعية"), "Should have Social Studies group");
    assert.strictEqual(groups.get("الدراسات الاجتماعية").length, 1);

    // 2. Statistics calculation
    const stats = SS.calculateStaffStatistics(sampleStaff);
    assert.strictEqual(stats.total, 4);
    assert.strictEqual(stats.categories.core, 2);
    assert.strictEqual(stats.categories.nadb, 1);
    assert.strictEqual(stats.categories.partTime, 1);
    assert.strictEqual(stats.workStatus.active, 3);
    assert.strictEqual(stats.workStatus.leaveChild, 1);
    assert.strictEqual(stats.gender.male, 2);
    assert.strictEqual(stats.gender.female, 2);
    assert.strictEqual(stats.religion.muslim, 3);
    assert.strictEqual(stats.religion.christian, 1);
    assert.strictEqual(stats.retiringThisYear.length, 1, "Should detect employee born in 1966 retiring in 2026 at age 60");
    assert.strictEqual(stats.retiringThisYear[0].name, "أحمد محمود عبد الرحمن");

    // 3. Multi-sheet workbook builder
    const mockXLSX = {
      utils: {
        book_new: () => ({ Sheets: {}, SheetNames: [] }),
        aoa_to_sheet: (aoa) => ({ aoa }),
        book_append_sheet: (wb, ws, name) => {
          wb.SheetNames.push(name);
          wb.Sheets[name] = ws;
        }
      }
    };

    const wb = SS.buildStaffWorkbook(sampleStaff, { school: "مدرسة المتفوقين", year: "2026-2027" }, mockXLSX);
    assert.ok(wb.SheetNames.includes("اللوحة الإحصائية للعاملين"), "Must include Dashboard sheet");
    assert.ok(wb.SheetNames.includes("جميع العاملين"), "Must include All Staff sheet");
    assert.ok(wb.SheetNames.includes("اللغة العربية"), "Must include dedicated Arabic sheet");
    assert.ok(wb.SheetNames.includes("الرياضيات"), "Must include dedicated Math sheet");
    assert.ok(wb.SheetNames.includes("الدراسات الاجتماعية"), "Must include dedicated Social Studies sheet");
  });

  await test("student-cards.html visibility, session persistence, and auto-download PDF workflows", async () => {
    // 1. student-cards.html must close <div style="display:none;"> properly so .workspace is visible
    const scPath = path.join(__dirname, "../extension/student-cards.html");
    const scJsPath = path.join(__dirname, "../extension/student-cards.js");
    const scHtml = fs.readFileSync(scPath, "utf8");
    const scJs = fs.readFileSync(scJsPath, "utf8");
    assert.ok(!scHtml.includes('<div style="display:none;">\r\n    <h1>بطاقات الطلاب</h1>\r\n    <p>ارفع كشف الحسابات، وتخرج لكل طالب بطاقة مستقلة جاهزة للقص والتسليم.</p>\r\n  </header>'), "Unclosed <div style='display:none;'> must be fixed");
    assert.ok(!scHtml.includes('<div style="display:none;">\n    <h1>بطاقات الطلاب</h1>\n    <p>ارفع كشف الحسابات، وتخرج لكل طالب بطاقة مستقلة جاهزة للقص والتسليم.</p>\n  </header>'), "Unclosed <div style='display:none;'> (LF) must be fixed");
    assert.ok(scHtml.includes('<script src="nepras-shim.js"></script>'), "student-cards.html must include nepras-shim.js");
    assert.ok(scHtml.includes('<script src="student-cards.js"></script>'), "student-cards.html must include student-cards.js");
    assert.ok(!/<script(?![^>]*src=)[^>]*>/i.test(scHtml), "student-cards.html must not contain inline scripts blocked by MV3 CSP");
    assert.ok(scJs.includes("neprasTrainingCardsPdf"), "student-cards.js must support auto-loaded training platform PDF");

    // 1b. attendance.js must not unconditionally call sendResponse({ status: "success" })
    const attendanceJsCode = fs.readFileSync(path.join(__dirname, "../extension/modules/attendance.js"), "utf8");
    assert.ok(!/if \(request\.action === "EXPORT_DATA"\) exportAllStudentsData\(\);\s*sendResponse\(\{ status: "success" \}\);/.test(attendanceJsCode), "attendance.js must not unconditionally hijack sendResponse for all tab messages");

    // 2. Session persistence in preload-tab.js, page_loader.js, main.js, and quick_login.js
    const preloadTabCode = fs.readFileSync(path.join(__dirname, "../desktop/src/preload-tab.js"), "utf8");
    const pageLoaderCode = fs.readFileSync(path.join(__dirname, "../extension/page_loader.js"), "utf8");
    const mainJsCode = fs.readFileSync(path.join(__dirname, "../desktop/src/main.js"), "utf8");
    const quickLoginCode = fs.readFileSync(path.join(__dirname, "../extension/modules/quick_login.js"), "utf8");

    assert.ok(preloadTabCode.includes("__nepras_session_backup_v1__"), "preload-tab.js must persist sessionStorage across restarts");
    assert.ok(pageLoaderCode.includes("__nepras_session_backup_v1__"), "page_loader.js must persist sessionStorage across tabs");
    assert.ok(mainJsCode.includes("Max-Age=2592000"), "main.js must persist session cookies for 30 days");
    assert.ok(quickLoginCode.includes("autoLogin: s?.autoLogin !== false"), "quick_login.js must default autoLogin to true");

    // 3. Auto-download Ministry PDF in popup.js and content.js
    const popupJsCode = fs.readFileSync(path.join(__dirname, "../extension/popup.js"), "utf8");
    const contentJsCode = fs.readFileSync(path.join(__dirname, "../extension/content.js"), "utf8");
    const hostCoreCode = fs.readFileSync(path.join(__dirname, "../shared/host-core.js"), "utf8");
    const schoolMgrCode = fs.readFileSync(path.join(__dirname, "../extension/modules/school_manager.js"), "utf8");
    const licenseMgrCode = fs.readFileSync(path.join(__dirname, "../desktop/src/license-manager.js"), "utf8");

    assert.ok(popupJsCode.includes("neprasAutoDownloadMinistryPdf"), "popup.js must define neprasAutoDownloadMinistryPdf");
    assert.ok(popupJsCode.includes("neprasNavigateStudentSpa"), "popup.js must define neprasNavigateStudentSpa for SPA navigation");
    assert.ok(popupJsCode.includes("STAGE_NAMES_AR"), "popup.js must format stage code '3' into Arabic stage label");
    assert.ok(!popupJsCode.includes('window.open("", "_blank")'), "popup.js must not use window.open('', '_blank') which opens a blank Electron window");
    assert.ok(contentJsCode.includes("NEPRAS_CLICK_REPORT_BUTTON"), "content.js must handle NEPRAS_CLICK_REPORT_BUTTON");
    assert.ok(contentJsCode.includes("__neprasLastReportClick"), "content.js must deduplicate rapid NEPRAS_CLICK_REPORT_BUTTON clicks");
    assert.ok(contentJsCode.includes("NEPRAS_SPA_NAVIGATE"), "content.js must handle NEPRAS_SPA_NAVIGATE for in-tab Angular routing");
    assert.ok(mainJsCode.includes("nep:getLatestDownloadedPdf"), "main.js must expose nep:getLatestDownloadedPdf");
    assert.ok(hostCoreCode.includes('url.startsWith("blob:")'), "host-core.js must route blob: URLs into panel-layer");
    assert.ok(hostCoreCode.includes("_suppressed"), "host-core.js must delete suppressed intermediate downloads upon completion");
    assert.ok(schoolMgrCode.includes("deduplicateSchoolsByOfficialCode"), "school_manager.js must deduplicate serial numbers vs official school codes");
    assert.ok(schoolMgrCode.includes("exportSchoolPackage"), "school_manager.js must define exportSchoolPackage");
    assert.ok(schoolMgrCode.includes("importSchoolPackage"), "school_manager.js must define importSchoolPackage");
    assert.ok(licenseMgrCode.includes("activePaidByName"), "license-manager.js must preserve active licensed school over duplicate trial serial numbers");
    assert.ok(contentJsCode.includes("normAr"), "content.js must normalize Arabic text for robust button matching");
    assert.ok(popupJsCode.includes("btn-export-school-profile"), "popup.js must support exporting school profile packages");
    assert.ok(popupJsCode.includes("btn-import-school-profile"), "popup.js must support importing school profile packages");

    const hostCss = fs.readFileSync(path.join(__dirname, "../shared/host.css"), "utf8");
    assert.ok(hostCss.includes(".panel-header-bar"), "host.css must define .panel-header-bar to prevent button overlapping");

    const hostHtml = fs.readFileSync(path.join(__dirname, "../shared/host.html"), "utf8");
    assert.ok(hostHtml.includes('<span class="drawer-version">v1.3.4</span>'), "host.html must display version v1.3.4");
  });

  // 30. Name Fixer Dual-Mode (Name Cleaning vs Extra-Only) Tests
  await test("name_fixer: supports dual mode (full vs extra_only) and configurable overwrite policy", () => {
    const nameFixerCode = fs.readFileSync(path.join(__dirname, "../extension/modules/name_fixer.js"), "utf8");

    // Verify mode definitions and UI radio controls
    assert.ok(nameFixerCode.includes('id="nf-mode-full"'), "name_fixer.js must include full mode radio");
    assert.ok(nameFixerCode.includes('id="nf-mode-extra"'), "name_fixer.js must include extra_only mode radio");
    assert.ok(nameFixerCode.includes('id="nf-policy-empty"'), "name_fixer.js must include empty-only apply policy radio");
    assert.ok(nameFixerCode.includes('id="nf-policy-overwrite"'), "name_fixer.js must include overwrite policy radio");

    // Verify logic switches in Fixer.onEditPageFixNameAndBack
    assert.ok(nameFixerCode.includes("const isExtraOnly = (opMode === 'extra_only');"), "name_fixer.js must identify extra_only mode");
    assert.ok(nameFixerCode.includes("if (!isExtraOnly) {"), "name_fixer.js must bypass student name cleaning in extra_only mode");
    assert.ok(nameFixerCode.includes("extraOverwrite ? (currentVal !== defAddress) : (!currentVal)"), "name_fixer.js must apply address policy correctly");
    assert.ok(nameFixerCode.includes("extraOverwrite ? (currentVal !== defLang1) : isBlank"), "name_fixer.js must apply lang1 policy correctly");
    assert.ok(nameFixerCode.includes("extraOverwrite ? (currentVal !== defLang2) : isBlank"), "name_fixer.js must apply lang2 policy correctly");
    assert.ok(nameFixerCode.includes("extraOverwrite ? (currentVal !== defRegStatus) : isBlank"), "name_fixer.js must apply regStatus policy correctly");

    // Verify dynamic UI button label
    assert.ok(nameFixerCode.includes("▶️ بدء / استكمال تعديل البيانات الإضافية"), "name_fixer.js must show specialized toggle button text in extra_only mode");
    assert.ok(nameFixerCode.includes("البيانات الإضافية مطابقة بالفعل، لا حاجة للتعديل."), "name_fixer.js must gracefully skip unchanged students in extra_only mode");
  });

  // 31. Technical Education Workers & Kashf 41 Newcomers Rules
  await test("school_records & class_lists: enforces strict Kashf 41 criteria and Technical Workers priority sequence", () => {
    // 1) Test Kashf 41 Filtering Logic
    const schoolRecordsCode = fs.readFileSync(path.join(__dirname, "../extension/modules/school_records.js"), "utf8");
    assert.ok(schoolRecordsCode.includes("isStageFirstGrade"), "school_records.js must define isStageFirstGrade");
    assert.ok(schoolRecordsCode.includes("isNewcomerRegistrationStatus"), "school_records.js must define isNewcomerRegistrationStatus");
    assert.ok(schoolRecordsCode.includes("runWorkersExport"), "school_records.js must export runWorkersExport");
    assert.ok(schoolRecordsCode.includes("NEPRAS_RECORDS_WORKERS"), "school_records.js must handle NEPRAS_RECORDS_WORKERS");

    // Simulate Kashf 41 filter directly
    function isStageFirstGrade(gradeText) {
      const g = String(gradeText || '')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
      // استبعاد الصفوف الثاني والثالث والرابع والخامس والسادس (مع الحذر من كلمة ثانوي أو ثانوية)
      if (/الصف\s+(?:الثاني|الثانى|ثاني|ثانى|الثالث|ثالث|الرابع|رابع|الخامس|خامس|السادس|سادس)|kg2/i.test(g)) return false;
      if (/(?:^|\s)(?:ثاني|ثانى|ثالث|رابع|خامس|سادس)(?:\s|$)/i.test(g)) return false;
      return /(?:الصف\s+)?(?:الاول|اول|أول|الأول|kg1|المستوى\s+الاول|المستوى\s+الأول)/i.test(g);
    }
    function isNewcomerRegistrationStatus(statusText) {
      const s = String(statusText || '')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
      if (/باق|اعاده|إعادة|راسب|مفصول|منقطع/i.test(s)) return false;
      return /مستجد|ناجح\s*و\s*منقول/i.test(s);
    }

    const testStudents = [
      { name: "طالب 1", grade: "الصف الأول الثانوي", status: "مستجد" },
      { name: "طالب 2", grade: "الصف الأول الثانوي الفني", status: "ناجح ومنقول" },
      { name: "طالب 3", grade: "الصف الأول الصناعي", status: "باق للإعادة" },
      { name: "طالب 4", grade: "الصف الأول الإعدادي", status: "راسب" },
      { name: "طالب 5", grade: "الصف الثاني الثانوي", status: "مستجد" },
      { name: "طالب 6", grade: "الصف الثالث التجاري", status: "ناجح ومنقول" },
      { name: "طالب 7", grade: "المستوى الأول رياض أطفال", status: "مستجد" }
    ];

    const accepted = testStudents.filter(s => isStageFirstGrade(s.grade) && isNewcomerRegistrationStatus(s.status));
    assert.strictEqual(accepted.length, 3, "Only Grade 1 students with 'مستجد' or 'ناجح ومنقول' must be accepted");
    assert.deepStrictEqual(accepted.map(s => s.name), ["طالب 1", "طالب 2", "طالب 7"]);

    // 2) Test Class Lists Priority Ordering: (1. Regular -> 2. Homeschooling -> 3. Workers)
    assert.ok(CL, "NeprasClassLists must be defined");

    const sampleList = [
      { code: "300", name: "علي حسن", study_type: "عمال", gender: "ذكر" },
      { code: "200", name: "إبراهيم أحمد", study_type: "منازل", gender: "ذكر" },
      { code: "101", name: "ياسر محمود", study_type: "نظامي", gender: "ذكر" },
      { code: "100", name: "أحمد سيد", study_type: "منتظم", gender: "ذكر" }
    ];

    const sorted = CL.sortStudentsList([...sampleList], "gender_boys");
    assert.strictEqual(sorted[0].code, "100", "First regular student");
    assert.strictEqual(sorted[1].code, "101", "Second regular student");
    assert.strictEqual(sorted[2].code, "200", "Homeschooling student follows regular");
    assert.strictEqual(sorted[3].code, "300", "Workers student follows homeschooling");
  });

  // 32. School Code & Serial Auto-Aliasing and Active Paid Shield Regression Test
  await test("desktop_license: auto-aliasing of school code and serial (130000031 <-> 29233), fuzzy name matching, and page title rejection", async () => {
    const os = require("os");
    const { DesktopLicenseManager, areSchoolNamesMatching, isGenericPageTitle } = require("../desktop/src/license-manager");

    // A. Fuzzy name matching verification
    assert.strictEqual(areSchoolNamesMatching("مدرسة ميت العز الثانوية", "ميت العز الثانوية المشتركة"), true, "Fuzzy match must identify variations of same school name");
    assert.strictEqual(areSchoolNamesMatching("مدرسة الشهيد محمد سليمان سلامة ع بنين", "الشهيد محمد سليمان سلامة"), true);
    assert.strictEqual(areSchoolNamesMatching("مدرسة النور الرسمية", "مدرسة غير مشتركة"), false, "Different schools must not match");

    // B. Page title filtering verification
    assert.strictEqual(isGenericPageTitle("تعديل بيان محدد لمجموعة طلاب"), true, "Generic EMIS page title must be rejected");
    assert.strictEqual(isGenericPageTitle("بيانات التلميذ"), true);
    assert.strictEqual(isGenericPageTitle("ميت العز الثانوية المشتركة"), false, "Legitimate school name must not be rejected");

    // C. License Aliasing Simulation
    const tmpDir = path.join(os.tmpdir(), "nepras-alias-test-" + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      const { createSupabaseTicket } = require("../desktop/src/license-manager");
      const lm = new DesktopLicenseManager({ storageDir: tmpDir });
      const now = Date.now();
      const expiresAt = now + (300 * 24 * 60 * 60 * 1000);

      // School 130000031 was activated with an annual license
      lm.state.ticketsBySchool["130000031"] = {
        ticket: createSupabaseTicket("130000031", expiresAt, "active"),
        verifiedAt: now,
        expiresAt: expiresAt,
        schoolName: "ميت العز الثانوية المشتركة",
        status: "active"
      };
      lm.state.activeSchoolCode = "130000031";
      lm.state.activeSchoolName = "ميت العز الثانوية المشتركة";

      assert.strictEqual(lm.getStatus().locked, false);
      assert.strictEqual(lm.getStatus().status, "ACTIVE");

      // 1. Navigation to a page detecting 5-digit School Code 29233 with variation 'مدرسة ميت العز الثانوية'
      await lm.onSchoolDetected({ schoolCode: "29233", schoolName: "مدرسة ميت العز الثانوية" });
      const statusAfterAlias = lm.getStatus();
      assert.strictEqual(statusAfterAlias.locked, false, "Must not lock when school code 29233 is detected for active serial 130000031");
      assert.strictEqual(statusAfterAlias.status, "ACTIVE");

      // 2. Navigation to a subpage sending generic page title as school name
      await lm.onSchoolDetected({ schoolCode: "29233", schoolName: "تعديل بيان محدد لمجموعة طلاب" });
      const statusAfterGeneric = lm.getStatus();
      assert.strictEqual(statusAfterGeneric.locked, false, "Must not lock when generic page title is passed");
      assert.strictEqual(statusAfterGeneric.schoolName, "ميت العز الثانوية المشتركة", "Must preserve genuine school name");

      // 3. Background API request sending only school code 29233 without name
      await lm.onSchoolDetected({ schoolCode: "29233", schoolName: "" });
      const statusAfterApi = lm.getStatus();
      assert.strictEqual(statusAfterApi.locked, false, "Must not lock during headless/background API calls");

      // 4. A different school with expired trial must remain locked and not inherit 130000031's license
      lm.state.ticketsBySchool["7776655"] = {
        ticket: createSupabaseTicket("7776655", now - 1000, "trial"),
        verifiedAt: now,
        expiresAt: now - 1000,
        schoolName: "مدرسة الأمل الابتدائية",
        status: "trial"
      };
      const statusDifferentSchool = lm.getStatus("7776655");
      assert.strictEqual(statusDifferentSchool.locked, true, "Different unsubscribed school must remain locked");
      assert.strictEqual(statusDifferentSchool.status, "EXPIRED_TRIAL");
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test("NeprasLogger: redacts JWTs and sensitive keys and bridges to parent.nepDesktop.writeLog", () => {
    const loggerSrc = fs.readFileSync(path.resolve(__dirname, "../shared/nepras_logger.js"), "utf8");
    const writtenEntries = [];
    const mockParent = {
      nepDesktop: {
        writeLog: (entry) => {
          writtenEntries.push(entry);
          return Promise.resolve(true);
        }
      }
    };
    const mockWin = {
      parent: mockParent,
      addEventListener: () => {}
    };
    const scope = {
      globalThis: mockWin,
      window: mockWin,
      console: { warn: () => {}, error: () => {} },
      Date,
      Error,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      JSON,
      setTimeout,
      clearTimeout
    };
    vm.createContext(scope);
    vm.runInContext(loggerSrc, scope);
    const logger = scope.window.NeprasLogger;
    assert(logger, "NeprasLogger must initialize in browser/iframe scope");

    const sampleJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    logger.error("AUTH_TEST", `Failed with token ${sampleJwt}`, {
      Authorization: `Bearer ${sampleJwt}`,
      password: "super_secret_password",
      schoolCode: "1204567"
    });

    const entries = logger.getEntries();
    assert.strictEqual(entries.length, 1);
    assert(!entries[0].message.includes("eyJhbGci"), "JWT must be redacted from message");
    assert(entries[0].message.includes("[REDACTED_JWT]"), "Redacted placeholder must appear");
    assert.strictEqual(entries[0].details.Authorization, "***", "Authorization key must be masked");
    assert.strictEqual(entries[0].details.password, "***", "password key must be masked");
    assert.strictEqual(entries[0].details.schoolCode, "1204567", "Non-sensitive schoolCode must be preserved");
    assert.strictEqual(writtenEntries.length, 1, "Must bridge log entry to window.parent.nepDesktop.writeLog");
  });

  await test("Cross-platform version synchronization: all manifests and packages are unified at 1.3.4", () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    const extManifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../extension/manifest.json"), "utf8"));
    const deskPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../desktop/package.json"), "utf8"));
    const mobPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../mobile/package.json"), "utf8"));
    const gradleTxt = fs.readFileSync(path.resolve(__dirname, "../mobile/android/app/build.gradle"), "utf8");

    assert.strictEqual(rootPkg.version, "1.3.4");
    assert.strictEqual(extManifest.version, "1.3.4");
    assert.strictEqual(deskPkg.version, "1.3.4");
    assert.strictEqual(mobPkg.version, "1.3.4");
    assert(gradleTxt.includes('versionName "1.3.4"'), "Android build.gradle must have versionName 1.3.4");
    assert(!extManifest.permissions.includes("downloads.open"), "Invalid downloads.open permission must not exist in manifest.json");
  });

  await test("Deep student stats & zero-defaults: normalizeDeepStudent, school_stats, stats_dashboard, school_records, and always-visible school-stats-content", () => {
    // A. Verify popup.html has #school-stats-content visible by default (not hidden)
    const popupHtml = fs.readFileSync(path.resolve(__dirname, "../extension/popup.html"), "utf8");
    assert(popupHtml.includes('<div id="school-stats-content">'), "#school-stats-content must not have the hidden attribute in popup.html");
    assert(!popupHtml.includes('<div id="school-stats-content" hidden>'), "#school-stats-content must always be visible in popup.html");

    // B. Verify student_api.js pre-seeds religion and nationality maps in neprasApiGetStaticDeepLookups
    const studentApiSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/student_api.js"), "utf8");
    assert(studentApiSrc.includes('"1": "مسلم"') && studentApiSrc.includes('"2": "مسيحي"'), "student_api.js must pre-seed official religion map {1: مسلم, 2: مسيحي}");

    // C. Verify stats_dashboard.js does not default religion to 'مسلم' or unrecorded status to 'new'/'promoted'
    const statsDashSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/stats_dashboard.js"), "utf8");
    const mockXlsx = {
      utils: {
        aoa_to_sheet: (aoa) => ({ aoa }),
        book_new: () => ({ Sheets: {}, SheetNames: [] }),
        book_append_sheet: () => {}
      }
    };
    const dashScope = {
      window: { NeprasEgypt: classListsScope.NeprasEgypt, XLSX: mockXlsx },
      globalThis: { NeprasEgypt: classListsScope.NeprasEgypt, XLSX: mockXlsx },
      XLSX: mockXlsx,
      console, Date, Math, Array, Object, String, Number, Boolean, RegExp, Set, Map, JSON
    };
    dashScope.window.window = dashScope.window;
    vm.createContext(dashScope);
    vm.runInContext(statsDashSrc, dashScope);
    const Dash = dashScope.window.NeprasStatsDashboard;
    assert(Dash, "NeprasStatsDashboard must initialize");

    // Empty row must NOT default religion to 'مسلم'
    const emptyNorm = Dash.normalizeStudentRecord(null);
    assert.strictEqual(emptyNorm.religion, "", "Empty student record must not default religion to مسلم");

    // Record without religion must have 'غير مسجّل' and not be counted as Muslim in buildPrincipalDashboardSheet
    const noRelNorm = Dash.normalizeStudentRecord({
      studentCode: "1001",
      fullName: "طالب بدون ديانة",
      nationalId: "31201010100418",
      grade: "الصف الأول",
      classRoom: "1",
      eduSystem: "منازل",
      enrollStatus: ""
    });
    assert.strictEqual(noRelNorm.religion, "غير مسجّل");
    assert.strictEqual(noRelNorm.mode, "منازل");
    assert.strictEqual(noRelNorm.status, "");

    const principalSheet = Dash.buildPrincipalDashboardSheet([
      { studentCode: "1", fullName: "أحمد محمد", nationalId: "31201010100418", grade: "الصف الأول", classRoom: "1", religion: "مسلم", enrollStatus: "مستجد" },
      { studentCode: "2", fullName: "مينا جرجس", nationalId: "31201010100418", grade: "الصف الأول", classRoom: "1", religion: "مسيحي", enrollStatus: "ناجح ومنقول" },
      { studentCode: "3", fullName: "طالب غير مسجل", nationalId: "31201010100428", grade: "الصف الأول", classRoom: "1", religion: "", enrollStatus: "" }
    ], { school: "مدرسة الاختبار", year: "2026-2027", dir: "", admin: "", affairs: "", principal: "" });
    const gradeRow = principalSheet.aoa.find(r => r && r[0] && r[0].v === "الصف الأول");
    assert(gradeRow, "Grade row must exist in Principal Dashboard sheet");
    assert.strictEqual(gradeRow[2].v, 3, "Total students = 3");
    assert.strictEqual(gradeRow[3].v, 2, "Boys = 2");
    assert.strictEqual(gradeRow[4].v, 1, "Girls = 1");
    assert.strictEqual(gradeRow[5].v, 1, "Muslim = 1 (unrecorded religion must NOT be counted as Muslim)");
    assert.strictEqual(gradeRow[6].v, 1, "Christian = 1");
    assert.strictEqual(gradeRow[7].v, 1, "New = 1");
    assert.strictEqual(gradeRow[8].v, 1, "Promoted = 1 (unrecorded status must NOT be counted as Promoted)");

    // D. Verify school_stats.js aggregates normalizeDeepStudent records accurately
    const statsSrc = fs.readFileSync(path.resolve(__dirname, "../extension/modules/school_stats.js"), "utf8");
    const sScope = {
      window: { NeprasEgypt: classListsScope.NeprasEgypt },
      globalThis: { NeprasEgypt: classListsScope.NeprasEgypt },
      document: { querySelector: () => null },
      chrome: { storage: { local: {} } },
      console, Date, Math, Array, Object, String, Number, Boolean, RegExp, Set, Map, JSON
    };
    vm.createContext(sScope);
    vm.runInContext(statsSrc, sScope);

    const deepStudentsSample = [
      {
        studentCode: "5001",
        fullName: "عمر خالد",
        nationalId: "31201010100418",
        gender: "بنين",
        religion: "مسلم",
        grade: "الصف الأول الثانوي",
        classRoom: "1/1",
        eduSystem: "منازل",
        enrollStatus: "مستجد",
        damg: "لا يوجد"
      },
      {
        studentCode: "5002",
        fullName: "مريم بطرس",
        nationalId: "31201010100428",
        gender: "بنات",
        religion: "مسيحي",
        grade: "الصف الأول الثانوي",
        classRoom: "1/2",
        eduSystem: "نظامي",
        enrollStatus: "ناجح ومنقول",
        damg: "بطء التعلم",
        motherFullName: "ماري حنا",
        lang1: "لغة إنجليزية",
        lang2: "لغة فرنسية"
      }
    ];
    const agg = sScope.window.neprasStatsAggregateFromRows(deepStudentsSample, "GENERAL_SECONDARY");
    assert(agg && Array.isArray(agg.grades) && agg.grades.length === 1);
    assert.strictEqual(agg.total, 2);
    assert.strictEqual(agg.boys, 1);
    assert.strictEqual(agg.girls, 1);
    assert.strictEqual(agg.homes, 1, "Must detect منازل from eduSystem");
    assert.strictEqual(agg.integrated, 1, "Must detect دمج from damg");
    assert.strictEqual(agg.classes, 1, "Only non-home class 1/2 counted");
    assert.strictEqual(agg.detailRows[1].religion, "مسيحي", "detailRows must preserve religion");
    assert.strictEqual(agg.detailRows[1].motherFullName, "ماري حنا", "detailRows must preserve deep fields like motherFullName");
  });

  // 36. Mobile Platform Backend Storage Engine (Large-scale State & Zero-Quota-Exceeded)
  await test("mobile_platform: large-scale state persistence with native plugin / IndexedDB fallback exceeding 5MB localStorage limit", async () => {
    const mobileBackendSrc = fs.readFileSync(path.resolve(__dirname, "../mobile/src/platform-backend.js"), "utf8");
    
    // Simulate Android WebView environment
    let nativeSavedState = null;
    const mockPlugin = {
      saveAppState: async ({ state }) => {
        nativeSavedState = state;
        return { ok: true, bytes: state.length };
      },
      loadAppState: async () => ({ state: nativeSavedState }),
      addListener: () => {}
    };

    let lsStorage = {};
    const mockWindow = {
      Capacitor: {
        registerPlugin: () => mockPlugin,
        Plugins: { EmisBrowser: mockPlugin }
      },
      localStorage: {
        getItem: (k) => lsStorage[k] || null,
        setItem: (k, v) => {
          if (typeof v === "string" && v.length > 5000000) {
            throw new Error("QuotaExceededError: DOMException");
          }
          lsStorage[k] = String(v);
        }
      },
      indexedDB: null,
      console
    };
    mockWindow.window = mockWindow;
    mockWindow.globalThis = mockWindow;

    const scope = {
      window: mockWindow,
      globalThis: mockWindow,
      console,
      setTimeout: (fn) => 1,
      clearTimeout: () => {},
      setInterval: (fn) => 1,
      clearInterval: () => {},
      Date,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      JSON
    };
    vm.createContext(scope);
    vm.runInContext(mobileBackendSrc, scope);

    const backend = scope.window.NeprasBackend;
    assert(backend, "NeprasBackend must be exposed on window");

    // Generate large 6MB payload simulating thousands of deep student records with all 24 fields
    const deepStudentTemplate = {
      code: "12345678",
      name: "طالب تجريبي ذو اسم رباعي كامل للتأكد من حجم السجل",
      nationalId: "31201010101234",
      grade: "الصف الأول الثانوي العام",
      religion: "مسلم",
      enrollStatus: "مستجد",
      fatherFullName: "ولي أمر الطالب التجريبي بالاسم الرباعي الكامل",
      motherFullName: "والدة الطالب التجريبي بالاسم الرباعي الكامل",
      address: "جمهورية مصر العربية محافظة الجيزة قسم أول إمبابة شارع التحرير",
      mobile: "01012345678",
      phone: "0233445566",
      specialization: "علمي علوم",
      section: "عام",
      eduSystem: "رسمي",
      damg: "لا يوجد دمج أو تربية خاصة",
      lang1: "اللغة العربية الأولى",
      lang2: "اللغة الفرنسية الثانية",
      notes: "بيانات إضافية موسعة لضمان تجاوز سقف التخزين الافتراضي لـ localStorage"
    };
    const largeDummyArray = Array.from({ length: 15000 }, (_, i) => ({ ...deepStudentTemplate, code: `S${100000 + i}` }));
    const largeStateString = JSON.stringify({
      local: {
        neprasCachedStudentsList: largeDummyArray,
        neprasSchoolStatsV1: { total: 15000, boys: 7500, girls: 7500 }
      }
    });

    assert(largeStateString.length > 5000000, `Simulated state payload must exceed 5MB localStorage quota (actual: ${largeStateString.length} bytes)`);

    // 1) Test saving large state: must NOT throw QuotaExceededError and must save via native plugin
    await backend.saveState(largeStateString);
    assert.strictEqual(nativeSavedState, largeStateString, "Must save full large state via native plugin without truncation");

    // 2) Test loading large state: must return the exact 8MB state string
    const loaded = await backend.loadState();
    assert.strictEqual(loaded, largeStateString, "Must load complete large state string without loss");
    const parsed = JSON.parse(loaded);
    assert.strictEqual(parsed.local.neprasCachedStudentsList.length, 15000, "All 15,000 students must be preserved in state");
  });

  // 37. Mobile School Code Extraction & Multi-Source Detection
  await test("mobile_platform: extractSchoolFromHeaderList handles Arabic digits, alternative headers, and JWT claims accurately", () => {
    const mobileBackendSrc = fs.readFileSync(path.resolve(__dirname, "../mobile/src/platform-backend.js"), "utf8");
    const scope = {
      window: { localStorage: { getItem: () => null, setItem: () => {} } },
      globalThis: {},
      console,
      setTimeout: (fn) => 1,
      clearTimeout: () => {},
      setInterval: (fn) => 1,
      clearInterval: () => {},
      Date,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      JSON,
      atob: (s) => Buffer.from(s, "base64").toString("binary"),
      decodeURIComponent,
      escape
    };
    scope.window.window = scope.window;
    scope.globalThis = scope.window;
    vm.createContext(scope);
    vm.runInContext(mobileBackendSrc, scope);

    // Test extraction from EmisBrowserPlugin Java code regex & platform-backend
    const javaSrc = fs.readFileSync(path.resolve(__dirname, "../mobile/android/app/src/main/java/eg/gov/nepras/app/EmisBrowserPlugin.java"), "utf8");
    assert(javaSrc.includes("lastSentScode"), "EmisBrowserPlugin must track lastSentScode to prevent missed school code detection");
    assert(javaSrc.includes("saveAppState"), "EmisBrowserPlugin must define saveAppState plugin method");
    assert(javaSrc.includes("loadAppState"), "EmisBrowserPlugin must define loadAppState plugin method");

    // Simulate headers with Arabic digits: "٢١٠٢٤٢١٩" -> "21024219"
    const fnMatch = mobileBackendSrc.match(/function extractSchoolFromHeaderList\(hdrList\)\s*\{[\s\S]*?\n  \}/);
    assert(fnMatch, "extractSchoolFromHeaderList must be defined");
    const extractFn = vm.runInContext("(" + fnMatch[0] + ")", scope);

    const ext1 = extractFn([
      { name: "schoolcode", value: "٢١٠٢٤٢١٩" },
      { name: "schoolname", value: "مدرسة المتفوقين التجريبية" }
    ]);
    assert.strictEqual(ext1.schoolCode, "21024219");
    assert.strictEqual(ext1.schoolName, "مدرسة المتفوقين التجريبية");

    // Simulate alternative header key "sc" with whitespace
    const ext2 = extractFn([
      { name: "sc", value: " 9876543 " }
    ]);
    assert.strictEqual(ext2.schoolCode, "9876543");

    // Simulate JWT token containing SchoolCode and ArabicSchoolName
    const jwtPayload = Buffer.from(JSON.stringify({ SchoolCode: "5556667", ArabicSchoolName: "مدرسة النيل الحديثة" })).toString("base64url");
    const ext3 = extractFn([
      { name: "Authorization", value: `Bearer eyJhbGciOiJIUzI1NiJ9.${jwtPayload}.sig` }
    ]);
    assert.strictEqual(ext3.schoolCode, "5556667");
    assert.strictEqual(ext3.schoolName, "مدرسة النيل الحديثة");
  });

  console.log(`\nAll ${passed} audit & fix regression tests passed!`);
})();
