/**
 * 数据层：基于 wx.setStorageSync 的本地存储
 * 若要切换到云开发，只需替换本文件内部实现，页面层无需改动
 */

var format = require('./format.js')

var KEY_PROJECTS = 'pcm_projects'
var KEY_RECORDS = 'pcm_records'
var KEY_CATEGORIES = 'pcm_categories'

/* ------------------------------------------------------------------ */
/* 默认费用类别                                                        */
/* ------------------------------------------------------------------ */

var PALETTE = [
  '#378ADD', '#1D9E75', '#EF9F27', '#D4537E', '#7F77DD',
  '#639922', '#D85A30', '#85B7EB', '#0F6E56', '#BA7517',
  '#F0997B', '#AFA9EC', '#97C459', '#888780', '#5DCAA5'
]

var DEFAULT_EXPENSE = [
  '材料费', '人工费', '机械租赁', '分包工程', '运输费',
  '周转材料', '安全措施', '水电费', '住宿餐饮', '办公费',
  '检测试验', '其他支出'
]

var DEFAULT_INCOME = [
  '预付款', '进度款', '结算款', '签证变更', '质保金', '奖励款', '其他收入'
]

var UNKNOWN_COLOR = '#B4B2A9'

function buildDefaultCategories() {
  var expense = DEFAULT_EXPENSE.map(function (name, i) {
    return { id: 'ce_' + i, name: name, type: 'expense', color: PALETTE[i % PALETTE.length], builtin: true }
  })
  var income = DEFAULT_INCOME.map(function (name, i) {
    return { id: 'ci_' + i, name: name, type: 'income', color: PALETTE[(i + 5) % PALETTE.length], builtin: true }
  })
  return { expense: expense, income: income }
}

/* ------------------------------------------------------------------ */
/* 存储读写                                                            */
/* ------------------------------------------------------------------ */

function read(key, fallback) {
  try {
    var v = wx.getStorageSync(key)
    if (v === '' || v === null || v === undefined) return fallback
    return v
  } catch (e) {
    console.error('[store] read fail', key, e)
    return fallback
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error('[store] write fail', key, e)
    wx.showToast({ title: '存储空间不足', icon: 'none' })
    return false
  }
}

function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function nextColor(list) {
  var used = {}
  list.forEach(function (c) { used[c.color] = true })
  for (var i = 0; i < PALETTE.length; i++) {
    if (!used[PALETTE[i]]) return PALETTE[i]
  }
  return PALETTE[list.length % PALETTE.length]
}

/* 初始化：首次使用时写入默认类别 */
function init() {
  var cats = read(KEY_CATEGORIES, null)
  if (!cats || !cats.expense || !cats.income) {
    write(KEY_CATEGORIES, buildDefaultCategories())
  }
  if (!read(KEY_PROJECTS, null)) write(KEY_PROJECTS, [])
  if (!read(KEY_RECORDS, null)) write(KEY_RECORDS, [])
}

/* ------------------------------------------------------------------ */
/* 工程                                                                */
/* ------------------------------------------------------------------ */

function getProjects() {
  var list = read(KEY_PROJECTS, []) || []
  return list.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0) })
}

function getProject(id) {
  var list = read(KEY_PROJECTS, []) || []
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i]
  }
  return null
}

function createProject(data) {
  var list = read(KEY_PROJECTS, []) || []
  var now = Date.now()
  var project = {
    id: genId('p'),
    name: (data.name || '未命名工程').trim(),
    client: (data.client || '').trim(),
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    endDateTentative: !!data.endDateTentative,
    status: data.status || 'doing',
    note: (data.note || '').trim(),
    createdAt: now,
    updatedAt: now
  }
  list.unshift(project)
  write(KEY_PROJECTS, list)
  return project
}

function updateProject(id, data) {
  var list = read(KEY_PROJECTS, []) || []
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      var keys = ['name', 'client', 'startDate', 'endDate', 'endDateTentative', 'status', 'note']
      keys.forEach(function (k) {
        if (data[k] !== undefined) list[i][k] = typeof data[k] === 'string' ? data[k].trim() : data[k]
      })
      list[i].updatedAt = Date.now()
      write(KEY_PROJECTS, list)
      return list[i]
    }
  }
  return null
}

/** 删除工程，级联删除其下所有流水 */
function removeProject(id) {
  var list = read(KEY_PROJECTS, []) || []
  list = list.filter(function (p) { return p.id !== id })
  write(KEY_PROJECTS, list)

  var records = read(KEY_RECORDS, []) || []
  write(KEY_RECORDS, records.filter(function (r) { return r.projectId !== id }))
  return true
}

/* ------------------------------------------------------------------ */
/* 流水记录                                                            */
/* ------------------------------------------------------------------ */

function getAllRecords() {
  return read(KEY_RECORDS, []) || []
}

/** 按工程取流水，默认按日期倒序、创建时间倒序 */
function getRecords(projectId) {
  var list = getAllRecords().filter(function (r) { return r.projectId === projectId })
  return list.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
}

function getRecord(id) {
  var list = getAllRecords()
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i]
  }
  return null
}

function createRecord(data) {
  var list = getAllRecords()
  var now = Date.now()
  var record = {
    id: genId('r'),
    projectId: data.projectId,
    type: data.type === 'income' ? 'income' : 'expense',
    amount: format.toFen(data.amount),
    date: data.date || format.dateStr(),
    categoryId: data.categoryId || '',
    categoryName: data.categoryName || '未分类',
    note: (data.note || '').trim(),
    createdAt: now,
    updatedAt: now
  }
  list.push(record)
  write(KEY_RECORDS, list)
  return record
}

function updateRecord(id, data) {
  var list = getAllRecords()
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      if (data.type) list[i].type = data.type === 'income' ? 'income' : 'expense'
      if (data.amount !== undefined) list[i].amount = format.toFen(data.amount)
      if (data.date) list[i].date = data.date
      if (data.categoryId !== undefined) list[i].categoryId = data.categoryId
      if (data.categoryName !== undefined) list[i].categoryName = data.categoryName
      if (data.note !== undefined) list[i].note = String(data.note).trim()
      list[i].updatedAt = Date.now()
      write(KEY_RECORDS, list)
      return list[i]
    }
  }
  return null
}

function removeRecord(id) {
  write(KEY_RECORDS, getAllRecords().filter(function (r) { return r.id !== id }))
  return true
}

/* ------------------------------------------------------------------ */
/* 类别                                                                */
/* ------------------------------------------------------------------ */

function getCategories() {
  var cats = read(KEY_CATEGORIES, null)
  if (!cats || !cats.expense || !cats.income) {
    cats = buildDefaultCategories()
    write(KEY_CATEGORIES, cats)
  }
  return cats
}

function getCategoryList(type) {
  return getCategories()[type === 'income' ? 'income' : 'expense']
}

/** 取类别定义，找不到时用记录里的名称快照兜底 */
function resolveCategory(type, id, fallbackName) {
  var list = getCategoryList(type)
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i]
  }
  return { id: id || 'unknown', name: fallbackName || '未分类', color: UNKNOWN_COLOR, missing: true }
}

function addCategory(type, name) {
  name = String(name || '').trim()
  if (!name) return { ok: false, msg: '名称不能为空' }
  var cats = getCategories()
  var key = type === 'income' ? 'income' : 'expense'
  for (var i = 0; i < cats[key].length; i++) {
    if (cats[key][i].name === name) return { ok: false, msg: '该类别已存在' }
  }
  if (cats[key].length >= 30) return { ok: false, msg: '类别数量已达上限' }
  var item = {
    id: 'c' + (key === 'income' ? 'i' : 'e') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: name,
    type: key,
    color: nextColor(cats[key]),
    builtin: false
  }
  cats[key].push(item)
  write(KEY_CATEGORIES, cats)
  return { ok: true, data: item }
}

function updateCategory(type, id, name) {
  name = String(name || '').trim()
  if (!name) return { ok: false, msg: '名称不能为空' }
  var cats = getCategories()
  var key = type === 'income' ? 'income' : 'expense'
  var target = null
  for (var i = 0; i < cats[key].length; i++) {
    if (cats[key][i].id === id) target = cats[key][i]
    else if (cats[key][i].name === name) return { ok: false, msg: '该类别已存在' }
  }
  if (!target) return { ok: false, msg: '类别不存在' }
  var oldName = target.name
  target.name = name
  write(KEY_CATEGORIES, cats)

  // 同步更新历史记录里的名称快照
  var records = getAllRecords()
  var changed = false
  records.forEach(function (r) {
    if (r.type === key && r.categoryId === id) {
      r.categoryName = name
      changed = true
    } else if (r.type === key && !r.categoryId && r.categoryName === oldName) {
      r.categoryName = name
      changed = true
    }
  })
  if (changed) write(KEY_RECORDS, records)
  return { ok: true, data: target }
}

/** 删除类别（历史记录保留名称快照，不受影响） */
function removeCategory(type, id) {
  var cats = getCategories()
  var key = type === 'income' ? 'income' : 'expense'
  cats[key] = cats[key].filter(function (c) { return c.id !== id })
  write(KEY_CATEGORIES, cats)
  return { ok: true }
}

function resetCategories() {
  write(KEY_CATEGORIES, buildDefaultCategories())
  return getCategories()
}

/* ------------------------------------------------------------------ */
/* 其它                                                                */
/* ------------------------------------------------------------------ */

/** 导出全部数据（JSON 字符串，便于备份） */
function exportAll() {
  return JSON.stringify({
    version: 1,
    exportAt: Date.now(),
    projects: getProjects(),
    records: getAllRecords(),
    categories: getCategories()
  }, null, 2)
}

/** 清空全部数据 */
function clearAll() {
  write(KEY_PROJECTS, [])
  write(KEY_RECORDS, [])
  write(KEY_CATEGORIES, buildDefaultCategories())
}

module.exports = {
  PALETTE: PALETTE,
  UNKNOWN_COLOR: UNKNOWN_COLOR,
  init: init,
  getProjects: getProjects,
  getProject: getProject,
  createProject: createProject,
  updateProject: updateProject,
  removeProject: removeProject,
  getAllRecords: getAllRecords,
  getRecords: getRecords,
  getRecord: getRecord,
  createRecord: createRecord,
  updateRecord: updateRecord,
  removeRecord: removeRecord,
  getCategories: getCategories,
  getCategoryList: getCategoryList,
  resolveCategory: resolveCategory,
  addCategory: addCategory,
  updateCategory: updateCategory,
  removeCategory: removeCategory,
  resetCategories: resetCategories,
  exportAll: exportAll,
  clearAll: clearAll
}
