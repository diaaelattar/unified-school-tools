'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// محاكاة chrome.storage.local
const fakeStorage = {};
global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const res = {};
        for (const k of keys) {
          if (fakeStorage[k] !== undefined) res[k] = fakeStorage[k];
        }
        cb(res);
      },
      set: (obj, cb) => {
        Object.assign(fakeStorage, obj);
        if (cb) cb();
      },
      remove: (keys, cb) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete fakeStorage[k];
        if (cb) cb();
      }
    }
  }
};

const NeprasQuickLogin = require('../modules/quick_login.js');

test('خزنة الدخول السريع: حفظ واسترجاع ومسح بيانات الدخول بأمان', async () => {
  // 1. الحفظ
  const saveRes = await NeprasQuickLogin.saveCredentials('3201548@emis.gov.eg', 'MySecretPass123');
  assert.equal(saveRes.ok, true);
  assert.equal(saveRes.username, '3201548@emis.gov.eg');

  // التأكد من أن القيمة مخزنة مشفرة وليست نصاً صريحاً في الذاكرة
  assert.ok(fakeStorage.neprasMinistryAuthCredentials);
  assert.notEqual(fakeStorage.neprasMinistryAuthCredentials.p, 'MySecretPass123');

  // 2. الاسترجاع
  const creds = await NeprasQuickLogin.getCredentials();
  assert.ok(creds);
  assert.equal(creds.username, '3201548@emis.gov.eg');
  assert.equal(creds.password, 'MySecretPass123');

  // 3. المسح
  await NeprasQuickLogin.clearCredentials();
  const cleared = await NeprasQuickLogin.getCredentials();
  assert.equal(cleared, null);
});

test('خزنة الدخول السريع: التعرف الذكي على صفحات تسجيل دخول الوزارة ومايكروسوفت', () => {
  assert.equal(NeprasQuickLogin.isLoginPage('https://student.emis.gov.eg/login'), true);
  assert.equal(NeprasQuickLogin.isLoginPage('https://student.emis.gov.eg/Account/Login'), true);
  assert.equal(NeprasQuickLogin.isLoginPage('https://teacher.emis.gov.eg/#/login'), true);
  assert.equal(NeprasQuickLogin.isLoginPage('https://moe-register.emis.gov.eg/login'), true);
  assert.equal(NeprasQuickLogin.isLoginPage('https://login.microsoftonline.com/common/oauth2/v2.0/authorize'), true);
  assert.equal(NeprasQuickLogin.isLoginPage('https://login.live.com/login.srf'), true);
  assert.equal(NeprasQuickLogin.isLoginPage('https://student.emis.gov.eg/students/search'), false);
  assert.equal(NeprasQuickLogin.isLoginPage('https://google.com/login'), false);
});

test('خزنة الدخول السريع: تعبئة حقول Angular وإرسال الأحداث بنجاح', () => {
  // محاكاة عناصر DOM
  const events = [];
  const fakeInput = {
    value: '',
    focus() { events.push('focus'); },
    dispatchEvent(e) { events.push(e.type); }
  };
  Object.setPrototypeOf(fakeInput, {
    set value(v) { this._v = v; },
    get value() { return this._v; }
  });

  const fakePass = {
    value: '',
    type: 'password',
    focus() { events.push('focus_pass'); },
    dispatchEvent(e) { events.push(e.type); }
  };
  Object.setPrototypeOf(fakePass, {
    set value(v) { this._v = v; },
    get value() { return this._v; }
  });

  let clicked = false;
  const fakeBtn = {
    innerText: 'تسجيل الدخول',
    click() { clicked = true; }
  };

  const fakeDoc = {
    querySelectorAll(sel) {
      if (sel.includes('password')) return [fakePass];
      if (sel.includes('userName') || sel.includes('email') || sel.includes('user')) return [fakeInput];
      if (sel.includes('button')) return [fakeBtn];
      return [];
    },
    querySelector(sel) {
      if (sel.includes('password')) return fakePass;
      if (sel.includes('button') || sel.includes('submit')) return fakeBtn;
      return null;
    }
  };

  const elements = NeprasQuickLogin.findLoginElements(fakeDoc);
  assert.equal(elements.usernameInput, fakeInput);
  assert.equal(elements.passwordInput, fakePass);
  assert.equal(elements.submitButton, fakeBtn);

  const fillRes = NeprasQuickLogin.autofill(fakeDoc, {
    username: 'school_user_1',
    password: 'Password999'
  }, false);

  assert.equal(fillRes.ok, true);
  assert.equal(fillRes.filledUser, true);
  assert.equal(fillRes.filledPass, true);
  assert.equal(fakeInput.value, 'school_user_1');
  assert.equal(fakePass.value, 'Password999');
  assert.ok(events.includes('input'));
  assert.ok(events.includes('change'));
  assert.ok(events.includes('blur'));
});
