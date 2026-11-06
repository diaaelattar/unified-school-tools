"use strict";
const { contextBridge, ipcRenderer } = require("electron");

function sub(channel, cb) { ipcRenderer.on(channel, (_e, ...a) => cb(...a)); }
const cfg = ipcRenderer.sendSync("nep:config");

contextBridge.exposeInMainWorld("nepDesktop", {
  partition: cfg.partition,
  tabPreloadUrl: cfg.tabPreloadUrl,
  writeLog: (entry) => ipcRenderer.invoke("nep:writeLog", entry),
  getDiagnosticsLog: () => ipcRenderer.invoke("nep:getDiagnosticsLog"),
  loadState: () => ipcRenderer.invoke("nep:loadState"),
  saveState: (s) => ipcRenderer.invoke("nep:saveState", s),
  saveFile: (o) => ipcRenderer.invoke("nep:saveFile", o),
  deleteFile: (p) => ipcRenderer.invoke("nep:deleteFile", p),
  openPath: (p) => ipcRenderer.invoke("nep:openPath", p),
  showItem: (p) => ipcRenderer.invoke("nep:showItem", p),
  openFolder: () => ipcRenderer.invoke("nep:openFolder"),
  toggleDevTools: () => ipcRenderer.send("nep:toggleDevTools"),
  openDevTools: () => ipcRenderer.send("nep:openDevTools"),
  setWebRequestUrls: (u) => ipcRenderer.send("nep:wrUrls", u),
  registerTab: (wcId, tabId) => ipcRenderer.send("nep:registerTab", wcId, tabId),
  unregisterTab: (wcId) => ipcRenderer.send("nep:unregisterTab", wcId),
  activeTabChanged: (info) => ipcRenderer.send("nep:activeTabChanged", info),
  getActiveSchool: () => ipcRenderer.invoke("nep:getActiveSchool"),
  getLatestDownloadedPdf: (opts) => ipcRenderer.invoke("nep:getLatestDownloadedPdf", opts),
  onRequest: (cb) => sub("nep:request", cb),
  onDownload: (cb) => sub("nep:download", cb),
  onOpenWindow: (cb) => sub("nep:openWindow", cb),
  // Desktop-only Annual Subscription & School-Code Licensing
  getLicenseStatus: () => ipcRenderer.invoke("nep:license:getStatus"),
  checkSchoolLicense: (opts) => ipcRenderer.invoke("nep:license:checkOnline", opts),
  activateSchoolKey: (opts) => ipcRenderer.invoke("nep:license:activateKey", opts),
  reportDetectedSchool: (opts) => ipcRenderer.invoke("nep:license:reportSchool", opts),
  reportLogout: () => ipcRenderer.invoke("nep:license:reportLogout"),
  setLicenseServerUrl: (url) => ipcRenderer.invoke("nep:license:setServerUrl", url),
  onLicenseUpdate: (cb) => sub("nep:license", cb),
  // Auto-Update & External Browser
  checkUpdate: () => ipcRenderer.invoke("nep:checkUpdate"),
  downloadUpdate: (url) => ipcRenderer.invoke("nep:downloadUpdate", url),
  openExternal: (url) => ipcRenderer.invoke("nep:openExternal", url)
});
