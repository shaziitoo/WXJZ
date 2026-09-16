/**
 * 金额与日期格式化工具
 * 约定：金额在系统内部一律以「分」为单位的整数存储与运算，避免浮点误差
 */

/** 元（字符串/数字）→ 分（整数） */
function toFen(value) {
  if (value === '' || value === null || value === undefined) return 0
  var n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.]/g, ''))
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

/** 分 → 元（number，保留两位小数） */
function toYuan(fen) {
  return Math.round((fen || 0) * 100 / 100) / 100
}

/**
 * 分 → 带货币符号的展示字符串，如 ¥1,234.56
 * @param {number} fen
 * @param {object} opts { sign: 是否带 ¥, decimals: 小数位 }
 */
function money(fen, opts) {
  opts = opts || {}
  var decimals = opts.decimals === undefined ? 2 : opts.decimals
  var negative = (fen || 0) < 0
  var abs = Math.abs(fen || 0)
  var yuan = (abs / 100).toFixed(decimals)
  var parts = yuan.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  var str = (negative ? '-' : '') + (opts.sign === false ? '' : '¥') + parts.join('.')
  return str
}

/** 大额金额紧凑显示：12,345.67 → 1.23万 */
function moneyCompact(fen) {
  var yuan = Math.abs(fen || 0) / 100
  var signStr = (fen || 0) < 0 ? '-' : ''
  if (yuan >= 100000000) return signStr + '¥' + (yuan / 100000000).toFixed(2) + '亿'
  if (yuan >= 10000) return signStr + '¥' + (yuan / 10000).toFixed(2) + '万'
  return signStr + money(Math.abs(fen || 0))
}

/** 补零 */
function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** Date → 'YYYY-MM-DD' */
function dateStr(d) {
  d = d || new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** 'YYYY-MM-DD' → '9月5日'（今年省略年份，跨年补年份）*/
function dateCN(str) {
  if (!str) return ''
  var p = str.split('-')
  if (p.length < 3) return str
  var now = new Date()
  var y = parseInt(p[0], 10)
  if (y !== now.getFullYear()) return y + '年' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日'
  return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日'
}

/** 'YYYY-MM-DD' → '2026-09' */
function monthKey(str) {
  return str ? str.slice(0, 7) : ''
}

/** '2026-09' → '9月' */
function monthCN(key) {
  if (!key) return ''
  var p = key.split('-')
  var m = parseInt(p[1], 10)
  if (p[0] !== String(new Date().getFullYear())) return p[0].slice(2) + '/' + m + '月'
  return m + '月'
}

/** 星期几 */
function weekdayCN(str) {
  if (!str) return ''
  var d = new Date(str.replace(/-/g, '/'))
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
}

/** 今天 / 昨天 */
function isToday(str) {
  return str === dateStr()
}

function isYesterday(str) {
  var y = new Date()
  y.setDate(y.getDate() - 1)
  return str === dateStr(y)
}

/** 生成最近 n 个月的 monthKey 数组（含当月，由旧到新） */
function recentMonths(n) {
  var list = []
  var now = new Date()
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    list.push(d.getFullYear() + '-' + pad(d.getMonth() + 1))
  }
  return list
}

/** 相对时间描述 */
function fromNow(ts) {
  if (!ts) return ''
  var diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前'
  var d = new Date(ts)
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

module.exports = {
  toFen: toFen,
  toYuan: toYuan,
  money: money,
  moneyCompact: moneyCompact,
  dateStr: dateStr,
  dateCN: dateCN,
  monthKey: monthKey,
  monthCN: monthCN,
  weekdayCN: weekdayCN,
  isToday: isToday,
  isYesterday: isYesterday,
  recentMonths: recentMonths,
  fromNow: fromNow,
  pad: pad
}
