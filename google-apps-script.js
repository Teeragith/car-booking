// =========================================================
// ระบบจองรถ — Google Apps Script (Backend)
// =========================================================
// วิธี Deploy:
//   1. เปิด Google Apps Script Editor (script.google.com)
//   2. วางโค้ดนี้ทับโค้ดเดิมทั้งหมด
//   3. กด Save (Ctrl+S)
//   4. Deploy → New deployment → Web App
//      Execute as: Me
//      Who has access: Anyone
//   5. คัดลอก URL ใหม่ไปใส่ใน SCRIPT_URL ในไฟล์ index.html
// =========================================================

var SH_BOOKING     = 'การจอง';
var SH_USERS       = 'ผู้ใช้งาน';
var SH_VEHICLE     = 'รถ';
var SH_FUEL        = 'เติมน้ำมัน';
var SH_MAINTENANCE = 'บำรุงรักษา';
var SH_LOG         = 'access_log';
var DRIVE_FOLDER   = 'ระบบจองรถ_แนบไฟล์';

function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    var p = {};
    try { p = JSON.parse(e.postData.contents); } catch(x) { p = e.parameter; }
    var action = p.action || (e.parameter ? e.parameter.action : '');
    var result;
    if      (action === 'login')              result = login(p);
    else if (action === 'getUsers')           result = getUsers();
    else if (action === 'addUser')            result = addUser(p);
    else if (action === 'updateUser')         result = updateUser(p);
    else if (action === 'deleteUser')         result = deleteUser(p);
    else if (action === 'getVehicles')        result = getVehicles();
    else if (action === 'getBookings')        result = getBookings(p);
    else if (action === 'addBooking')         result = addBookingAndNotify(p);
    else if (action === 'updateBooking')      result = updateBooking(p);
    else if (action === 'cancelBooking')      result = cancelBookingAndNotify(p);
    else if (action === 'assignDriver')       result = assignDriverAndNotify(p);
    else if (action === 'saveTripLog')        result = updateBooking({ id: p.id, updates: { mileStart: p.mileStart, mileEnd: p.mileEnd, startLocation: p.startLocation, endLocation: p.endLocation, startTime: p.startTime, endTime: p.endTime, note: p.note, status: p.finish ? 'done' : 'in-use' } });
    else if (action === 'addVehicle')         result = addVehicle(p);
    else if (action === 'updateVehicle')      result = updateVehicle(p);
    else if (action === 'deleteVehicle')      result = deleteVehicle(p);
    else if (action === 'getFuelLogs')        result = getFuelLogs(p);
    else if (action === 'addFuelLog')         result = addFuelLog(p);
    else if (action === 'deleteFuelLog')      result = deleteFuelLog(p);
    else if (action === 'getMaintenance')     result = getMaintenance();
    else if (action === 'addMaintenance')     result = addMaintenance(p);
    else if (action === 'updateMaintenance')  result = updateMaintenanceFn(p);
    else if (action === 'deleteMaintenance')  result = deleteMaintenance(p);
    else if (action === 'uploadFile')         result = uploadFileToDrive(p);
    else if (action === 'getAccessLog')       result = getAccessLog(p);
    else if (action === 'initSheets')         result = initSheets();
    else if (action === 'getSystemConfig')    result = getSystemConfig();
    else if (action === 'saveSystemConfig')   result = saveSystemConfig(p);
    else if (action === 'testTelegramBot')    result = testTelegramBot(p);
    else result = { success: false, error: 'Unknown action: ' + action };

    // Auto-log write actions
    var writeActions = ['login','addBooking','updateBooking','cancelBooking','assignDriver','saveTripLog',
      'addVehicle','updateVehicle','deleteVehicle','addFuelLog','deleteFuelLog',
      'addMaintenance','updateMaintenance','deleteMaintenance','addUser','updateUser','deleteUser'];
    if (writeActions.indexOf(action) >= 0) {
      try {
        writeAccessLog({
          username: p._user || p.username || '',
          name:     p._name || '',
          role:     p._role || '',
          action:   action,
          detail:   (result && result.id) ? result.id : (p.id || p.plate || p.username || ''),
          result:   (result && result.success) ? 'success' : 'failed'
        });
      } catch(le) {}
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================================================
// Telegram Bot
// =========================================================

function sendTelegram(chatId, message) {
  if (!chatId || chatId === '') return;
  try {
    var props = PropertiesService.getScriptProperties();
    var botToken = props.getProperty('telegramBotToken') || '';
    if (!botToken) return;
    UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: message }),
      muteHttpExceptions: true
    });
  } catch(e) {}
}

// อ่าน config จาก PropertiesService
function getSystemConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    success: true,
    config: {
      telegramBotToken:    props.getProperty('telegramBotToken')    || '',
      adminTelegramChatId: props.getProperty('adminTelegramChatId') || '',
      notifyNewBooking:    props.getProperty('notifyNewBooking')    !== 'false',
      notifyAssign:        props.getProperty('notifyAssign')        !== 'false',
      notifyCancel:        props.getProperty('notifyCancel')        !== 'false',
      notifyDayBefore:     props.getProperty('notifyDayBefore')     !== 'false',
      notifyMorning:       props.getProperty('notifyMorning')       !== 'false'
    }
  };
}

function saveSystemConfig(d) {
  var props = PropertiesService.getScriptProperties();
  if (d.telegramBotToken    !== undefined) props.setProperty('telegramBotToken',    d.telegramBotToken);
  if (d.adminTelegramChatId !== undefined) props.setProperty('adminTelegramChatId', d.adminTelegramChatId);
  if (d.notifyNewBooking !== undefined) props.setProperty('notifyNewBooking', String(d.notifyNewBooking));
  if (d.notifyAssign     !== undefined) props.setProperty('notifyAssign',     String(d.notifyAssign));
  if (d.notifyCancel     !== undefined) props.setProperty('notifyCancel',     String(d.notifyCancel));
  if (d.notifyDayBefore  !== undefined) props.setProperty('notifyDayBefore',  String(d.notifyDayBefore));
  if (d.notifyMorning    !== undefined) props.setProperty('notifyMorning',    String(d.notifyMorning));
  return { success: true };
}

function testTelegramBot(p) {
  var chatId   = p.chatId   || '';
  var botToken = p.botToken || '';
  if (!chatId || !botToken) return { success: false, error: 'กรุณาใส่ Bot Token และ Chat ID' };
  try {
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: '[แจ้งเตือน] ทดสอบระบบแจ้งเตือนจากระบบจองรถ ✅' }),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code === 200) return { success: true };
    var body = JSON.parse(resp.getContentText());
    return { success: false, error: 'Telegram: ' + (body.description || code) };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ── Message builders ──────────────────────────────────────

function _msgNewBooking(booking) {
  return '*** แจ้งเตือน: มีการจองรถใหม่ ***' +
    '\nรหัส: ' + booking.id +
    '\nผู้จอง: ' + booking.bookerName + ' (' + booking.dept + ')' +
    '\nวันที่: ' + booking.useDate + '  เวลา: ' + booking.timeSlot +
    '\nปลายทาง: ' + booking.destination +
    (booking.selfDrive === 'true' || booking.selfDrive === true ? '\nหมายเหตุ: ผู้จองขับเอง' : '') +
    '\nผู้โดยสาร: ' + (booking.passengers || 1) + ' คน';
}

function _msgApproved(booking, plate, driverName) {
  return '*** อนุมัติแล้ว: การจองของคุณได้รับการอนุมัติ ***' +
    '\nรหัส: ' + booking.id +
    '\nวันที่: ' + booking.useDate + '  เวลา: ' + booking.timeSlot +
    '\nปลายทาง: ' + booking.destination +
    '\nรถ: ' + plate +
    '\nคนขับ: ' + driverName;
}

function _msgDriverAssigned(booking, plate) {
  return '*** งานใหม่: คุณได้รับมอบหมายงาน ***' +
    '\nรหัส: ' + booking.id +
    '\nผู้โดยสาร: ' + booking.bookerName + ' (' + booking.dept + ')' +
    '\nวันที่: ' + booking.useDate + '  เวลา: ' + booking.timeSlot +
    '\nปลายทาง: ' + booking.destination +
    '\nรถ: ' + plate;
}

function _msgCancelledBooker(booking) {
  return '*** แจ้งเตือน: การจองของคุณถูกยกเลิก ***' +
    '\nรหัส: ' + booking.id +
    '\nวันที่: ' + booking.useDate + '  เวลา: ' + booking.timeSlot +
    '\nปลายทาง: ' + booking.destination +
    '\nกรุณาติดต่อผู้ดูแลระบบเพื่อขอข้อมูลเพิ่มเติม';
}

function _msgCancelledDriver(booking) {
  return '*** แจ้งเตือน: งานของคุณถูกยกเลิก ***' +
    '\nรหัส: ' + booking.id +
    '\nวันที่: ' + booking.useDate + '  เวลา: ' + booking.timeSlot +
    '\nปลายทาง: ' + booking.destination;
}

// =========================================================
// Notifications — Email + LINE รวมกัน
// =========================================================

function addBookingAndNotify(d) {
  var result = addBooking(d);
  if (!result.success) return result;
  try {
    var cfg = getSystemConfig().config;
    if (cfg.notifyNewBooking && cfg.adminTelegramChatId) {
      // สร้าง booking object จาก d สำหรับ LINE message
      var bObj = {
        id: result.id, bookerName: d.bookerName, dept: d.dept,
        useDate: d.useDate, timeSlot: d.timeSlot,
        destination: d.destination, selfDrive: d.selfDrive,
        passengers: d.passengers
      };
      sendTelegram(cfg.adminTelegramChatId, _msgNewBooking(bObj));
    }
  } catch(e) {}
  return result;
}

function cancelBookingAndNotify(p) {
  var booking = getBookingById(p.id);
  var result = updateBooking({ id: p.id, updates: { status: 'cancelled' } });
  if (!result.success || !booking) return result;
  try {
    var cfg = getSystemConfig().config;
    if (cfg.notifyCancel) {
      // แจ้งผู้จอง
      var booker = getUserByUsername(booking.bookerId);
      if (booker) {
        if (booker.email) {
          sendCancelEmail(booker.email, booker.name, booking);
        }
        if (booker.telegramChatId) sendTelegram(booker.telegramChatId, _msgCancelledBooker(booking));
      }
      // แจ้งคนขับ (ถ้ามี)
      if (booking.driverId && booking.driverId !== 'SELF') {
        var driver = getUserByUsername(booking.driverId);
        if (driver) {
          if (driver.email) sendDriverCancelEmail(driver.email, driver.name, booking);
          if (driver.telegramChatId) sendTelegram(driver.telegramChatId, _msgCancelledDriver(booking));
        }
      }
    }
  } catch(e) {}
  return result;
}

function assignDriverAndNotify(p) {
  var updates = {
    status: 'approved',
    driverId: p.selfDrive ? 'SELF' : (p.driverId || ''),
    driverName: p.selfDrive ? 'ผู้จองขับเอง' : (p.driverName || ''),
    mileStart: p.mileStart || '',
    vehicleId: p.vehicleId || '',
    plate: p.plate || '',
    vehicleBrand: p.vehicleBrand || '',
    selfDrive: p.selfDrive ? 'true' : 'false'
  };
  var result = updateBooking({ id: p.id, updates: updates });
  if (result.success) {
    try {
      var cfg = getSystemConfig().config;
      var booking = getBookingById(p.id);
      if (booking) {
        var plate = p.plate || '-';
        var driverName = p.selfDrive ? 'ผู้จองขับเอง' : (p.driverName || '-');

        // แจ้งผู้จอง
        var booker = getUserByUsername(booking.bookerId);
        if (booker) {
          if (booker.email) sendBookingConfirmEmail(booker.email, booker.name, booking, p);
          if (cfg.notifyAssign && booker.telegramChatId) {
            sendTelegram(booker.telegramChatId, _msgApproved(booking, plate, driverName));
          }
        }

        // แจ้งคนขับ (ถ้าไม่ใช่ selfDrive)
        if (!p.selfDrive && p.driverId) {
          var driver = getUserByUsername(p.driverId);
          if (driver) {
            if (driver.email) sendDriverAssignEmail(driver.email, driver.name, booking, p);
            if (cfg.notifyAssign && driver.telegramChatId) {
              sendTelegram(driver.telegramChatId, _msgDriverAssigned(booking, plate));
            }
          }
        }
      }
    } catch(e) {}
  }
  return result;
}

function notifyDriverOnUpdate(bookingId, updaterName) {
  try {
    var booking = getBookingById(bookingId);
    if (!booking || !booking.driverId || booking.driverId === 'SELF') return;
    var driver = getUserByUsername(booking.driverId);
    if (driver && driver.email) {
      sendDriverUpdateEmail(driver.email, driver.name, booking, updaterName);
    }
  } catch(e) {}
}

// ── Email functions ────────────────────────────────────────

function sendBookingConfirmEmail(toEmail, toName, booking, assignData) {
  var plate = assignData.plate || booking.plate || '-';
  var brand = assignData.vehicleBrand || booking.vehicleBrand || '-';
  var driverName = assignData.selfDrive ? 'ผู้จองขับเอง' : (assignData.driverName || '-');
  var subject = '[ระบบจองรถ] [อนุมัติ] อนุมัติการจอง ' + booking.id;
  var body =
    'เรียน คุณ' + toName + '\n\n' +
    'การจองรถของท่านได้รับการอนุมัติเรียบร้อยแล้ว\n\n' +
    '─────────────────────────────\n' +
    'รหัสการจอง : ' + booking.id + '\n' +
    'วันที่เดินทาง : ' + booking.useDate + '\n' +
    'ช่วงเวลา : ' + booking.timeSlot + '\n' +
    'จุดหมาย : ' + booking.destination + '\n' +
    'รถที่จัดให้ : ' + plate + ' (' + brand + ')\n' +
    'คนขับ : ' + driverName + '\n' +
    '─────────────────────────────\n\n' +
    'หากมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ\n\n' +
    'ระบบจองรถ (อัตโนมัติ — กรุณาอย่าตอบกลับ)';
  MailApp.sendEmail({ to: toEmail, subject: subject, body: body });
}

function sendDriverAssignEmail(toEmail, toName, booking, assignData) {
  var plate = assignData.plate || '-';
  var brand = assignData.vehicleBrand || '-';
  var subject = '[ระบบจองรถ] [งานใหม่] มีงานใหม่ — ' + booking.useDate;
  var body =
    'เรียน คุณ' + toName + '\n\n' +
    'ท่านได้รับมอบหมายงานขับรถ\n\n' +
    '─────────────────────────────\n' +
    'รหัสการจอง : ' + booking.id + '\n' +
    'ผู้โดยสาร : ' + booking.bookerName + ' (' + booking.dept + ')\n' +
    'วันที่ : ' + booking.useDate + '\n' +
    'ช่วงเวลา : ' + booking.timeSlot + '\n' +
    'จุดหมาย : ' + booking.destination + '\n' +
    'รถ : ' + plate + ' (' + brand + ')\n' +
    'เลขไมล์เริ่ม : ' + (assignData.mileStart || '-') + '\n' +
    '─────────────────────────────\n\n' +
    'กรุณาเข้าระบบเพื่อยืนยันรับทราบงาน\n\n' +
    'ระบบจองรถ (อัตโนมัติ — กรุณาอย่าตอบกลับ)';
  MailApp.sendEmail({ to: toEmail, subject: subject, body: body });
}

function sendDriverUpdateEmail(toEmail, toName, booking, updaterName) {
  var subject = '[ระบบจองรถ] ✏️ งานของท่านมีการแก้ไข — ' + booking.id;
  var body =
    'เรียน คุณ' + toName + '\n\n' +
    'งานที่ท่านได้รับมอบหมายมีการแก้ไขข้อมูล โดย ' + (updaterName || 'Admin') + '\n\n' +
    '─────────────────────────────\n' +
    'รหัสการจอง : ' + booking.id + '\n' +
    'ผู้โดยสาร : ' + booking.bookerName + '\n' +
    'วันที่ : ' + booking.useDate + '\n' +
    'ช่วงเวลา : ' + booking.timeSlot + '\n' +
    'จุดหมาย : ' + booking.destination + '\n' +
    '─────────────────────────────\n\n' +
    'กรุณาเข้าระบบเพื่อตรวจสอบรายละเอียดล่าสุด\n\n' +
    'ระบบจองรถ (อัตโนมัติ — กรุณาอย่าตอบกลับ)';
  MailApp.sendEmail({ to: toEmail, subject: subject, body: body });
}

function sendCancelEmail(toEmail, toName, booking) {
  var subject = '[ระบบจองรถ] [ยกเลิก] การจองถูกยกเลิก — ' + booking.id;
  var body =
    'เรียน คุณ' + toName + '\n\n' +
    'การจองรถของท่านได้ถูกยกเลิกแล้ว\n\n' +
    '─────────────────────────────\n' +
    'รหัสการจอง : ' + booking.id + '\n' +
    'วันที่เดินทาง : ' + booking.useDate + '\n' +
    'ช่วงเวลา : ' + booking.timeSlot + '\n' +
    'จุดหมาย : ' + booking.destination + '\n' +
    '─────────────────────────────\n\n' +
    'หากมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ\n\n' +
    'ระบบจองรถ (อัตโนมัติ — กรุณาอย่าตอบกลับ)';
  MailApp.sendEmail({ to: toEmail, subject: subject, body: body });
}

function sendDriverCancelEmail(toEmail, toName, booking) {
  var subject = '[ระบบจองรถ] [ยกเลิก] งานถูกยกเลิก — ' + booking.id;
  var body =
    'เรียน คุณ' + toName + '\n\n' +
    'งานที่ท่านได้รับมอบหมายได้ถูกยกเลิกแล้ว\n\n' +
    '─────────────────────────────\n' +
    'รหัสการจอง : ' + booking.id + '\n' +
    'วันที่ : ' + booking.useDate + '\n' +
    'ช่วงเวลา : ' + booking.timeSlot + '\n' +
    'จุดหมาย : ' + booking.destination + '\n' +
    '─────────────────────────────\n\n' +
    'ระบบจองรถ (อัตโนมัติ — กรุณาอย่าตอบกลับ)';
  MailApp.sendEmail({ to: toEmail, subject: subject, body: body });
}

// ─── Google Drive Upload ───────────────────────────────────

function uploadFileToDrive(d) {
  var folder;
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(DRIVE_FOLDER);
  }
  var bytes = Utilities.base64Decode(d.base64);
  var blob  = Utilities.newBlob(bytes, d.mimeType || 'application/octet-stream', d.filename || 'file');
  var file  = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { success: true, url: file.getUrl(), id: file.getId(), name: d.filename };
}

// ─── Access Log ────────────────────────────────────────────

function writeAccessLog(d) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SH_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SH_LOG);
    sheet.appendRow(['timestamp','username','name','role','action','detail','result']);
    sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  sheet.appendRow([now, d.username||'', d.name||'', d.role||'', d.action||'', d.detail||'', d.result||'success']);
}

function getAccessLog(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_LOG);
  if (!sheet) return { success:true, logs:[] };
  var rows  = sheet.getDataRange().getValues();
  var limit = d && d.limit ? parseInt(d.limit) : 200;
  var logs  = [];
  for (var i = rows.length-1; i >= 1 && logs.length < limit; i--) {
    logs.push({ timestamp:rows[i][0], username:rows[i][1], name:rows[i][2], role:rows[i][3],
                action:rows[i][4], detail:rows[i][5], result:rows[i][6] });
  }
  return { success:true, logs:logs };
}

// ─── Init Sheets ───────────────────────────────────────────

function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var us = ss.getSheetByName(SH_USERS);
  if (!us) {
    us = ss.insertSheet(SH_USERS);
    us.appendRow(['username','password','name','role','dept','email','telegramChatId']);
    us.appendRow(['superadmin','superadmin','Super Admin','superadmin','ฝ่ายบริหาร','','']);
    us.appendRow(['admin','admin123','คุณสมชาย (Admin)','admin','ฝ่ายบริหาร','','']);
    us.appendRow(['driver1','driver123','นายวิชัย ใจดี','driver','ฝ่ายขนส่ง','','']);
    us.appendRow(['driver2','driver123','นายสมศักดิ์ มีชัย','driver','ฝ่ายขนส่ง','','']);
    us.appendRow(['user1','user123','น.ส.วรรณา สวยงาม','booker','ฝ่ายการตลาด','','']);
    us.appendRow(['user2','user123','นายธนกร รวยทรัพย์','booker','ฝ่ายบัญชี','','']);
  } else {
    // เพิ่มคอลัมน์ lineToken ถ้ายังไม่มี
    var headers = us.getRange(1, 1, 1, us.getLastColumn()).getValues()[0];
    if (headers.indexOf('telegramChatId') < 0) {
      var nc = us.getLastColumn() + 1;
      us.getRange(1, nc).setValue('telegramChatId').setFontWeight('bold').setBackground('#0088cc').setFontColor('white');
    }
  }

  var vs = ss.getSheetByName(SH_VEHICLE);
  if (!vs) {
    vs = ss.insertSheet(SH_VEHICLE);
    vs.appendRow(['id','plate','brand','color','active']);
    vs.appendRow(['V001','กข 1234 กรุงเทพ','Toyota Camry','ขาว','TRUE']);
    vs.appendRow(['V002','กค 5678 กรุงเทพ','Honda CRV','เงิน','TRUE']);
    vs.appendRow(['V003','งจ 9012 นนทบุรี','Isuzu D-Max','ดำ','TRUE']);
    vs.appendRow(['V004','ฉฉ 3456 กรุงเทพ','Toyota Fortuner','เทา','TRUE']);
  }

  var bs = ss.getSheetByName(SH_BOOKING);
  if (!bs) {
    bs = ss.insertSheet(SH_BOOKING);
    bs.appendRow(['id','bookerId','bookerName','dept','vehicleId','plate','vehicleBrand',
                  'bookDate','useDate','timeSlot','destination','purpose','passengers','note','selfDrive','status',
                  'driverId','driverName','mileStart','mileEnd','startLocation','endLocation',
                  'startTime','endTime','createdAt','updatedAt']);
  }

  var fs = ss.getSheetByName(SH_FUEL);
  if (!fs) {
    fs = ss.insertSheet(SH_FUEL);
    fs.appendRow(['id','driverId','driverName','vehicleId','plate','brand','date','km','fuelType','liters','pricePerLiter','totalCost','note']);
  }

  var ms = ss.getSheetByName(SH_MAINTENANCE);
  if (!ms) {
    ms = ss.insertSheet(SH_MAINTENANCE);
    ms.appendRow(['id','date','vehicleId','plate','brand','operator','garage','parts','km','cost','note','attachments']);
  }

  var sheets = [us, vs, bs, fs, ms];
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i]) {
      sheets[i].getRange(1, 1, 1, sheets[i].getLastColumn())
        .setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
      sheets[i].setFrozenRows(1);
    }
  }
  return { success: true, message: 'สร้าง Sheets เรียบร้อยแล้ว' };
}

// ─── Helpers ───────────────────────────────────────────────

function getRows(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    result.push(obj);
  }
  return result;
}

function getUserByUsername(username) {
  var rows = getRows(SH_USERS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].username === username) return rows[i];
  }
  return null;
}

function getBookingById(id) {
  var rows = getRows(SH_BOOKING);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

// ─── Users ─────────────────────────────────────────────────

function login(d) {
  var rows = getRows(SH_USERS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].username === d.username && rows[i].password === d.password) {
      return { success: true, user: {
        username:  rows[i].username,
        name:      rows[i].name,
        role:      rows[i].role,
        dept:      rows[i].dept,
        email:     rows[i].email     || '',
        telegramChatId: rows[i].telegramChatId || ''
      }};
    }
  }
  return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

function getUsers() {
  var rows = getRows(SH_USERS);
  var users = [];
  for (var i = 0; i < rows.length; i++) {
    users.push({
      username:  rows[i].username,
      name:      rows[i].name,
      role:      rows[i].role,
      dept:      rows[i].dept,
      email:     rows[i].email     || '',
      telegramChatId: rows[i].telegramChatId || ''
    });
  }
  return { success: true, users: users };
}

function _ensureUserColumn(sheet, headers, colName, color) {
  if (headers.indexOf(colName) < 0) {
    var nc = sheet.getLastColumn() + 1;
    sheet.getRange(1, nc).setValue(colName)
      .setFontWeight('bold').setBackground(color || '#1a73e8').setFontColor('white');
    return nc - 1; // 0-based index
  }
  return headers.indexOf(colName);
}

function addUser(d) {
  var rows = getRows(SH_USERS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].username === d.username) return { success: false, error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' };
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_USERS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  _ensureUserColumn(sheet, headers, 'email', '#1a73e8');
  _ensureUserColumn(sheet, headers, 'telegramChatId', '#0088cc');
  sheet.appendRow([d.username, d.password, d.name, d.role, d.dept || '', d.email || '', d.telegramChatId || '']);
  return { success: true };
}

function updateUser(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_USERS);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  _ensureUserColumn(sheet, headers, 'email', '#1a73e8');
  // ดึง headers ใหม่หลังเพิ่ม column
  headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  _ensureUserColumn(sheet, headers, 'telegramChatId', '#0088cc');
  headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === d.username) {
      var row = i + 1;
      if (d.password) sheet.getRange(row, 2).setValue(d.password);
      sheet.getRange(row, 3).setValue(d.name);
      sheet.getRange(row, 4).setValue(d.role);
      sheet.getRange(row, 5).setValue(d.dept || '');
      var emailIdx   = headers.indexOf('email');
      var telegramIdx = headers.indexOf('telegramChatId');
      if (emailIdx  >= 0) sheet.getRange(row, emailIdx  + 1).setValue(d.email     || '');
      if (telegramIdx >= 0) sheet.getRange(row, telegramIdx + 1).setValue(d.telegramChatId || '');
      return { success: true };
    }
  }
  return { success: false, error: 'ไม่พบผู้ใช้' };
}

function deleteUser(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_USERS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === d.username) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'ไม่พบผู้ใช้' };
}

// ─── Vehicles ──────────────────────────────────────────────

function getVehicles() {
  var rows = getRows(SH_VEHICLE);
  var vehicles = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].active === true || rows[i].active === 'TRUE') {
      vehicles.push(rows[i]);
    }
  }
  return { success: true, vehicles: vehicles };
}

function addVehicle(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_VEHICLE);
  var rows = getRows(SH_VEHICLE);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].plate === d.plate && (rows[i].active === true || rows[i].active === 'TRUE')) {
      return { success: false, error: 'ทะเบียนนี้มีอยู่แล้ว' };
    }
  }
  var id = 'V' + new Date().getTime().toString().slice(-6);
  sheet.appendRow([id, d.plate, d.brand, d.color || '', 'TRUE']);
  return { success: true, id: id };
}

function updateVehicle(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_VEHICLE);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      var row = i + 1;
      var plateCol = headers.indexOf('plate');
      var brandCol = headers.indexOf('brand');
      var colorCol = headers.indexOf('color');
      if (plateCol >= 0) sheet.getRange(row, plateCol + 1).setValue(d.plate);
      if (brandCol >= 0) sheet.getRange(row, brandCol + 1).setValue(d.brand);
      if (colorCol >= 0) sheet.getRange(row, colorCol + 1).setValue(d.color || '');
      return { success: true };
    }
  }
  return { success: false, error: 'ไม่พบรถ' };
}

function deleteVehicle(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_VEHICLE);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var activeCol = headers.indexOf('active');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      if (activeCol >= 0) sheet.getRange(i + 1, activeCol + 1).setValue('FALSE');
      return { success: true };
    }
  }
  return { success: false, error: 'ไม่พบรถ' };
}

// ─── Bookings ──────────────────────────────────────────────

function getBookings(d) {
  var list = getRows(SH_BOOKING);
  if (d.role === 'superadmin') d.role = 'admin';
  if (d.role === 'booker') {
    var filtered = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].bookerId === d.username) filtered.push(list[i]);
    }
    list = filtered;
  }
  if (d.role === 'driver') {
    var filtered2 = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].driverId === d.username) filtered2.push(list[i]);
    }
    list = filtered2;
  }
  return { success: true, bookings: list };
}

function addBooking(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_BOOKING);
  var id = 'BK' + new Date().getTime().toString().slice(-6);
  var now = new Date().toISOString();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('selfDrive') < 0) {
    var noteIdx = headers.indexOf('note');
    if (noteIdx >= 0) {
      sheet.insertColumnAfter(noteIdx + 1);
      sheet.getRange(1, noteIdx + 2).setValue('selfDrive');
      sheet.getRange(1, noteIdx + 2).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
    }
  }
  sheet.appendRow([id, d.bookerId, d.bookerName, d.dept, d.vehicleId || '', d.plate || '', d.vehicleBrand || '',
                   d.bookDate, d.useDate, d.timeSlot, d.destination, d.purpose, d.passengers || 1, d.note || '',
                   d.selfDrive ? 'true' : 'false',
                   'pending', '', '', '', '', '', '', '', '', now, now]);
  return { success: true, id: id };
}

function updateBooking(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_BOOKING);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      var row = i + 1;
      var keys = Object.keys(d.updates);
      for (var k = 0; k < keys.length; k++) {
        var col = headers.indexOf(keys[k]);
        if (col >= 0) sheet.getRange(row, col + 1).setValue(d.updates[keys[k]]);
      }
      var updCol = headers.indexOf('updatedAt');
      if (updCol >= 0) sheet.getRange(row, updCol + 1).setValue(new Date().toISOString());
      return { success: true };
    }
  }
  return { success: false, error: 'ไม่พบรายการ' };
}

// ─── Fuel ──────────────────────────────────────────────────

function getFuelLogs(d) {
  var list = getRows(SH_FUEL);
  if (d && d.driverId) list = list.filter(function(f){ return f.driverId === d.driverId; });
  return { success: true, fuelLogs: list };
}

function addFuelLog(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_FUEL);
  var id = 'FL' + new Date().getTime().toString().slice(-6);
  sheet.appendRow([id, d.driverId, d.driverName, d.vehicleId, d.plate, d.brand||'',
                   d.date, d.km||0, d.fuelType, d.liters||0, d.pricePerLiter||0, d.totalCost||0, d.note||'']);
  return { success: true, id: id };
}

function deleteFuelLog(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_FUEL);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { success: false, error: 'ไม่พบรายการ' };
}

// ─── Maintenance ───────────────────────────────────────────

function getMaintenance() {
  return { success: true, maintenanceList: getRows(SH_MAINTENANCE) };
}

function addMaintenance(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MAINTENANCE);
  var id = 'MT' + new Date().getTime().toString().slice(-6);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('attachments') < 0) {
    var newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue('attachments');
    sheet.getRange(1, newCol).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  }
  sheet.appendRow([id, d.date, d.vehicleId, d.plate, d.brand||'', d.operator||'',
                   d.garage, d.parts, d.km||0, d.cost||0, d.note||'', d.attachments||'']);
  return { success: true, id: id };
}

function updateMaintenanceFn(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MAINTENANCE);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      var row = i + 1;
      var fields = ['date','vehicleId','plate','brand','operator','garage','parts','km','cost','note','attachments'];
      for (var k = 0; k < fields.length; k++) {
        var col = headers.indexOf(fields[k]);
        if (col >= 0 && d[fields[k]] !== undefined) sheet.getRange(row, col + 1).setValue(d[fields[k]]);
      }
      return { success: true };
    }
  }
  return { success: false, error: 'ไม่พบรายการ' };
}

function deleteMaintenance(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_MAINTENANCE);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { success: false, error: 'ไม่พบรายการ' };
}
