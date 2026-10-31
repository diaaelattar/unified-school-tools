/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة الملف الرقمي والبحث الشامل للطالب (Student Digital Dossier & Universal Search)
 * تتيح البحث الفوري بالاسم، الرقم القومي، كود الطالب، أو هاتف ولي الأمر
 * وتعرض بطاقة مجمعة تضم: البيانات الشخصية، الصف والفصل، المصروفات، التابلت، الغياب، والأشقاء بالمدرسة.
 */
'use strict';

(function(global) {
  if (global.NeprasStudentDossier) return;

  function toLatinDigits(val) {
    if (global.NeprasEgypt?.toLatinDigits) {
      return global.NeprasEgypt.toLatinDigits(val);
    }
    return String(val ?? '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  }

  function normalizeSearchText(str) {
    if (!str) return '';
    return toLatinDigits(String(str))
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/عبد\s+/g, 'عبد')
      .replace(/ابو\s+/g, 'ابو')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function cleanPhone(phone) {
    return toLatinDigits(String(phone || '')).replace(/\D/g, '');
  }

  /**
   * محرك البحث الشامل للطلاب
   * @param {Array} studentsList قائمة طلاب المدرسة
   * @param {string} query عبارة البحث (اسم، كود، قومي، أو هاتف)
   * @param {number} maxResults الحد الأقصى للنتائج
   */
  function searchStudents(studentsList, query, maxResults = 25) {
    if (!Array.isArray(studentsList) || !studentsList.length) return [];
    const qRaw = String(query || '').trim();
    if (!qRaw) return [];

    const qNorm = normalizeSearchText(qRaw);
    const qDigits = toLatinDigits(qRaw).replace(/\D/g, '');

    const results = [];

    for (let i = 0; i < studentsList.length; i++) {
      const raw = studentsList[i];
      if (!raw || typeof raw !== 'object') continue;

      const normSt = global.NeprasStatsDashboard?.normalizeStudentRecord
        ? global.NeprasStatsDashboard.normalizeStudentRecord(raw)
        : raw;

      const code = String(normSt.code || raw['كود التلميذ'] || raw.studentCode || '').trim();
      const nid = toLatinDigits(String(normSt.nid || normSt.nationalId || raw['الرقم القومي'] || '')).trim();
      const name = String(normSt.name || raw['اسم التلميذ'] || raw.fullName || '').trim();
      const mother = String(normSt.mother || raw['اسم الأم'] || raw.motherFullName || '').trim();
      const father = String(normSt.fatherName || raw['اسم الأب'] || raw.fatherFullName || '').trim();
      const phone = cleanPhone(normSt.phone || raw['رقم المحمول'] || raw.mobile || raw.phone);

      const normName = normalizeSearchText(name);
      const normFather = normalizeSearchText(father);
      const normMother = normalizeSearchText(mother);

      let score = 0;
      let matchReason = '';

      // 1. تطابق الكود التام أو الجزئي
      if (qDigits && code) {
        if (code === qDigits) {
          score += 100;
          matchReason = 'تطابق كود التلميذ';
        } else if (code.includes(qDigits)) {
          score += 60;
          matchReason = 'تطابق جزئي لكود التلميذ';
        }
      }

      // 2. تطابق الرقم القومي
      if (qDigits && nid) {
        if (nid === qDigits) {
          score += 100;
          matchReason = 'تطابق الرقم القومي';
        } else if (nid.includes(qDigits)) {
          score += 70;
          matchReason = 'تطابق جزئي للرقم القومي';
        }
      }

      // 3. تطابق رقم الهاتف
      if (qDigits.length >= 6 && phone && phone.includes(qDigits)) {
        score += 80;
        matchReason = 'تطابق رقم هاتف ولي الأمر';
      }

      // 4. تطابق الاسم
      if (qNorm.length >= 2) {
        if (normName === qNorm) {
          score += 100;
          matchReason = 'تطابق الاسم بالكامل';
        } else if (normName.startsWith(qNorm)) {
          score += 85;
          matchReason = 'يبدأ بالاسم المبحوث عنه';
        } else if (normName.includes(qNorm)) {
          score += 50;
          matchReason = 'يحتوي على الاسم';
        } else {
          // فحص كلمات متعددة
          const qWords = qNorm.split(' ').filter(w => w.length >= 2);
          if (qWords.length > 1) {
            const allFound = qWords.every(w => normName.includes(w) || normFather.includes(w) || normMother.includes(w));
            if (allFound) {
              score += 75;
              matchReason = 'تطابق مقاطع الاسم';
            }
          }
        }
      }

      if (score > 0) {
        results.push({
          score,
          matchReason,
          student: normSt,
          raw
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /**
   * اكتشاف الأشقاء المقيدين في نفس المدرسة
   */
  function findSiblings(targetStudent, allStudents) {
    if (!targetStudent || !Array.isArray(allStudents)) return [];

    const normTarget = global.NeprasStatsDashboard?.normalizeStudentRecord
      ? global.NeprasStatsDashboard.normalizeStudentRecord(targetStudent)
      : targetStudent;

    const targetCode = String(normTarget.code || '').trim();
    const targetNid = toLatinDigits(String(normTarget.nid || normTarget.nationalId || '')).trim();
    const targetFather = normalizeSearchText(normTarget.fatherName || '');
    const targetMother = normalizeSearchText(normTarget.mother || normTarget.motherName || '');
    const targetPhone = cleanPhone(normTarget.phone || normTarget.mobile || '');

    const targetNameParts = normalizeSearchText(normTarget.name || '').split(' ').filter(Boolean);
    const targetFamilyName = targetNameParts.slice(1, 4).join(' '); // اسم الأب والجد

    const siblings = [];

    for (const other of allStudents) {
      if (!other || typeof other !== 'object') continue;
      const normOther = global.NeprasStatsDashboard?.normalizeStudentRecord
        ? global.NeprasStatsDashboard.normalizeStudentRecord(other)
        : other;

      const otherCode = String(normOther.code || '').trim();
      const otherNid = toLatinDigits(String(normOther.nid || normOther.nationalId || '')).trim();

      // تجنب مطابقة الطالب مع نفسه
      if (targetCode && otherCode && targetCode === otherCode) continue;
      if (targetNid && otherNid && targetNid === otherNid) continue;

      const otherFather = normalizeSearchText(normOther.fatherName || '');
      const otherMother = normalizeSearchText(normOther.mother || normOther.motherName || '');
      const otherPhone = cleanPhone(normOther.phone || normOther.mobile || '');

      const otherNameParts = normalizeSearchText(normOther.name || '').split(' ').filter(Boolean);
      const otherFamilyName = otherNameParts.slice(1, 4).join(' ');

      let isMatch = false;
      let relationNote = '';

      // تطابق اسم الأم أولاً (أقوى رابط للأشقاء)
      if (targetMother && otherMother && targetMother.length >= 6) {
        if (targetMother === otherMother || (global.NeprasStatsDashboard?.checkMotherMatch && global.NeprasStatsDashboard.checkMotherMatch(targetMother, otherMother).match)) {
          isMatch = true;
          relationNote = 'تطابق اسم الأم تماماً';
        }
      }

      // تطابق اسم الأب / العائلة (3 مقاطع على الأقل)
      if (!isMatch && targetFamilyName && otherFamilyName && targetFamilyName.length >= 6) {
        if (targetFamilyName === otherFamilyName) {
          // تطابق مع هاتف ولي الأمر واسم الأم المشترك (إن وجدا وبشكل صريح وغير فارغ)
          const hasSamePhone = targetPhone && otherPhone && targetPhone === otherPhone;
          const hasSameMother = targetMother && otherMother && targetMother === otherMother;

          if (hasSamePhone && hasSameMother) {
            isMatch = true;
            relationNote = 'شقيق (نفس الأب والأم والهاتف)';
          } else if (hasSameMother) {
            isMatch = true;
            relationNote = 'شقيق (نفس الأب والأم)';
          } else if (hasSamePhone) {
            isMatch = true;
            relationNote = 'شقيق (نفس الأب ورقم الهاتف)';
          } else if (targetNameParts.length >= 3 && otherNameParts.length >= 3) {
            isMatch = true;
            relationNote = `شقيق (نفس اسم الأب والجد: ${targetFamilyName})`;
          }
        }
      }

      // تطابق رقم هاتف ولي الأمر مع تطابق اسم الأب
      if (!isMatch && targetPhone && otherPhone && targetPhone.length >= 8 && targetPhone === otherPhone) {
        if (targetNameParts[1] && otherNameParts[1] && targetNameParts[1] === otherNameParts[1]) {
          isMatch = true;
          relationNote = 'شقيق (نفس هاتف ولي الأمر واسم الأب)';
        }
      }

      if (isMatch) {
        siblings.push({
          student: normOther,
          relationNote
        });
      }
    }

    return siblings;
  }

  /**
   * ربط وتجميع كافة مصادر بيانات الطالب (البيانات، المصروفات، التابلت، الغياب، الأشقاء)
   */
  async function buildStudentDossier(studentRaw, allStudentsList = []) {
    const norm = global.NeprasStatsDashboard?.normalizeStudentRecord
      ? global.NeprasStatsDashboard.normalizeStudentRecord(studentRaw)
      : (studentRaw || {});

    const code = String(norm.code || norm['كود التلميذ'] || norm.studentCode || '').trim();
    const nid = toLatinDigits(String(norm.nid || norm.nationalId || norm['الرقم القومي'] || '')).trim();

    // 1. حسابات السن وتاريخ الميلاد والمحافظة والنوع
    const ageInfo = global.NeprasStatsDashboard?.calculateAgePartsOnOct1
      ? global.NeprasStatsDashboard.calculateAgePartsOnOct1(nid)
      : { y: '', m: '', d: '', fullDob: '' };

    const nidInfo = global.NeprasStatsDashboard?.decodeNID
      ? global.NeprasStatsDashboard.decodeNID(nid)
      : null;

    const gender = norm.gender || nidInfo?.gender || 'غير محدد';
    const birthGov = norm.birthGov || nidInfo?.governorate || 'غير محدد';
    const dob = ageInfo.fullDob || nidInfo?.birthDate || 'غير مسجل';

    // 2. الموقف المالي (المصروفات والإعفاءات)
    let expenseStatus = {
      isPaid: false,
      statusLabel: 'غير مسدد',
      badgeClass: 'badge-unpaid',
      exemptionType: '',
      discountRatio: '',
      amountDue: '',
      receiptNumber: '',
      paymentDate: ''
    };

    // فحص ما إذا كان السجل المباشر للطالب يحمل علامة سداد مسبقة
    const rawPaidStr = String(norm['سداد المصروفات'] || norm['المصروفات'] || norm['مسدد'] || norm.paid || norm.status || '').trim();
    if (norm.paid === true || /^(?:نعم|مسدد|خالص|1|true)$/i.test(rawPaidStr) || /مسدد/.test(rawPaidStr)) {
      expenseStatus.isPaid = true;
      expenseStatus.statusLabel = 'مسدد بالكامل';
      expenseStatus.badgeClass = 'badge-success';
    }

    try {
      const expStore = await chrome.storage.local.get(['neprasExpensesAnalysisV1', 'neprasExpensesStatsV1', 'nepras_expenses_cache']);
      const expStats = expStore?.neprasExpensesAnalysisV1 || expStore?.neprasExpensesStatsV1 || expStore?.nepras_expenses_cache;
      const expRows = expStats?.rows || expStats?.detailRows || (Array.isArray(expStats) ? expStats : []);
      if (Array.isArray(expRows) && expRows.length) {
        const expMatch = expRows.find(r => {
          const rCode = String(r.code || r['كود التلميذ'] || r.studentCode || '').trim();
          const rNid = toLatinDigits(String(r.nid || r.nationalId || r['الرقم القومي'] || '')).trim();
          return (code && rCode === code) || (nid && rNid === nid);
        });

        if (expMatch) {
          const isPaid = expMatch.paid === true || expMatch.isPaid === true || /مسدد|نعم|خالص|1/.test(String(expMatch.financeStatus || expMatch.paid || expMatch.status || ''));
          const isHomes = expMatch.isHome === true || /منازل/.test(String(expMatch.mode || norm.mode || expMatch.financeStatus || ''));
          const exCode = String(expMatch.exemptionCode || expMatch.exemptionType || expMatch['نوع الإعفاء'] || '').trim();
          const isFullExempt = expMatch.exemptionClass === 'full' || expMatch.isFullExempt || /كامل|قرار|100%/.test(String(expMatch.discount || expMatch.financeStatus || ''));
          const isPartial = expMatch.exemptionClass === 'partial' || expMatch.isPartialExempt || /50%|تخفيض|نصف/.test(String(expMatch.discount || expMatch.financeStatus || ''));

          if (isHomes) {
            expenseStatus.statusLabel = 'طالب منازل (رسوم خاصة)';
            expenseStatus.badgeClass = 'badge-info';
          } else if (isPaid) {
            expenseStatus.isPaid = true;
            expenseStatus.statusLabel = 'مسدد بالكامل';
            expenseStatus.badgeClass = 'badge-success';
          } else if (isFullExempt || exCode === '5' || exCode.includes('تكافل')) {
            expenseStatus.statusLabel = 'إعفاء كامل وفق القرار الوزاري';
            expenseStatus.badgeClass = 'badge-exempt';
            expenseStatus.exemptionType = exCode || 'مشروطية التعليم / تكافل وكرامة';
          } else if (isPartial) {
            expenseStatus.statusLabel = 'تخفيض 50% وفق القرار';
            expenseStatus.badgeClass = 'badge-warning';
            expenseStatus.discountRatio = '50%';
          } else {
            expenseStatus.statusLabel = 'مطلوب السداد (غير مسدد)';
            expenseStatus.badgeClass = 'badge-danger';
          }

          expenseStatus.receiptNumber = expMatch.receiptNumber || expMatch['رقم الإيصال'] || '';
          expenseStatus.paymentDate = expMatch.paymentDate || expMatch['تاريخ السداد'] || '';
        }
      }
    } catch (_) {}

    // 3. أجهزة التابلت المدرسي
    let tabletStatus = {
      applicable: /ثانوي|صناعي|فني/i.test(String(norm.grade || '')),
      delivered: false,
      serialNumber: '',
      imei: '',
      statusLabel: 'لم يتم التسليم بعد'
    };

    try {
      const tabStore = await chrome.storage.local.get(['neprasTabletData', 'neprasCachedTabletList']);
      const tabList = tabStore?.neprasCachedTabletList || tabStore?.neprasTabletData?.rows || [];
      if (Array.isArray(tabList) && tabList.length) {
        const tabMatch = tabList.find(t => {
          const tCode = String(t.code || t['كود التلميذ'] || t.studentCode || '').trim();
          const tNid = toLatinDigits(String(t.nid || t.nationalId || t['الرقم القومي'] || '')).trim();
          return (code && tCode === code) || (nid && tNid === nid);
        });

        if (tabMatch) {
          tabletStatus.delivered = true;
          tabletStatus.statusLabel = 'تم استلام وتسجيل التابلت بنجاح';
          tabletStatus.serialNumber = tabMatch.serial || tabMatch.serialNumber || tabMatch['الرقم المسلسل'] || tabMatch['السيريال'] || '';
          tabletStatus.imei = tabMatch.imei || tabMatch['IMEI'] || tabMatch['رقم IMEI'] || '';
        }
      }
    } catch (_) {}

    // 4. الغياب والمواظبة والإنذارات
    let absenceInfo = {
      totalDays: 0,
      continuousDays: 0,
      separatedDays: 0,
      warningStatus: 'منتظم (لا توجد إنذارات مستحقة)',
      badgeClass: 'badge-success',
      records: []
    };

    try {
      const absStore = await chrome.storage.local.get(['neprasAbsenceStats', 'neprasCachedAbsenceList']);
      const absList = absStore?.neprasCachedAbsenceList || absStore?.neprasAbsenceStats?.rows || [];
      if (Array.isArray(absList) && absList.length) {
        const absMatch = absList.find(a => {
          const aCode = String(a.code || a['كود التلميذ'] || a['كود الطالب'] || a.studentCode || '').trim();
          const aNid = toLatinDigits(String(a.nid || a.nationalId || a['الرقم القومي'] || '')).trim();
          return (code && aCode === code) || (nid && aNid === nid);
        });

        if (absMatch) {
          const total = Number(absMatch.totalDays || absMatch.absenceDays || absMatch.days || absMatch['أيام الغياب'] || absMatch['عدد أيام الغياب'] || absMatch['مجموع الغياب'] || 0);
          const cont = Number(absMatch.continuousDays || absMatch['الغياب المتصل'] || absMatch['متصل'] || 0);
          const sep = Number(absMatch.separatedDays || absMatch['الغياب المنفصل'] || absMatch['منفصل'] || total);

          absenceInfo.totalDays = total;
          absenceInfo.continuousDays = cont;
          absenceInfo.separatedDays = sep;

          // توافق تام مع لائحة الانضباط المدرسي وقرارات الغياب الرسمية:
          if (cont >= 15 || sep >= 30 || total >= 30) {
            absenceInfo.warningStatus = 'مفصول لتجاوز المدة القانونية (يستحق إعادة قيد)';
            absenceInfo.badgeClass = 'badge-danger';
          } else if (cont >= 10 || sep >= 20 || total >= 15) {
            absenceInfo.warningStatus = 'يستحق إنذار غياب ثالث (نهائي)';
            absenceInfo.badgeClass = 'badge-danger';
          } else if (cont >= 7 || sep >= 15 || total >= 10) {
            absenceInfo.warningStatus = 'يستحق إنذار غياب ثانٍ';
            absenceInfo.badgeClass = 'badge-warning';
          } else if (cont >= 5 || sep >= 10 || total >= 5) {
            absenceInfo.warningStatus = 'يستحق إنذار غياب أول';
            absenceInfo.badgeClass = 'badge-warning';
          } else if (total > 0) {
            absenceInfo.warningStatus = 'غياب في الحدود العادية (أقل من 5 أيام)';
            absenceInfo.badgeClass = 'badge-info';
          } else {
            absenceInfo.warningStatus = 'منتظم (لا توجد إنذارات مستحقة)';
            absenceInfo.badgeClass = 'badge-success';
          }
        }
      }
    } catch (_) {}

    // 5. الأشقاء والإخوة في المدرسة
    const siblings = findSiblings(norm, allStudentsList);

    // استخراج اسم الأب تلقائياً من اسم الطالب في حال عدم وجود عمود منفصل باسم الأب
    let derivedFather = norm.fatherName || norm.father || norm['اسم الأب'] || '';
    if (!derivedFather && norm.name) {
      const nameParts = String(norm.name).trim().split(/\s+/);
      if (nameParts.length >= 2) {
        derivedFather = nameParts.slice(1).join(' ');
      }
    }

    return {
      student: norm,
      personal: {
        code,
        nid,
        name: norm.name || 'غير مسجل',
        fatherName: derivedFather || 'غير مسجل',
        motherName: norm.mother || norm.motherName || 'غير مسجل',
        gender,
        religion: norm.religion || 'غير مسجّل بالبيانات',
        dob,
        ageStr: ageInfo.y !== '' ? `${ageInfo.y} سنة و ${ageInfo.m} شهر و ${ageInfo.d} يوم` : 'غير محدد',
        birthGov,
        address: norm.address || 'غير مسجل',
        phone: norm.phone || norm.mobile || 'غير مسجل'
      },
      academic: {
        grade: norm.grade || 'غير محدد',
        cls: norm.cls || 'بدون فصل',
        mode: norm.mode || 'نظامي',
        status: norm.status || 'غير مسجل',
        lang1: norm.lang1 || 'اللغة الإنجليزية',
        lang2: (() => {
          const l2 = String(norm.lang2 || '').trim();
          if (!l2 || /^(not\s*allowed|not_allowed|notallowed|none|n\/?a|معف[ىي]|غير\s*مسموح|لا\s*يوجد)$/i.test(l2)) {
            return 'معفى';
          }
          return l2;
        })(),
        section: norm.section || norm.specialization || 'عام',
        integration: norm.isIntegrated ? (norm.integrationType || 'طالب دمج معتمد') : 'غير مدمج'
      },
      expenses: expenseStatus,
      tablet: tabletStatus,
      absence: absenceInfo,
      siblings
    };
  }

  // تصدير الوحدة للنطاق العام
  global.NeprasStudentDossier = {
    searchStudents,
    findSiblings,
    buildStudentDossier,
    normalizeSearchText
  };

})(typeof window !== 'undefined' ? window : this);
