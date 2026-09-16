/**
 * 统计计算：收支汇总、分类占比、月度趋势
 * 所有金额均为「分」
 */

var store = require('./store.js')
var format = require('./format.js')

/** 汇总：收入、支出、结余、笔数 */
function summarize(records) {
  var income = 0
  var expense = 0
  ;(records || []).forEach(function (r) {
    if (r.type === 'income') income += r.amount
    else expense += r.amount
  })
  return {
    income: income,
    expense: expense,
    balance: income - expense,
    count: (records || []).length
  }
}

/**
 * 分类聚合
 * @param {Array} records
 * @param {string} type 'expense' | 'income'
 * @returns {Array} [{ id, name, color, total, count, percent }] 按金额倒序
 */
function groupByCategory(records, type) {
  var map = {}
  var total = 0
  ;(records || []).forEach(function (r) {
    if (r.type !== type) return
    var cat = store.resolveCategory(type, r.categoryId, r.categoryName)
    var key = cat.id || cat.name
    if (!map[key]) {
      map[key] = { id: cat.id, name: cat.name, color: cat.color, total: 0, count: 0 }
    }
    map[key].total += r.amount
    map[key].count++
    total += r.amount
  })
  var list = Object.keys(map).map(function (k) { return map[k] })
  list.sort(function (a, b) { return b.total - a.total })
  list.forEach(function (item) {
    item.percent = total > 0 ? Math.round(item.total * 1000 / total) / 10 : 0
  })
  return { list: list, total: total }
}

/**
 * 月度趋势：最近 n 个月的收入/支出
 * @returns {Array} [{ key, label, income, expense }]
 */
function monthlyTrend(records, months) {
  months = months || 6
  var keys = format.recentMonths(months)
  var map = {}
  keys.forEach(function (k) { map[k] = { key: k, label: format.monthCN(k), income: 0, expense: 0 } })
  ;(records || []).forEach(function (r) {
    var k = format.monthKey(r.date)
    if (!map[k]) return
    if (r.type === 'income') map[k].income += r.amount
    else map[k].expense += r.amount
  })
  return keys.map(function (k) { return map[k] })
}

/** 按日期分组（用于流水列表），返回 [{ date, label, weekday, income, expense, items }] */
function groupByDate(records) {
  var map = {}
  var order = []
  ;(records || []).forEach(function (r) {
    if (!map[r.date]) {
      map[r.date] = { date: r.date, income: 0, expense: 0, items: [] }
      order.push(r.date)
    }
    map[r.date].items.push(r)
    if (r.type === 'income') map[r.date].income += r.amount
    else map[r.date].expense += r.amount
  })
  return order.map(function (d) {
    var g = map[d]
    var label = format.dateCN(d)
    if (format.isToday(d)) label = '今天'
    else if (format.isYesterday(d)) label = '昨天'
    g.label = label
    g.weekday = format.weekdayCN(d)
    return g
  })
}

/**
 * 流水筛选
 * @param {Array} records
 * @param {Object} filter { type: 'all'|'expense'|'income', categoryId, start, end, keyword }
 */
function filterRecords(records, filter) {
  filter = filter || {}
  return (records || []).filter(function (r) {
    if (filter.type && filter.type !== 'all' && r.type !== filter.type) return false
    if (filter.categoryId && r.categoryId !== filter.categoryId) return false
    if (filter.start && r.date < filter.start) return false
    if (filter.end && r.date > filter.end) return false
    if (filter.keyword) {
      var kw = String(filter.keyword).trim().toLowerCase()
      if (!kw) return true
      var hit = (r.note || '').toLowerCase().indexOf(kw) >= 0 ||
        (r.categoryName || '').toLowerCase().indexOf(kw) >= 0 ||
        String(format.toYuan(r.amount)).indexOf(kw) >= 0
      if (!hit) return false
    }
    return true
  })
}

/** 工程卡片上的汇总信息 */
function projectSummary(projectId) {
  var records = store.getRecords(projectId)
  var s = summarize(records)
  s.incomeText = format.moneyCompact(s.income)
  s.expenseText = format.moneyCompact(s.expense)
  s.balanceText = format.moneyCompact(s.balance)
  s.balanceClass = s.balance > 0 ? 'money-income' : (s.balance < 0 ? 'money-expense' : 't-secondary')
  return s
}

module.exports = {
  summarize: summarize,
  groupByCategory: groupByCategory,
  monthlyTrend: monthlyTrend,
  groupByDate: groupByDate,
  filterRecords: filterRecords,
  projectSummary: projectSummary
}
