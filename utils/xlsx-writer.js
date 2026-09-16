/**
 * 极简 XLSX（Excel 2007+）写入器 —— 不依赖任何第三方库，可直接在微信小程序中运行。
 *
 * 用法：
 *   var xlsx = require('../../utils/xlsx-writer.js')
 *   var bytes = xlsx.build([
 *     { name: '收入', rows: [ ['日期','金额'], ['2026-09-01', 100.5] ] },
 *     { name: '支出', rows: [ ['日期','金额'], ['2026-09-02', -80] ] }
 *   ])
 *   // bytes 为 Uint8Array，可直接传给 wx.getFileSystemManager().writeFile({ data: bytes.buffer })
 *
 * 单元格 cell 支持：string | number | null | undefined | ''（number 写入为数值，其余写入为文本）
 * 采用 sharedStrings + 存储（不压缩）方式，兼容性最好（手机 WPS、微信预览、Excel 均正常显示中文）。
 */

/* ---------------- UTF-8 编码（手写，避免依赖 escape/unescape） ---------------- */
function utf8Bytes(str) {
  var bytes = []
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i)
    if (c < 0x80) {
      bytes.push(c)
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c >= 0xd800 && c <= 0xdbff) {
      var c2 = str.charCodeAt(++i)
      var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  var arr = new Uint8Array(bytes.length)
  for (var j = 0; j < bytes.length; j++) arr[j] = bytes[j]
  return arr
}

/* ---------------- CRC32（ZIP 必需） ---------------- */
var CRC_TABLE = (function () {
  var table = new Uint32Array(256)
  for (var n = 0; n < 256; n++) {
    var c = n
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  var c = 0xffffffff
  for (var i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/* ---------------- XML 转义 ---------------- */
function escapeXML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/* ---------------- 列字母 A, B, ..., Z, AA ... ---------------- */
function colLetter(n) {
  var s = ''
  n = n + 1
  while (n > 0) {
    var r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/* ---------------- sharedStrings ---------------- */
function createSST() {
  var list = []
  var map = {}
  var totalRefs = 0
  return {
    index: function (str) {
      var s = String(str)
      if (map.hasOwnProperty(s)) {
        var item = list[map[s]]
        item.count++
        totalRefs++
        return map[s]
      }
      var idx = list.length
      list.push({ text: s, count: 1 })
      map[s] = idx
      totalRefs++
      return idx
    },
    xml: function () {
      var sb = []
      sb.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
      sb.push('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + totalRefs + '" uniqueCount="' + list.length + '">')
      for (var i = 0; i < list.length; i++) {
        sb.push('<si><t xml:space="preserve">' + escapeXML(list[i].text) + '</t></si>')
      }
      sb.push('</sst>')
      return sb.join('')
    },
    hasStrings: function () { return list.length > 0 }
  }
}

/* ---------------- 单个 worksheet 的 XML ---------------- */
function sheetXML(sheet, sst) {
  var rows = sheet.rows || []
  var merges = sheet.merges || []
  var sb = []
  sb.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  sb.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
  sb.push('<sheetData>')
  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i] || []
    sb.push('<row r="' + (i + 1) + '">')
    for (var j = 0; j < cells.length; j++) {
      var v = cells[j]
      var ref = colLetter(j) + (i + 1)
      if (v === null || v === undefined || v === '') {
        sb.push('<c r="' + ref + '"/>')
      } else if (typeof v === 'number' && isFinite(v)) {
        var num = Math.round(v * 100) / 100
        sb.push('<c r="' + ref + '" t="n"><v>' + num + '</v></c>')
      } else {
        sb.push('<c r="' + ref + '" t="s"><v>' + sst.index(v) + '</v></c>')
      }
    }
    sb.push('</row>')
  }
  sb.push('</sheetData>')
  if (merges.length) {
    sb.push('<mergeCells count="' + merges.length + '">')
    for (var m = 0; m < merges.length; m++) {
      sb.push('<mergeCell ref="' + merges[m][0] + ':' + merges[m][1] + '"/>')
    }
    sb.push('</mergeCells>')
  }
  sb.push('</worksheet>')
  return sb.join('')
}

/* ---------------- 组装 .xlsx（本质是一个 ZIP 包） ---------------- */
function build(sheets) {
  sheets = sheets || []
  if (!sheets.length) throw new Error('至少需要一个工作表')

  sheets = sheets.map(function (s, idx) {
    var name = String(s.name || ('Sheet' + (idx + 1)))
    name = name.replace(/[\\/?*\[\]:]/g, '_').slice(0, 31)
    if (!name) name = 'Sheet' + (idx + 1)
    return { name: name, rows: s.rows || [], merges: s.merges || [] }
  })

  var sst = createSST()

  var now = new Date()
  var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  var files = []

  // [Content_Types].xml
  var overrides = ''
  for (var s = 1; s <= sheets.length; s++) {
    overrides += '<Override PartName="/xl/worksheets/sheet' + s + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  }
  overrides += '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
  files.push({ name: '[Content_Types].xml', data: utf8Bytes(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides +
    '</Types>'
  ) })

  files.push({ name: '_rels/.rels', data: utf8Bytes(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  ) })

  // xl/workbook.xml + xl/_rels/workbook.xml.rels
  var sheetTags = ''
  var relTags = ''
  for (var s2 = 1; s2 <= sheets.length; s2++) {
    sheetTags += '<sheet name="' + escapeXML(sheets[s2 - 1].name) + '" sheetId="' + s2 + '" r:id="rId' + s2 + '"/>'
    relTags += '<Relationship Id="rId' + s2 + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + s2 + '.xml"/>'
  }
  // sharedStrings relationship
  relTags += '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'

  files.push({ name: 'xl/workbook.xml', data: utf8Bytes(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + sheetTags + '</sheets></workbook>'
  ) })
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: utf8Bytes(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + relTags + '</Relationships>'
  ) })

  for (var s3 = 1; s3 <= sheets.length; s3++) {
    files.push({ name: 'xl/worksheets/sheet' + s3 + '.xml', data: utf8Bytes(sheetXML(sheets[s3 - 1], sst)) })
  }

  if (sst.hasStrings()) {
    files.push({ name: 'xl/sharedStrings.xml', data: utf8Bytes(sst.xml()) })
  }

  return zip(files, dosTime, dosDate)
}

/* ---------------- ZIP（存储，不压缩）打包 ---------------- */
function zip(files, dosTime, dosDate) {
  var localParts = []
  var centralParts = []
  var offset = 0

  for (var i = 0; i < files.length; i++) {
    var f = files[i]
    var nameBytes = utf8Bytes(f.name)
    var data = f.data
    var crc = crc32(data)
    var size = data.length

    var lh = new Uint8Array(30 + nameBytes.length)
    var lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    lh.set(nameBytes, 30)
    localParts.push(lh)
    localParts.push(data)

    var ch = new Uint8Array(46 + nameBytes.length)
    var cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    ch.set(nameBytes, 46)
    centralParts.push(ch)

    offset += lh.length + data.length
  }

  var centralSize = 0
  centralParts.forEach(function (c) { centralSize += c.length })
  var localSize = 0
  localParts.forEach(function (p) { localSize += p.length })

  var result = new Uint8Array(localSize + centralSize + 22)
  var pos = 0
  localParts.forEach(function (p) { result.set(p, pos); pos += p.length })
  centralParts.forEach(function (p) { result.set(p, pos); pos += p.length })

  var eocd = new Uint8Array(22)
  var ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, localSize, true)
  ev.setUint16(20, 0, true)
  result.set(eocd, pos)

  return result
}

module.exports = {
  build: build
}
