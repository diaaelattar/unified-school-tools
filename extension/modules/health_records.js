/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة سجلات ومبادرات الصحة المدرسية والتأمين الصحي
 * (School Health Records & Presidential Initiatives)
 *
 * المبادرات المعتمدة:
 *  1. المبادرة الرئاسية للكشف المبكر عن أمراض سوء التغذية (الأنيميا - السمنة - التقزم) لطلاب المرحلة الابتدائية.
 *  2. مبادرة "عيون أطفالنا مستقبلنا" — الهيئة العامة للتأمين الصحي والإدارة العامة لطب الأطفال للكشف عن عيوب الإبصار.
 */
'use strict';

(function(global) {
  if (global.NeprasHealthRecords) return;

  const TEMPLATE_FILE = 'templates/template_health.xlsx';

  /**
   * توليد مصنف كشوف الصحة الرسمية المعتمدة مقسماً حسب الفصول
   *
   * @param {Array} studentsList - قائمة الطلاب
   * @param {Object} schoolContext - سياق المدرسة (اسم المدرسة، الإدارة، العام الدراسي)
   * @param {Object} options - الخيارات: mode ('MALNUTRITION' | 'EYES' | 'BOTH')
   * @param {Object} io - دوال المساعدة (loadTemplate, onProgress, shouldCancel)
   */
  async function buildHealthRecordsWorkbook(studentsList, schoolContext = {}, options = {}, io = {}) {
    const { loadTemplate, onProgress, shouldCancel } = io;
    const mode = options.mode || 'MALNUTRITION'; // 'MALNUTRITION', 'EYES', 'BOTH'

    if (!Array.isArray(studentsList) || !studentsList.length) {
      throw new Error('قائمة الطلاب فارغة.');
    }

    // تحميل القالب المعتمد
    let tplBytes = null;
    if (typeof loadTemplate === 'function') {
      tplBytes = await loadTemplate(TEMPLATE_FILE);
    } else {
      const resp = await fetch(chrome.runtime.getURL(TEMPLATE_FILE));
      if (!resp.ok) throw new Error(`تعذر تحميل القالب المضمن: ${TEMPLATE_FILE}`);
      tplBytes = new Uint8Array(await resp.arrayBuffer());
    }

    if (typeof XLSX === 'undefined') {
      throw new Error('مكتبة XLSX غير محملة.');
    }

    const templateWb = XLSX.read(tplBytes, { type: 'array', cellStyles: true });

    // تقسيم الطلاب إلى فصول
    const groups = {};
    for (const st of studentsList) {
      const grade = String(st['الصف'] || st.grade || st.gradeName || 'صف عام').trim();
      const cls = String(st['الفصل'] || st.className || st.class || '1').trim();
      const key = `${grade} - فصل ${cls}`;
      if (!groups[key]) groups[key] = { grade, cls, students: [] };
      groups[key].students.push(st);
    }

    const schoolRaw = schoolContext.schoolName || schoolContext.school || 'المدرسة';
    const adminRaw = schoolContext.administration || schoolContext.admin || 'الإدارة التعليمية';
    const yearRaw = schoolContext.academicYear || schoolContext.year || '2026-2027';

    const cleanSchool = schoolRaw.replace(/^مدرسة\s+/i, '').trim();
    const cleanAdmin = adminRaw.replace(/^(?:إدارة|ادارة)\s+/i, '').replace(/\s*التعليمية$/i, '').trim();

    const resultWb = {
      SheetNames: [],
      Sheets: {}
    };

    const groupKeys = Object.keys(groups);
    const totalGroups = groupKeys.length;

    for (let gIdx = 0; gIdx < totalGroups; gIdx++) {
      if (typeof shouldCancel === 'function' && shouldCancel()) {
        const err = new Error('USER_ABORTED');
        err.code = 'USER_ABORTED';
        throw err;
      }

      const groupKey = groupKeys[gIdx];
      const grp = groups[groupKey];
      const students = grp.students;

      if (typeof onProgress === 'function') {
        onProgress(gIdx + 1, totalGroups, groupKey);
      }

      // فرز الطلاب: ترتيب أبجدي للبنين ثم البنات (أو ترتيب القائمة المعتمد)
      students.sort((a, b) => {
        const nameA = String(a['اسم الطالب'] || a.name || a.studentName || '');
        const nameB = String(b['اسم الطالب'] || b.name || b.studentName || '');
        return nameA.localeCompare(nameB, 'ar');
      });

      // 1. ورقة أمراض سوء التغذية (إذا كانت مطلوبة)
      if (mode === 'MALNUTRITION' || mode === 'BOTH') {
        const tplSheet = templateWb.Sheets['امراض سوء التغذية'];
        if (tplSheet) {
          const ws = JSON.parse(JSON.stringify(tplSheet)); // استنساخ عميق للورقة بتنسيقاتها
          ws['!views'] = [{ rightToLeft: true }];

          // كتابة الترويسة
          if (ws.A1) ws.A1.v = `الإدارة : إدارة ${cleanAdmin} التعليمية`;
          if (ws.A4) ws.A4.v = ` المدرسة : مدرسة ${cleanSchool} (${grp.grade} - ${grp.cls})`;

          // كتابة صفوف الطلاب
          for (let i = 0; i < students.length; i++) {
            const st = students[i];
            const r = 6 + i; // الصفوف تبدأ من 6
            const sName = String(st['اسم الطالب'] || st.name || st.studentName || '').trim();
            const sNid = String(st['الرقم القومي'] || st.nationalId || st.nid || '').trim();
            const sPhone = String(st['تليفون ولي الأمر'] || st.phone || st.guardianPhone || '').trim();

            ws[`A${r}`] = { t: 'n', v: i + 1 };
            ws[`B${r}`] = { t: 's', v: sName };
            ws[`C${r}`] = { t: 's', v: sNid };
            ws[`D${r}`] = { t: 's', v: sPhone };
          }

          // تحديث نطاق الورقة
          const lastRow = Math.max(51, 6 + students.length);
          ws['!ref'] = `A1:K${lastRow}`;

          const sheetTitle = `تغذية_${grp.grade}_ف${grp.cls}`.replace(/[\/\\:*?\[\]]/g, '_').slice(0, 31);
          resultWb.SheetNames.push(sheetTitle);
          resultWb.Sheets[sheetTitle] = ws;
        }
      }

      // 2. ورقة فحص العيون (إذا كانت مطلوبة)
      if (mode === 'EYES' || mode === 'BOTH') {
        const tplSheet = templateWb.Sheets['العيون'];
        if (tplSheet) {
          const ws = JSON.parse(JSON.stringify(tplSheet));
          ws['!views'] = [{ rightToLeft: true }];

          if (ws.A3) ws.A3.v = `الادارة : إدارة ${cleanAdmin} التعليمية`;
          if (ws.A5) ws.A5.v = `المدرسة : مدرسة ${cleanSchool}`;
          if (ws.G5) ws.G5.v = `الصف : ${grp.grade} / فصل ${grp.cls}`;

          for (let i = 0; i < students.length; i++) {
            const st = students[i];
            const r = 9 + i; // تبدأ من 9
            const sName = String(st['اسم الطالب'] || st.name || st.studentName || '').trim();
            const sPhone = String(st['تليفون ولي الأمر'] || st.phone || st.guardianPhone || '').trim();

            ws[`A${r}`] = { t: 'n', v: i + 1 };
            ws[`B${r}`] = { t: 's', v: sName };
            ws[`C${r}`] = { t: 's', v: `${grp.grade} / ${grp.cls}` };
            ws[`D${r}`] = { t: 's', v: sPhone };
          }

          const lastRow = Math.max(59, 9 + students.length);
          ws['!ref'] = `A1:K${lastRow}`;

          const sheetTitle = `عيون_${grp.grade}_ف${grp.cls}`.replace(/[\/\\:*?\[\]]/g, '_').slice(0, 31);
          resultWb.SheetNames.push(sheetTitle);
          resultWb.Sheets[sheetTitle] = ws;
        }
      }
    }

    return resultWb;
  }

  global.NeprasHealthRecords = Object.freeze({
    TEMPLATE_FILE,
    buildHealthRecordsWorkbook
  });

})(typeof window !== 'undefined' ? window : this);
