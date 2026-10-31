(() => {
  if (window.__NEPRAS_TEACHER_API_BRIDGE__) return;
  window.__NEPRAS_TEACHER_API_BRIDGE__ = true;

  const API_MATCHES = [
    '/api/Employee/GetEmployeeByEmpFlag',
    '/api/Employee/EmployeesNadb',
    '/api/Employee/GetEmployeeFullData',
    '/api/Employee/CRevisionNew01',
    // v1.0 — passive health signal only.
    // Nepras never calls this endpoint; it only observes the request
    // already issued by the ministry page.
    '/api/Helpers/GetDropDowns'
  ];

  const norm = (v) => String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();

  const post = (payload) => {
    window.postMessage({
      source: 'NEPRAS_TEACHER_API_BRIDGE',
      ...payload
    }, window.location.origin);
  };

  const matchesApi = (url) => {
    const value = String(url || '');
    return API_MATCHES.some((part) => value.includes(part));
  };

  const lastResponses = new Map();
  const fullDataByEmpCode = new Map();
  const MAX_FULLDATA_CACHE = 200;

  const cacheAndPost = (payload) => {
    const key = API_MATCHES.find((part) => String(payload.url || '').includes(part));
    if (key) lastResponses.set(key, payload);

    if (key === '/api/Employee/GetEmployeeFullData') {
      const empCode = payload?.data?.basicInfo?.empCode;
      if (empCode != null && payload?.ok && payload?.data) {
        const code = String(empCode);
        fullDataByEmpCode.set(code, payload);
        if (fullDataByEmpCode.size > MAX_FULLDATA_CACHE) {
          const firstKey = fullDataByEmpCode.keys().next().value;
          fullDataByEmpCode.delete(firstKey);
        }
      }
    }
    post(payload);
  };

  // Capture responses produced by the real Angular application.
  const NativeXHR = window.XMLHttpRequest;
  const nativeOpen = NativeXHR.prototype.open;
  const nativeSend = NativeXHR.prototype.send;
  const nativeSetRequestHeader = NativeXHR.prototype.setRequestHeader;
  const lastTeacherApiHeaders = new Map();
  let lastTeacherSessionHeaders = {};

  NativeXHR.prototype.open = function(method, url, ...rest) {
    this.__neprasUrl = String(url || '');
    this.__neprasMethod = String(method || 'GET');
    this.__neprasRequestHeaders = {};
    return nativeOpen.call(this, method, url, ...rest);
  };

  NativeXHR.prototype.setRequestHeader = function(name, value) {
    try {
      if (this.__neprasUrl && matchesApi(this.__neprasUrl)) {
        this.__neprasRequestHeaders[String(name || '').toLowerCase()] =
          String(value ?? '');
      }
    } catch (_) {}
    return nativeSetRequestHeader.call(this, name, value);
  };

  NativeXHR.prototype.send = function(body) {
    this.__neprasRequestBody = body;
    if (this.__neprasUrl && matchesApi(this.__neprasUrl)) {
      this.addEventListener('loadend', () => {
        try {
          const headerKey = API_MATCHES.find(
            part => String(this.__neprasUrl || '').includes(part)
          );
          if (headerKey && this.__neprasRequestHeaders) {
            const captured = {
              ...this.__neprasRequestHeaders
            };

            lastTeacherApiHeaders.set(
              headerKey,
              captured
            );

            // v1.0:
            // الرؤوس التالية ضرورية لبعض طلبات الموظفين.
            // تحفظ في الذاكرة فقط ولا تُكتب في storage أو console.
            const sessionKeys = [
              'authorization',
              'ut',
              'ed',
              'md',
              'sc',
              'ty'
            ];

            for (const key of sessionKeys) {
              if (
                captured[key] != null &&
                String(captured[key]) !== ''
              ) {
                lastTeacherSessionHeaders[key] =
                  String(captured[key]);
              }
            }
          }

          let json = null;
          let text = '';
          const rt = String(this.responseType || '');
          if (rt === 'json') {
            json = (this.response && typeof this.response === 'object') ? this.response : null;
            try { text = JSON.stringify(json ?? ''); } catch (_) { text = ''; }
          } else {
            try { text = String(this.responseText || ''); } catch (_) { text = ''; }
            try { json = text ? JSON.parse(text) : null; } catch (_) {
              try { json = (this.response && typeof this.response === 'object') ? this.response : null; } catch (_) {}
            }
          }

          cacheAndPost({
            type: 'API_RESPONSE',
            url: this.__neprasUrl,
            method: this.__neprasMethod,
            status: this.status,
            ok: this.status >= 200 && this.status < 300,
            data: json,
            text,
            requestBody: (() => {
              try {
                if (typeof this.__neprasRequestBody === 'string') {
                  return JSON.parse(this.__neprasRequestBody);
                }
                return this.__neprasRequestBody ?? null;
              } catch (_) {
                return this.__neprasRequestBody ?? null;
              }
            })(),
            time: Date.now()
          });
        } catch (error) {
          post({
            type: 'API_BRIDGE_ERROR',
            message: error?.message || String(error)
          });
        }
      });
    }

    return nativeSend.call(this, body);
  };

  // Also capture Fetch requests if the site ever switches implementation.

  // Notify the isolated-world content script about Angular SPA route changes.
  // The employee page is changed with router.navigateByUrl()/history.back()
  // without a full document reload, so content.js is not reinjected.
  const nativePushState = history.pushState.bind(history);
  const nativeReplaceState = history.replaceState.bind(history);
  history.pushState = function(state, title, url) {
    const result = nativePushState(state, title, url);
    try {
      window.postMessage({
        source: 'NEPRAS_TEACHER_API_BRIDGE',
        type: 'ROUTE_CHANGED',
        route: String(url || location.href),
        state: history.state || state || null,
        navigation: 'pushState',
        time: Date.now()
      }, window.location.origin);
    } catch (_) {}
    return result;
  };
  history.replaceState = function(state, title, url) {
    const result = nativeReplaceState(state, title, url);
    try {
      window.postMessage({
        source: 'NEPRAS_TEACHER_API_BRIDGE',
        type: 'ROUTE_CHANGED',
        route: String(url || location.href),
        state: history.state || state || null,
        navigation: 'replaceState',
        time: Date.now()
      }, window.location.origin);
    } catch (_) {}
    return result;
  };
  window.addEventListener('popstate', () => {
    try {
      window.postMessage({
        source: 'NEPRAS_TEACHER_API_BRIDGE',
        type: 'ROUTE_CHANGED',
        route: location.href,
        state: history.state || null,
        navigation: 'popstate',
        time: Date.now()
      }, window.location.origin);
    } catch (_) {}
  });

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = async function(input, init) {
      const response = await nativeFetch.apply(this, arguments);
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (matchesApi(url)) {
          const clone = response.clone();
          const text = await clone.text();
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch (_) {}
          cacheAndPost({
            type: 'API_RESPONSE',
            url: String(url),
            method: String(init?.method || input?.method || 'GET'),
            status: response.status,
            ok: response.ok,
            data: json,
            text,
            time: Date.now()
          });
        }
      } catch (error) {
        post({
          type: 'API_BRIDGE_ERROR',
          message: error?.message || String(error)
        });
      }
      return response;
    };
  }

  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function findSelect(formControl) {
    return document.querySelector(`select[formcontrolname="${formControl}"]`) || null;
  }

  function setNativeSelect(select, text, aliases = []) {
    if (!select) return false;
    const wanted = [text, ...aliases].filter(Boolean).map(norm);
    const option = [...(select.options || [])].find((o) => {
      const t = norm(o.textContent || o.value || '');
      return wanted.some((w) => t === w || t.includes(w) || w.includes(t));
    });
    if (!option) return false;
    const proto = Object.getPrototypeOf(select);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(select, String(option.value));
    else select.value = String(option.value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  async function waitForSelect(formControl, timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const s = findSelect(formControl);
      if (s) return s;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  function findButton(text) {
    const wanted = norm(text);
    return [...document.querySelectorAll('button,a,[role="button"]')]
      .filter(visible)
      .find((el) => norm(el.innerText || el.textContent || el.getAttribute('aria-label') || '').includes(wanted)) || null;
  }


  function findEmployeeCodeSearchInput() {
    const inputs = [...document.querySelectorAll('input')].filter((el) => {
      if (!visible(el)) return false;
      const type = String(el.getAttribute('type') || 'text').toLowerCase();
      return !['hidden','checkbox','radio','file','submit','button'].includes(type);
    });

    const scored = inputs.map((el) => {
      const attrs = [
        el.getAttribute('placeholder'),
        el.getAttribute('aria-label'),
        el.getAttribute('name'),
        el.getAttribute('id'),
        el.getAttribute('formcontrolname'),
        el.getAttribute('ng-reflect-name'),
        el.parentElement?.innerText,
        el.closest('form')?.innerText
      ].filter(Boolean).join(' ');
      const t = norm(attrs);
      let score = 0;
      if (t.includes('كود الموظف')) score += 10;
      if (t.includes('الرقم القومي')) score += 8;
      if (t.includes('موظف')) score += 3;
      if (t.includes('بحث')) score += 1;
      return { el, score };
    }).sort((a,b) => b.score - a.score);

    if (scored[0]?.score > 0) return scored[0].el;
    return inputs[0] || null;
  }

  function setNativeInputValue(input, value) {
    if (!input) return false;
    const proto = Object.getPrototypeOf(input);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(input, String(value));
    else input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function findSimpleSearchButton() {
    const buttons = [...document.querySelectorAll('button,a,[role="button"]')]
      .filter(visible);
    return buttons.find((el) => norm(el.innerText || el.textContent || '') === 'بحث') ||
      buttons.find((el) => {
        const t = norm(el.innerText || el.textContent || '');
        return t.includes('بحث') && !t.includes('متقدم') && !t.includes('عرض كل العاملين');
      }) || null;
  }

  async function searchEmployeeByCodeNative(code, requestId) {
    const target = String(code || '').replace(/\D/g, '').trim();
    if (!target) throw new Error('كود الموظف غير موجود.');

    const input = findEmployeeCodeSearchInput();
    if (!input) throw new Error('لم يتم العثور على خانة كود الموظف.');

    input.scrollIntoView({ block: 'center' });
    input.focus();
    setNativeInputValue(input, target);
    await new Promise(r => setTimeout(r, 180));

    const button = findSimpleSearchButton();
    if (!button) throw new Error('لم يتم العثور على زر البحث المباشر.');

    post({
      type: 'EMPLOYEE_CODE_SEARCH_STARTED',
      requestId: requestId || '',
      empCode: target
    });

    button.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 120));
    button.click();
  }

  async function applyFilterAndSearch(type, status, requestId) {
    // حاول أولًا العثور على قائمة النوع حتى لو كانت داخل DOM وغير ظاهرة.
    // هذا يتجنب استدعاء advancedSearch() الذي قد يكسر searchForm في بعض حالات Angular.
    let typeSelect = await waitForSelect('nadbType', 2500);

    if (!typeSelect) {
      const advanced = findButton('بحث متقدم');
      if (advanced) {
        advanced.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 150));
        try { advanced.click(); } catch (_) {}
        await new Promise((r) => setTimeout(r, 700));
      }
      typeSelect = await waitForSelect('nadbType', 5000);
    }

    if (!typeSelect) throw new Error('لم يتم العثور على قائمة النوع nadbType.');

    if (!setNativeSelect(typeSelect, type, ['قوة أساسية', 'قوه اساسيه'])) {
      throw new Error(`لم أستطع اختيار النوع «${type}». الخيارات الحالية: ${[...(typeSelect.options || [])].map(o => o.textContent.trim()).join(' | ')}`);
    }

    // تأكد أن Angular استقبل الاختيار قبل بدء البحث.
    const wantedType = norm(type);
    const startedTypeWait = Date.now();
    while (Date.now() - startedTypeWait < 4000) {
      const selected = norm(typeSelect.options?.[typeSelect.selectedIndex]?.text || typeSelect.value || '');
      if (selected === wantedType || selected.includes(wantedType) || wantedType.includes(selected)) break;
      await new Promise((r) => setTimeout(r, 120));
    }

    await new Promise((r) => setTimeout(r, 500));

    if (String(type).trim() !== 'منتدب' && status) {
      const statusSelect = await waitForSelect('empFlagControl', 10000);
      if (!statusSelect) throw new Error('لم تظهر قائمة الموقف من العمل بعد اختيار قوة أساسية.');
      if (!setNativeSelect(statusSelect, status, ['على رأس عمله', 'علي رأس عمله', 'على رأس عملة', 'علي رأس عملة'])) {
        throw new Error(`لم أستطع اختيار الموقف «${status}».`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    const button = findButton('عرض كل العاملين');
    if (!button) throw new Error('لم يتم العثور على زر «عرض كل العاملين».');

    // أخبر content.js أننا سنطلق البحث قبل الضغط الفعلي، حتى لا تضيع
    // الاستجابة السريعة في حالة رجوع API خلال نفس event loop.
    post({
      type: 'SEARCH_STARTED',
      requestId,
      filterType: type,
      filterStatus: String(type).trim() === 'منتدب' ? '' : (status || '')
    });

    post({ type: 'BRIDGE_LOG', message: `بدء البحث: ${type}${status ? ` / ${status}` : ''}` });
    button.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 250));
    button.click();
  }



  function readCurrentEmployeeRows() {
    const table =
      document.querySelector('table');

    if (!table) {
      return [];
    }

    const rows =
      Array.from(
        table.querySelectorAll('tbody tr')
      );

    const result = [];

    for (const tr of rows) {
      const cells =
        Array.from(
          tr.querySelectorAll('td')
        );

      const text =
        cells
          .map(td => norm(td.textContent))
          .filter(Boolean);

      if (!text.length) {
        continue;
      }

      let empCode = '';

      for (const cell of cells) {
        const candidate =
          norm(
            cell.textContent
          ).replace(/\D/g, '');

        if (
          candidate &&
          candidate.length >= 5 &&
          candidate.length <= 10
        ) {
          empCode =
            candidate;
          break;
        }
      }

      if (!empCode) {
        continue;
      }

      let fullName = '';
      let jobName = '';
      let gehaName = '';
      let empFlag = '';

      // نعتمد أولًا على ترتيب الجدول الحالي في صفحة العاملين:
      // كود الموظف - اسم الموظف - الوظيفة - الجهة - الموقف من العمل
      if (cells.length >= 2) {
        fullName =
          norm(
            cells[1]?.textContent
          );
      }

      if (cells.length >= 3) {
        jobName =
          norm(
            cells[2]?.textContent
          );
      }

      if (cells.length >= 4) {
        gehaName =
          norm(
            cells[3]?.textContent
          );
      }

      if (cells.length >= 5) {
        empFlag =
          norm(
            cells[4]?.textContent
          );
      }

      result.push({
        empCode,
        fullName,
        jobName,
        gehaName,
        schoolName:
          gehaName,
        empFlag
      });
    }

    return result;
  }

  async function readCurrentEmployeeRowsCommand(requestId) {
    const rows =
      readCurrentEmployeeRows();

    post({
      type:
        'CURRENT_EMPLOYEE_ROWS',
      requestId,
      rows
    });
  }

  async function searchNadbUsingSite(requestId) {
    let typeSelect =
      await waitForSelect(
        'nadbType',
        5000
      );

    if (!typeSelect) {
      const advanced =
        findButton(
          'بحث متقدم'
        );

      if (advanced) {
        try {
          advanced.click();
        } catch (_) {}

        await new Promise(
          r =>
            setTimeout(
              r,
              700
            )
        );
      }

      typeSelect =
        await waitForSelect(
          'nadbType',
          5000
        );
    }

    if (!typeSelect) {
      throw new Error(
        'تعذر تجهيز قائمة نوع العامل.'
      );
    }

    if (
      !setNativeSelect(
        typeSelect,
        'منتدب'
      )
    ) {
      throw new Error(
        'تعذر اختيار المنتدبين.'
      );
    }

    // ننتظر Angular حتى يخفي خانة «الموقف من العمل»
    // لأنها غير موجودة أصلًا في حالة المنتدب.
    const waitStarted =
      Date.now();

    while (
      Date.now() - waitStarted <
      5000
    ) {
      const statusSelect =
        findSelect(
          'empFlagControl'
        );

      if (
        !statusSelect ||
        !visible(statusSelect)
      ) {
        break;
      }

      await new Promise(
        r =>
          setTimeout(
            r,
            120
          )
      );
    }

    await new Promise(
      r =>
        setTimeout(
          r,
          450
        )
    );

    const button =
      findButton(
        'عرض كل العاملين'
      );

    if (!button) {
      throw new Error(
        'تعذر تشغيل عرض العاملين.'
      );
    }

    post({
      type:
        'SEARCH_STARTED',
      requestId,
      filterType:
        'منتدب',
      filterStatus:
        ''
    });

    button.scrollIntoView({
      block:
        'center'
    });

    await new Promise(
      r =>
        setTimeout(
          r,
          180
        )
    );

    button.click();
  }

  function findEmployeeRow(code) {
    const target = String(code);
    const tables = [...document.querySelectorAll('app-employee-list table, table')];
    for (const table of tables) {
      const rows = [...table.querySelectorAll('tbody tr')];
      for (const row of rows) {
        if (String(row.innerText || '').replace(/\s/g, '').includes(target)) return row;
      }
    }
    return null;
  }

  function findViewInRow(row) {
    if (!row) return null;

    // The real Angular handler is attached to the BUTTON, not the inner <a>.
    // Clicking the <a> directly caused Bootstrap/Angular errors in prior versions.
    const cells = [...row.querySelectorAll('td')];
    const preferredButton = cells[5]?.querySelector('button');
    if (preferredButton && visible(preferredButton)) return preferredButton;

    const anyButton = [...row.querySelectorAll('button')]
      .filter(visible)
      .find((el) => norm(el.innerText || el.textContent || el.getAttribute('aria-label') || el.title || '').includes('عرض'));
    if (anyButton) return anyButton;

    const anchor = [...row.querySelectorAll('a,[role="button"]')]
      .filter(visible)
      .find((el) => norm(el.innerText || el.textContent || el.getAttribute('aria-label') || el.title || '').includes('عرض'));
    if (anchor) {
      return anchor.closest('button') || anchor;
    }

    return null;
  }

  async function openEmployee(code, requestId) {
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const row = findEmployeeRow(code);
      const viewButton = findViewInRow(row);
      if (viewButton) {
        viewButton.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 250));
        post({ type: 'EMPLOYEE_OPEN_STARTED', requestId, empCode: String(code) });

        // Use the exact Angular click target from the template: <button>, not <a>.
        try {
          viewButton.click();
        } catch (error) {
          throw new Error(`تعذر تشغيل زر عرض الموظف ${code}: ${error?.message || error}`);
        }
        return;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`لم أجد زر عرض للموظف ${code} في القائمة الحالية.`);
  }

  function backToList(requestId) {
    // Legacy compatibility only. v1.0 native staff engine no longer calls this
    // because browser history.back() can trigger a full document reload.
    post({ type: 'BACK_STARTED', requestId });
    window.history.back();
  }

  async function nextPage(requestId) {
    const scope = document.querySelector('app-employee-list') || document;
    const candidates = [...scope.querySelectorAll('button,a,[role=\"button\"],li')].filter(visible);
    const next = candidates.find((el) => {
      const t = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || el.title || '');
      const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled');
      return !disabled && (t === 'التالي' || t === 'التالى' || t === 'next' || t.includes('الصفحة التالية'));
    });
    if (!next) throw new Error('لا يوجد زر «التالي» في قائمة العاملين.');
    next.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 250));
    next.click();
    post({ type: 'NEXT_PAGE_STARTED', requestId });
  }


  function safeCapturedHeadersFor(url) {
    const key =
      API_MATCHES.find(
        part =>
          String(url || '').includes(part)
      ) ||
      '/api/Employee/GetEmployeeByEmpFlag';

    const source =
      lastTeacherApiHeaders.get(key) ||
      lastTeacherApiHeaders.get(
        '/api/Employee/GetEmployeeByEmpFlag'
      ) ||
      {};

    const blocked =
      new Set([
        'host',
        'origin',
        'referer',
        'content-length',
        'cookie',
        'connection',
        'accept-encoding',
        'sec-fetch-site',
        'sec-fetch-mode',
        'sec-fetch-dest',
        'user-agent'
      ]);

    const result = {
      ...lastTeacherSessionHeaders
    };

    for (const [name, value] of Object.entries(source)) {
      if (
        !blocked.has(String(name).toLowerCase()) &&
        value != null &&
        String(value) !== ''
      ) {
        result[name] =
          String(value);
      }
    }

    return result;
  }

  function xhrBufferToBase64(buffer) {
    const bytes =
      new Uint8Array(buffer);

    let binary =
      '';

    const chunk =
      0x8000;

    for (
      let i = 0;
      i < bytes.length;
      i += chunk
    ) {
      binary +=
        String.fromCharCode(
          ...bytes.subarray(
            i,
            i + chunk
          )
        );
    }

    return btoa(binary);
  }

  function directApiRequest(msg) {
    return new Promise(
      (resolve, reject) => {
        const rawUrl = String(msg.url || '');
        let parsedUrl;
        try {
          parsedUrl = new URL(rawUrl, window.location.href);
        } catch (_) {
          return reject(new Error('INVALID_URL'));
        }

        const ALLOWED_ORIGIN = 'https://professopi.emis.gov.eg';
        const isAllowedOrigin = parsedUrl.origin === ALLOWED_ORIGIN;
        const isAllowedPath = API_MATCHES.some((part) => parsedUrl.pathname.startsWith(part));

        if (!isAllowedOrigin || !isAllowedPath) {
          return reject(new Error('URL_NOT_ALLOWED'));
        }

        const url = parsedUrl.href;

        const method =
          String(
            msg.method || 'GET'
          ).toUpperCase();

        const xhr =
          new NativeXHR();

        nativeOpen.call(
          xhr,
          method,
          url,
          true
        );

        xhr.withCredentials =
          true;

        const binary =
          msg.responseType ===
          'base64';

        if (binary) {
          xhr.responseType =
            'arraybuffer';
        }

        const sanitizedCustom = {};
        if (msg.customHeaders && typeof msg.customHeaders === 'object') {
          for (const [k, v] of Object.entries(msg.customHeaders)) {
            const lk = String(k).toLowerCase();
            if (lk !== 'authorization' && lk !== 'schoolcode' && lk !== 'cookie' && lk !== 'host' && lk !== 'origin') {
              sanitizedCustom[k] = v;
            }
          }
        }

        const headers = {
          ...safeCapturedHeadersFor(
            url
          ),
          ...sanitizedCustom
        };

        if (!headers.accept) {
          headers.accept =
            binary
              ? 'application/pdf,application/octet-stream,*/*'
              : 'application/json, text/plain, */*';
        }

        if (
          method !== 'GET' &&
          method !== 'HEAD' &&
          !headers['content-type']
        ) {
          headers['content-type'] =
            'application/json';
        }

        for (
          const [name, value] of
          Object.entries(headers)
        ) {
          try {
            nativeSetRequestHeader.call(
              xhr,
              name,
              value
            );
          } catch (_) {}
        }

        const timer =
          setTimeout(
            () => {
              try {
                xhr.abort();
              } catch (_) {}

              reject(
                new Error(
                  'انتهت مهلة طلب API المعلمين المباشر.'
                )
              );
            },
            Number(
              msg.timeout ||
              30000
            )
          );

        xhr.onload = () => {
          clearTimeout(timer);

          const status =
            Number(
              xhr.status || 0
            );

          if (
            status < 200 ||
            status >= 300
          ) {
            reject(
              new Error(
                `HTTP_${status}`
              )
            );
            return;
          }

          if (binary) {
            resolve({
              ok: true,
              status,
              contentType:
                xhr.getResponseHeader(
                  'content-type'
                ) || '',
              base64:
                xhrBufferToBase64(
                  xhr.response
                )
            });
            return;
          }

          const text =
            String(
              xhr.responseText ||
              ''
            );

          let data =
            null;

          try {
            data =
              text
                ? JSON.parse(text)
                : null;
          } catch (_) {}

          resolve({
            ok: true,
            status,
            contentType:
              xhr.getResponseHeader(
                'content-type'
              ) || '',
            data,
            text
          });
        };

        xhr.onerror = () => {
          clearTimeout(timer);
          reject(
            new Error(
              'XHR_NETWORK_ERROR'
            )
          );
        };

        let body =
          null;

        if (
          method !== 'GET' &&
          method !== 'HEAD' &&
          msg.body != null
        ) {
          body =
            typeof msg.body ===
              'string'
              ? msg.body
              : JSON.stringify(
                  msg.body
                );
        }

        nativeSend.call(
          xhr,
          body
        );
      }
    );
  }


  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== 'NEPRAS_EXTENSION') return;

    try {
      if (msg.type === 'SEARCH_STAFF') {
        await applyFilterAndSearch(msg.filterType, msg.filterStatus || '', msg.requestId);
      } else if (msg.type === 'SEARCH_NADB_NATIVE') {
        await searchNadbUsingSite(msg.requestId);
      } else if (msg.type === 'READ_CURRENT_EMPLOYEE_ROWS') {
        await readCurrentEmployeeRowsCommand(msg.requestId);
      } else if (msg.type === 'SEARCH_EMPLOYEE_CODE_NATIVE') {
        await searchEmployeeByCodeNative(msg.empCode, msg.requestId);
      } else if (msg.type === 'OPEN_EMPLOYEE') {
        await openEmployee(msg.empCode, msg.requestId);
      } else if (msg.type === 'OPEN_EMPLOYEE_DIRECT') {
        const code = String(msg.empCode || '');
        if (!code) throw new Error('كود الموظف غير موجود.');
        const route = `/dashboard/employeeAllInformation`;
        const state = { empCode: code };
        history.pushState(state, '', route);
        window.dispatchEvent(new PopStateEvent('popstate', { state }));
        post({ type: 'EMPLOYEE_OPEN_DIRECT_STARTED', requestId: msg.requestId || '', empCode: code });
      } else if (msg.type === 'BACK_TO_LIST') {
        backToList(msg.requestId);
      } else if (msg.type === 'GET_LAST_API') {
        const key = API_MATCHES.find((part) => part === msg.endpoint || String(msg.endpoint || '').includes(part));
        let cached = null;
        if (key === '/api/Employee/GetEmployeeFullData' && msg.empCode != null) {
          cached = fullDataByEmpCode.get(String(msg.empCode)) || null;
        } else {
          cached = key ? lastResponses.get(key) : null;
        }
        post({
          type: 'LAST_API_RESPONSE',
          requestId: msg.requestId || '',
          endpoint: key || '',
          empCode: msg.empCode != null ? String(msg.empCode) : '',
          response: cached || null
        });
      } else if (msg.type === 'DIRECT_API_REQUEST') {
        const result = await directApiRequest(msg);
        post({
          type: 'DIRECT_API_RESULT',
          requestId: msg.requestId || '',
          ...result
        });
      } else if (msg.type === 'NEXT_PAGE') {
        await nextPage(msg.requestId);
      }
    } catch (error) {
      post({
        type: 'BRIDGE_COMMAND_ERROR',
        requestId: msg.requestId || '',
        message: error?.message || String(error)
      });
    }
  });

  post({ type: 'BRIDGE_READY' });
})();
