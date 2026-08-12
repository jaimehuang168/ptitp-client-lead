/**
 * PTITP · Seguimiento de prospectos — API
 *
 * Despliegue: Implementar › Nueva implementación › Aplicación web
 *   Ejecutar como:  Yo (la cuenta dueña de los formularios)
 *   Quién accede:   Cualquier persona
 *
 * La URL resultante + TOKEN son la única barrera de acceso. No las publiques.
 * Guardá el TOKEN en Configuración del proyecto › Propiedades del script,
 * con la clave API_TOKEN. Nunca lo escribas en este archivo.
 */

var INQUIRY_ID = '1m2gtjC1aH8w2aXeO-zK7j8LhCHYaoqgUhmle82g_bY4';
var QUEST_ID   = '1FWpGlcpze_GLnwym7cXZJhE-jjjqdT7IRnMZ7CKqxIc';
var CRM_ID = '1b4wxGG63mVtWJ2c_spJ96ROVcDxm7efYQtyvIV6x0cU';

/* Carpeta de Drive con los documentos que se mandan siempre: presentación del
   parque, plano de lotes, tarifas, resumen del régimen de Maquila. Aparecen como
   casillas en el redactor y no se vuelven a subir en cada correo.
   Dejar en '' para desactivar la biblioteca. */
var LIBRARY_FOLDER_ID = 'https://drive.google.com/drive/folders/1Nr-XWIj6AkKCTx7LK2BQbnTip1Z4ji7R';

var MAX_ATT = 20 * 1024 * 1024;   // Gmail admite 25 MB; dejamos margen para el encabezado

var INQ_TABS = { 'Form Responses 1':'EN', 'Form Responses 2':'ES', 'Form Responses 3':'PT' };
var SENDER   = 'Parque Tecnológico Inteligente Taiwán-Paraguay';

/* Campo interno → texto con que empieza (inquiry) o que contiene (cuestionario) el encabezado */
var INQ_MAP = [
  ['submitter','Email Address'], ['inquiryDate','填表日期'], ['company','公司名稱'],
  ['website','公司網站'], ['taxId','營利事業統一編號'], ['capReg','登記資本額'],
  ['capPaid','實收資本額'], ['entity','組織型態'], ['coAddr','公司地址'], ['coTel','公司電話'],
  ['contact','聯絡人姓名'], ['phone','聯絡人電話'], ['email','聯絡人電子郵件'],
  ['rep','代表人姓名'], ['repId','代表人身分證'], ['repAddr','代表人住址'],
  ['repTel','代表人電話'], ['repMail','代表人電子郵件'],
  ['investType','申請屬性'], ['spaceType','申請標的'],
  ['landArea','申請租賃土地 - 面積'], ['landZone','申請租賃土地 - 規劃使用別'],
  ['bldgAddr','申請租賃建築物 - 地址'], ['bldgArea','申請租賃建築物 - 面積'],
  ['indName','產業類別 - 名稱'], ['indCode','產業類別 - 代碼'],
  ['prodName','主要產品 - 名稱'], ['prodHs','主要產品 - 稅則代碼'],
  ['dBuild','預計開始興工時間'], ['dOper','預計開始營運時間'],
  ['employees','預計員工人數'], ['power','預估用電量'], ['water','預估用水量'], ['waste','預估廢']
];

var QST_MAP = [
  ['submitter','Email Address'], ['company','Nombre completo de la empresa'],
  ['country','País origen'], ['taxId','Identificación Fiscal'],
  ['sector','Sector industrial'], ['contact','Nombre de la persona de contacto'],
  ['role','Cargo de la persona'], ['email','Correo electrónico de contacto'],
  ['phone','Teléfono de contacto'], ['spaceType','tipo de espacio'],
  ['areaText','superficie aproximada'], ['employees','empleados a instalar'],
  ['timeline','plazo de tiempo estimado'], ['infra','infraestructura tecnológica'],
  ['services','servicios y recursos operativos'], ['ask','información principal'],
  ['channel','Cómo se enteró']
];

/* ============================================================
   Router
   ============================================================ */
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var want = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!want || req.token !== want) return out({ ok:false, error:'Clave inválida' });

    switch (req.action) {
      case 'leads':     return out({ ok:true, leads:readAll(), crm:readCrm(), library:readLibrary() });
      case 'setStatus': return out(setStatus(req));
      case 'addNote':   return out(addNote(req));
      case 'sendReply': return out(sendReply(req));
      default:          return out({ ok:false, error:'Acción desconocida: ' + req.action });
    }
  } catch (err) {
    return out({ ok:false, error:String(err && err.message || err) });
  }
}
function doGet() { return out({ ok:true, service:'PTITP leads API' }); }
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   Lectura de formularios
   ============================================================ */
function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

/** Índice de cada campo. mode 'start' = el encabezado empieza con la clave (inquiry,
 *  donde el prefijo chino es estable); 'has' = la contiene (cuestionario). */
function indexOf_(head, map, mode) {
  var idx = {};
  map.forEach(function (p) {
    var kw = norm(p[1]).toLowerCase();
    idx[p[0]] = head.findIndex(function (h) {
      var hh = norm(h).toLowerCase();
      return mode === 'start' ? hh.indexOf(kw) === 0 : hh.indexOf(kw) > -1;
    });
  });
  return idx;
}

function slug(s) {
  return String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12) || 'x';
}

/** getDisplayValues evita que Sheets degrade los RUC largos a notación científica. */
function rowsOf(sheet) {
  if (sheet.getLastRow() < 2) return { head:[], data:[] };
  var v = sheet.getDataRange().getDisplayValues();
  return { head:v.shift(), data:v };
}

function readAll() {
  var leads = [];

  // --- Inquiry: una planilla, tres pestañas (EN / ES / PT) ---
  SpreadsheetApp.openById(INQUIRY_ID).getSheets().forEach(function (sh) {
    var lang = INQ_TABS[sh.getName()];
    if (!lang) return;
    var r = rowsOf(sh); if (!r.data.length) return;
    var idx = indexOf_(r.head, INQ_MAP, 'start');

    r.data.forEach(function (row) {
      var ts = row[0]; if (!ts) return;
      var o = { source:'INQ', lang:lang, ts:iso(ts) };
      INQ_MAP.forEach(function (p) { o[p[0]] = idx[p[0]] > -1 ? row[idx[p[0]]] : ''; });
      o.id = 'INQ-' + lang + '-' + stamp(ts) + '-' + slug(o.submitter);
      // El inquiry no pregunta país ni sector: la industria va en indName y se
      // muestra como tal. No se rellenan campos del cuestionario que no existen acá.
      o.areaText = [o.landArea, o.bldgArea].filter(String).join(' + ');
      o.areaM2   = area(o.landArea) + area(o.bldgArea) || null;
      leads.push(o);
    });
  });

  // --- Cuestionario: una sola pestaña ---
  var qs = SpreadsheetApp.openById(QUEST_ID).getSheets()[0];
  var q = rowsOf(qs);
  if (q.data.length) {
    var qi = indexOf_(q.head, QST_MAP, 'has');
    q.data.forEach(function (row) {
      var ts = row[0]; if (!ts) return;
      var o = { source:'QST', lang:'ES', ts:iso(ts) };
      QST_MAP.forEach(function (p) { o[p[0]] = qi[p[0]] > -1 ? row[qi[p[0]]] : ''; });
      o.id = 'QST-' + stamp(ts) + '-' + slug(o.submitter);
      o.areaM2 = area(o.areaText);
      leads.push(o);
    });
  }

  return leads;
}

function iso(v) { var d = new Date(v); return isNaN(d) ? String(v) : d.toISOString(); }
function stamp(v) {
  var d = new Date(v);
  return isNaN(d) ? String(v).replace(/\D/g, '').slice(0, 8)
                  : Utilities.formatDate(d, 'America/Asuncion', 'yyyyMMddHHmmss');
}

/** Superficie en m². Toma el techo del rango: para planificar importa el máximo. */
function area(v) {
  if (!v) return 0;
  var s = String(v);
  if (/a[úu]n en evaluaci|a[úu]n no|no dispongo/i.test(s)) return 0;
  var nums = (s.match(/\d[\d.,]*/g) || []).map(function (x) {
    var t = /,\d{1,2}$/.test(x) ? x.replace(/\./g, '').replace(',', '.')
                                : x.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
    return parseFloat(t);
  }).filter(function (n) { return !isNaN(n) && n > 0; });
  return nums.length ? Math.max.apply(null, nums) : 0;
}

/* ============================================================
   Estado CRM  (planilla aparte: pestañas CRM y LOG)
   ============================================================ */
function crmBook() { return SpreadsheetApp.openById(CRM_ID); }
function tab(name, header) {
  var ss = crmBook(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}
function crmSheet() { return tab('CRM', ['id', 'status', 'owner', 'updated']); }
function logSheet() { return tab('LOG', ['ts', 'id', 'kind', 'who', 'subject', 'body']); }

/* Cada módulo tiene su propio vocabulario de estados. Una consulta arranca
   'nueva' y se califica; una solicitud arranca 'recibida' y se cotiza. */
function firstStatus(id) { return String(id).indexOf('INQ-') === 0 ? 'recibida' : 'nueva'; }

function readCrm() {
  var crm = {}, sh = crmSheet();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
      if (r[0]) crm[r[0]] = { status: r[1] || firstStatus(r[0]), owner: r[2] || '', log: [] };
    });
  }
  var lg = logSheet();
  if (lg.getLastRow() > 1) {
    lg.getRange(2, 1, lg.getLastRow() - 1, 6).getValues().forEach(function (r) {
      var id = r[1]; if (!id) return;
      if (!crm[id]) crm[id] = { status:firstStatus(id), owner:'', log:[] };
      crm[id].log.push({ ts:iso(r[0]), kind:r[2], who:r[3], subject:r[4], body:r[5] });
    });
  }
  return crm;
}

function setStatus(req) {
  var sh = crmSheet(), ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().flat();
  var row = ids.indexOf(req.id) + 1;
  if (row > 0) sh.getRange(row, 2, 1, 3).setValues([[req.status, req.agent || '', new Date()]]);
  else sh.appendRow([req.id, req.status, req.agent || '', new Date()]);
  logSheet().appendRow([new Date(), req.id, 'Estado', req.agent || '', '', (req.from || '') + ' → ' + req.status]);
  return { ok:true };
}

function addNote(req) {
  logSheet().appendRow([new Date(), req.id, 'Nota', req.agent || '', '', req.body]);
  return { ok:true };
}

/* ============================================================
   Biblioteca de documentos
   ============================================================ */
function readLibrary() {
  if (!LIBRARY_FOLDER_ID) return [];
  try {
    var it = DriveApp.getFolderById(LIBRARY_FOLDER_ID).getFiles(), lib = [];
    while (it.hasNext()) {
      var f = it.next();
      lib.push({ id:f.getId(), name:f.getName(), size:f.getSize(), mime:f.getMimeType() });
    }
    return lib.sort(function (a, b) { return a.name.localeCompare(b.name); });
  } catch (e) {
    return [];   // carpeta mal configurada: el redactor sigue funcionando sin biblioteca
  }
}

/* ============================================================
   Envío de respuestas
   ============================================================ */
function buildAttachments(req) {
  var blobs = [], total = 0, names = [];

  (req.libIds || []).forEach(function (id) {
    var b = DriveApp.getFileById(id).getBlob();
    total += b.getBytes().length; names.push(b.getName()); blobs.push(b);
  });

  (req.files || []).forEach(function (f) {
    var bytes = Utilities.base64Decode(f.data);
    total += bytes.length; names.push(f.name);
    blobs.push(Utilities.newBlob(bytes, f.mime || 'application/octet-stream', f.name));
  });

  if (total > MAX_ATT) throw new Error('Los adjuntos suman ' +
    Math.round(total / 1048576) + ' MB y el límite es ' + Math.round(MAX_ATT / 1048576) + ' MB');

  return { blobs: blobs, names: names };
}

function sendReply(req) {
  if (!req.to || !req.subject || !req.body) return { ok:false, error:'Faltan destinatario, asunto o cuerpo' };
  if (MailApp.getRemainingDailyQuota() < 1) return { ok:false, error:'Cuota diaria de correo agotada' };

  var att = buildAttachments(req);
  var opts = { name: SENDER };
  if (att.blobs.length) opts.attachments = att.blobs;

  GmailApp.sendEmail(req.to, req.subject, req.body, opts);
  logSheet().appendRow([new Date(), req.id, 'Correo enviado', req.agent || '', req.subject,
    req.body + (att.names.length ? '\n\n[Adjuntos: ' + att.names.join(', ') + ']' : '')]);

  // El avance automático depende del módulo, igual que en el frontend
  var isInq = String(req.id).indexOf('INQ-') === 0;
  var hasForm = /forms\.gle|docs\.google\.com\/forms/.test(req.body);
  var next = isInq ? 'evaluacion' : (hasForm ? 'formulario' : 'respondida');

  var sh = crmSheet(), ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().flat();
  var row = ids.indexOf(req.id) + 1;
  if (row > 0) {
    var cur = sh.getRange(row, 2).getValue();
    if (cur === firstStatus(req.id) || (!isInq && hasForm && cur !== 'descartada')) {
      sh.getRange(row, 2).setValue(next);
    }
  } else sh.appendRow([req.id, next, req.agent || '', new Date()]);

  return { ok:true, quota: MailApp.getRemainingDailyQuota() };
}

/* ============================================================
   Aviso de nuevo prospecto (disparadores)
   ============================================================ */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  [INQUIRY_ID, QUEST_ID].forEach(function (id) {
    ScriptApp.newTrigger('onNew').forSpreadsheet(id).onFormSubmit().create();
  });
  crmSheet(); logSheet();
}

function onNew(e) {
  var to = Session.getEffectiveUser().getEmail();
  var vals = e && e.namedValues ? e.namedValues : {};
  var lines = Object.keys(vals).map(function (k) { return k + ': ' + vals[k].join(', '); });
  MailApp.sendEmail({
    to: to,
    subject: '【PTITP】Nuevo prospecto recibido',
    body: lines.join('\n') + '\n\nAbrí el panel de seguimiento para responder.'
  });
}