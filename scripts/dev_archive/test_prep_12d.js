'use strict';

const assert = require('assert');
const path = require('path');
const NeprasPrep12D = require('../modules/prep_12d.js');

console.log('prep_12d');

// 1. اختبار فحص الصفحة وقراءة الملخص من الـ HTML المرفق للوزارة
{
  const mockHtmlSnippet = `
    <div class="card-body">
      <div class="infoRegisterItems">
        <span class="totalRegister"><label>إجمالى عدد المقيدين</label><strong>1002</strong></span>
        <span class="successregisterMembers"><label>عدد الطلبة المسجلين علي الاستمارة</label><strong>891</strong></span>
        <span class="failregisterMembers"><label>عدد الطلبة الذين تخلفوا عن التسجيل</label><strong>111</strong></span>
      </div>
      <div class="buttonBlock">
        <button class="btn btn-info">إظهار الطلاب الذين تخلفو عن التسجيل</button>
        <button class="btn btn-success"> الطلاب الذين قاموا بتسجيل الاستمارة</button>
      </div>
      <table>
        <thead>
          <tr><th>كود التلميذ</th><th>اسم التلميذ</th><th>استمارة التقدم للامتحان</th></tr>
        </thead>
        <tbody>
          <tr><td>472362764</td><td>ابانوب شنوده عاطف شنوده</td><td><button>تسجيل الاستمارة</button></td></tr>
          <tr><td>474531474</td><td>احمد حسن حامد احمد</td><td><button>تسجيل الاستمارة</button></td></tr>
        </tbody>
      </table>
    </div>
  `;

  // محاكاة DOM بسيطة
  const createMockElement = (html) => {
    return {
      querySelector(sel) {
        if (sel === '.infoRegisterItems') return {};
        if (sel === '.totalRegister strong') return { textContent: '1002' };
        if (sel === '.successregisterMembers strong') return { textContent: '891' };
        if (sel === '.failregisterMembers strong') return { textContent: '111' };
        return null;
      },
      querySelectorAll(sel) {
        if (sel === 'button') {
          return [
            { textContent: 'إظهار الطلاب الذين تخلفو عن التسجيل' },
            { textContent: 'الطلاب الذين قاموا بتسجيل الاستمارة' }
          ];
        }
        if (sel === 'th') {
          return [
            { textContent: 'كود التلميذ' },
            { textContent: 'اسم التلميذ' },
            { textContent: 'استمارة التقدم للامتحان' }
          ];
        }
        if (sel === 'table tbody tr') {
          return [
            {
              querySelectorAll: () => [
                { textContent: '472362764' },
                { textContent: 'ابانوب شنوده عاطف شنوده' },
                { textContent: 'تسجيل الاستمارة' }
              ]
            },
            {
              querySelectorAll: () => [
                { textContent: '474531474' },
                { textContent: 'احمد حسن حامد احمد' },
                { textContent: 'تسجيل الاستمارة' }
              ]
            }
          ];
        }
        return [];
      }
    };
  };

  const mockDoc = createMockElement(mockHtmlSnippet);
  assert.strictEqual(NeprasPrep12D.isPrepRegisterPage(mockDoc), true, 'يجب التعرف على صفحة تسجيل الشهادة الإعدادية بنجاح');

  const summary = NeprasPrep12D.readSummaryFromPage(mockDoc);
  assert.strictEqual(summary.total, 1002, 'إجمالي المقيدين يجب أن يكون 1002');
  assert.strictEqual(summary.registered, 891, 'المسجلون يجب أن يكون 891');
  assert.strictEqual(summary.missing, 111, 'المتخلفون يجب أن يكون 111');
  assert.strictEqual(summary.percentage, 88.92, 'النسبة المئوية يجب أن تكون 88.92%');

  const rows = NeprasPrep12D.extractVisibleTableRows(mockDoc);
  assert.strictEqual(rows.length, 2, 'يجب استخراج صفين من الجدول المعروض');
  assert.strictEqual(rows[0].code, '472362764');
  assert.strictEqual(rows[0].name, 'ابانوب شنوده عاطف شنوده');
  assert.strictEqual(rows[1].code, '474531474');

  console.log('  ✓ فحص صفحة استمارة الإعدادية وقراءة الملخص والأكواد من الـ DOM');
}

// 2. اختبار فحص وإلغاء حجب أزرار كشف 12 د الوزارية
{
  const mockButton = {
    textContent: 'طباعة كشف 12 د الرسمي (PDF)',
    className: 'btn btn-primary',
    disabled: true,
    style: { display: 'none' },
    hasAttribute: (attr) => attr === 'hidden',
    removeAttribute: () => {},
    setAttribute: () => {}
  };

  const mockDocWithHiddenBtn = {
    querySelectorAll(sel) {
      if (sel.includes('button')) return [mockButton];
      return [];
    }
  };

  const revealedCount = NeprasPrep12D.revealHidden12DButtons(mockDocWithHiddenBtn);
  assert.strictEqual(revealedCount, 1, 'يجب إظهار زر كشف 12 د المحجوب');
  assert.strictEqual(mockButton.disabled, false, 'يجب إزالة خاصية التعطيل disabled');
  assert.strictEqual(mockButton.style.display, 'inline-block', 'يجب إظهار الزر عبر display');

  console.log('  ✓ إلغاء حجب وإظهار أزرار كشف 12 د الرسمية');
}

// 3. اختبار حساب الإحصائيات الصارمة (بدون تخمين) وتوليد الجدول التقاطعي المعتمد
{
  const mockSchoolStudents = [
    {
      code: '472362764',
      name: 'ابانوب شنوده عاطف شنوده',
      nid: '30901011234567',
      gender: 'بنين',
      religion: 'مسيحي',
      status: 'مستجد',
      grade: 'الصف الثالث الإعدادي',
      cls: '3/1',
      phone: '01222222222'
    },
    {
      code: '474531474',
      name: 'احمد حسن حامد احمد',
      nid: '30902021234578',
      gender: 'بنين',
      religion: 'مسلم',
      status: 'مستجد',
      grade: 'الصف الثالث الإعدادي',
      cls: '3/1',
      phone: '01011111111'
    },
    {
      code: '474420479',
      name: 'مريم جرجس ميخائيل',
      nid: '30903031234568',
      gender: 'بنات',
      religion: 'مسيحي',
      status: 'باقٍ للإعادة',
      grade: 'الصف الثالث الإعدادي',
      cls: '3/2',
      phone: '01133333333'
    },
    {
      code: '479683403',
      name: 'فاطمة محمد علي حسن',
      nid: '30904041234589',
      gender: 'بنات',
      religion: 'مسلم',
      status: 'مستجد',
      grade: 'الصف الثالث الإعدادي',
      cls: '3/2',
      phone: '01044444444'
    }
  ];

  // لنفترض أن الطالبين الأول والرابع مسجلان، والثاني والثالث متخلفان عن التسجيل
  const missingCodes = ['474531474', '474420479'];

  const stats = NeprasPrep12D.computeStrict12DStats(mockSchoolStudents, { missingCodes });

  assert.strictEqual(stats.summary.totalStudents, 4, 'إجمالي الطلاب 4');
  assert.strictEqual(stats.summary.registeredCount, 2, 'المسجلون 2');
  assert.strictEqual(stats.summary.missingCount, 2, 'المتخلفون 2');
  assert.strictEqual(stats.summary.registeredPct, 50);

  // فحص المتخلفين وتوافر هواتفهم وفصولهم
  assert.strictEqual(stats.missingStudents.length, 2);
  const ahmed = stats.missingStudents.find(s => s.code === '474531474');
  assert.ok(ahmed, 'يجب أن يكون أحمد ضمن كشف المتخلفين');
  assert.strictEqual(ahmed.phone, '01011111111', 'يجب ربط هاتف ولي الأمر بدقة');
  assert.strictEqual(ahmed.cls, '3/1', 'يجب ربط فصل الطالب بدقة');

  // فحص الجدول التقاطعي الصارم لنموذج 12 د
  const m = stats.matrix12D;
  // مستجد:
  // بنين مسيحي (ابانوب): مسجل
  assert.strictEqual(m.mostajad.maleChristian.reg, 1);
  // بنين مسلم (احمد): متخلف
  assert.strictEqual(m.mostajad.maleMuslim.reg, 0);
  assert.strictEqual(m.mostajad.maleMuslim.miss, 1);
  // بنات مسلم (فاطمة): مسجلة
  assert.strictEqual(m.mostajad.femaleMuslim.reg, 1);

  // باقٍ للإعادة:
  // بنات مسيحي (مريم): متخلفة
  assert.strictEqual(m.baq.femaleChristian.miss, 1);
  assert.strictEqual(m.baq.femaleChristian.reg, 0);

  // الإجمالي العام للمصفوفة:
  assert.strictEqual(m.grandTotal.total.reg, 2, 'جملة المسجلين في المصفوفة يجب أن تطابق 2');
  assert.strictEqual(m.grandTotal.total.miss, 2, 'جملة المتخلفين في المصفوفة يجب أن تطابق 2');
  assert.strictEqual(m.grandTotal.total.total, 4, 'جملة الطلاب في المصفوفة يجب أن تطابق 4');

  console.log('  ✓ حساب إحصاء 12 د الصارم والجدول التقاطعي والربط مع هواتف وفصول المتخلفين');
}

// 4. اختبار توليد قوالب ملفات Excel
{
  const mockXlsx = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: (aoa) => ({ aoa, '!cols': [], '!views': [] }),
      book_append_sheet: (wb, ws, name) => {
        wb.SheetNames.push(name);
        wb.Sheets[name] = ws;
      }
    }
  };

  const sampleMissing = [
    { code: '111', name: 'طالب 1', nid: '309', cls: '3/1', phone: '010', status: 'مستجد', religion: 'مسلم' }
  ];

  const rescueWb = NeprasPrep12D.buildMissingRescueWorkbook(sampleMissing, { school: 'مدرسة النور' }, mockXlsx);
  assert.strictEqual(rescueWb.SheetNames[0], 'المتخلفون عن التسجيل');

  const sampleStats = {
    summary: { totalStudents: 1, registeredCount: 1, missingCount: 0, registeredPct: 100 },
    byGender: { male: { total: 1, registered: 1, missing: 0 }, female: { total: 0, registered: 0, missing: 0 } },
    byReligion: { muslim: { total: 1, registered: 1, missing: 0 }, christian: { total: 0, registered: 0, missing: 0 } },
    matrix12D: {
      mostajad: { maleMuslim: { reg: 1 }, maleChristian: { reg: 0 }, femaleMuslim: { reg: 0 }, femaleChristian: { reg: 0 }, total: { reg: 1, total: 1 } },
      baq: { maleMuslim: { reg: 0 }, maleChristian: { reg: 0 }, femaleMuslim: { reg: 0 }, femaleChristian: { reg: 0 }, total: { reg: 0, total: 0 } },
      other: { maleMuslim: { reg: 0 }, maleChristian: { reg: 0 }, femaleMuslim: { reg: 0 }, femaleChristian: { reg: 0 }, total: { reg: 0, total: 0 } },
      grandTotal: { maleMuslim: { reg: 1 }, maleChristian: { reg: 0 }, femaleMuslim: { reg: 0 }, femaleChristian: { reg: 0 }, total: { reg: 1, total: 1 } }
    }
  };

  const previewWb = NeprasPrep12D.buildPrep12DPreviewWorkbook(
    [{ code: '111', name: 'طالب 1', nid: '309', gender: 'بنين', religion: 'مسلم', status: 'مستجد', cls: '3/1' }],
    sampleStats,
    { school: 'مدرسة النور' },
    mockXlsx
  );
  assert.strictEqual(previewWb.SheetNames[0], 'إحصاء 12 د المعتمد');
  assert.strictEqual(previewWb.SheetNames[1], 'كشف 12 د للطلاب المسجلين');

  console.log('  ✓ بناء مصنفات Excel لكشف إنقاذ المتخلفين وكشف 12 د التمهيدي والإحصاء');
}

// 5. اختبار بناء صفحة الطباعة الرسمية A4
{
  const html = NeprasPrep12D.buildHtmlPrintout({
    summary: { totalStudents: 1002, registeredCount: 891, missingCount: 111, registeredPct: 88.92, missingPct: 11.08 },
    matrix12D: {
      mostajad: { maleMuslim: { reg: 400 }, maleChristian: { reg: 50 }, femaleMuslim: { reg: 380 }, femaleChristian: { reg: 40 }, total: { reg: 870, total: 980 } },
      baq: { maleMuslim: { reg: 10 }, maleChristian: { reg: 1 }, femaleMuslim: { reg: 9 }, femaleChristian: { reg: 1 }, total: { reg: 21, total: 22 } },
      other: { maleMuslim: { reg: 0 }, maleChristian: { reg: 0 }, femaleMuslim: { reg: 0 }, femaleChristian: { reg: 0 }, total: { reg: 0, total: 0 } },
      grandTotal: { maleMuslim: { reg: 410 }, maleChristian: { reg: 51 }, femaleMuslim: { reg: 389 }, femaleChristian: { reg: 41 }, total: { reg: 891, total: 1002 } }
    }
  }, { schoolName: 'مدرسة الحسينية الإعدادية', administration: 'شرق' });

  assert.ok(html.includes('استمارة إحصاء المتقدمين للامتحان (كشف 12 د)'));
  assert.ok(html.includes('1002'));
  assert.ok(html.includes('891'));
  assert.ok(html.includes('مدرسة الحسينية الإعدادية'));
  assert.ok(html.includes('window.print()'));

  console.log('  ✓ إنشاء كود HTML للطباعة الرسمية A4 مع توقيعات اللجان المعتمدة');
}

// 6. اختبار تفريغ كود الصفحة أو الأكواد المنسوخة مباشرة
{
  const rawTextWithCodes = `
    472362764
    474531474
    474420479
  `;
  const parsed = NeprasPrep12D.parseFromHtmlOrText(rawTextWithCodes);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.codes.length, 3);
  assert.strictEqual(parsed.codes[0], '472362764');

  console.log('  ✓ تفريغ وتحليل كود الصفحة والأكواد المنسوخة يدوياً');
}

console.log('prep_12d: 6 ناجح، 0 فاشل');
