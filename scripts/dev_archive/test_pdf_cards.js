'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false
      }
    });

    const htmlPath = path.resolve(__dirname, '../../النسخ_التنفيذية_المكتملة/برنامج-بطاقات-الطلاب.html');
    const pdfPath = path.resolve(__dirname, '../../النسخ_التنفيذية_المكتملة/application_pdf.pdf');
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBytes.toString('base64');

    await win.loadFile(htmlPath);

    const result = await win.webContents.executeJavaScript(`
      (async () => {
        try {
          const b64 = "${pdfBase64}";
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          
          const file = new File([u8], "application_pdf.pdf", { type: "application/pdf" });
          const fileInput = document.getElementById('file');
          if (!fileInput) return { ok: false, error: 'input#file not found' };
          
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Wait for processing
          for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 200));
            const cards = document.querySelectorAll('.card');
            const notice = document.getElementById('notice')?.textContent || '';
            const count = document.getElementById('count')?.textContent || '';
            if (cards.length > 0 || /تعذّرت|لم أجد/.test(notice)) {
              const sampleCard = cards[0] ? cards[0].innerText : null;
              return {
                ok: cards.length > 0,
                cardsCount: cards.length,
                notice,
                countText: count,
                sampleCard
              };
            }
          }
          
          return {
            ok: false,
            timeout: true,
            notice: document.getElementById('notice')?.textContent,
            cardsCount: document.querySelectorAll('.card').length
          };
        } catch (err) {
          return { ok: false, error: err.message || String(err) };
        }
      })()
    `);

    fs.writeFileSync(path.resolve(__dirname, 'pdf_test_result.json'), JSON.stringify(result, null, 2), 'utf8');
  } catch (e) {
    fs.writeFileSync(path.resolve(__dirname, 'pdf_test_result.json'), JSON.stringify({ error: e.message }, null, 2), 'utf8');
  } finally {
    app.quit();
  }
});
