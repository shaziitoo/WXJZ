var store = require('../../utils/store.js')
var stats = require('../../utils/stats.js')
var format = require('../../utils/format.js')
var xlsxWriter = require('../../utils/xlsx-writer.js')
var largeText = require('../../utils/largeText.js')

var STATUS_TEXT = { doing: '进行中', done: '已完工', paused: '暂停' }
var STATUS_CLASS = { doing: 'tag-primary', done: 'tag-income', paused: 'tag-gray' }

Page({
  data: {
    pid: '',
    filterType: 'all',
    project: null,
    summary: {
      incomeText: '¥0.00',
      expenseText: '¥0.00',
      balanceText: '¥0.00',
      balanceClass: 't-secondary',
      count: 0
    },
    // 导出弹窗状态
    showExport: false,
    exportRange: 'all',
    exportMonths: [],
    exportMonthIndex: 0,
    exportMonthLabel: '',
    exportTypes: { full: true, income: false, expense: false },
    largeText: false
  },

  onLoad: function (options) {
    if (!options || !options.pid) {
      wx.showToast({ title: '缺少工程信息', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1200)
      return
    }
    this.setData({ pid: options.pid })
  },

  onShow: function () {
    largeText.sync(this)
    this.loadData()
  },

  loadData: function () {
    var project = store.getProject(this.data.pid)
    if (!project) {
      wx.showToast({ title: '工程不存在', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1200)
      return
    }

    var records = store.getRecords(this.data.pid)
    var sum = stats.summarize(records)
    var period = ''
    if (project.startDate || project.endDate || project.endDateTentative) {
      var endText = project.endDateTentative ? '暂定' : (project.endDate || '未定')
      period = (project.startDate || '未定') + ' 至 ' + endText
    }

    wx.setNavigationBarTitle({ title: project.name })

    this.setData({
      project: {
        id: project.id,
        name: project.name,
        client: project.client,
        period: period,
        note: project.note,
        statusText: STATUS_TEXT[project.status] || '进行中',
        statusClass: STATUS_CLASS[project.status] || 'tag-primary'
      },
      summary: {
        incomeText: format.moneyCompact(sum.income),
        expenseText: format.moneyCompact(sum.expense),
        balanceText: format.moneyCompact(sum.balance),
        balanceClass: sum.balance > 0 ? 'money-income' : (sum.balance < 0 ? 'money-expense' : 't-secondary'),
        count: sum.count
      }
    })

    // 直接调用组件方法刷新：避免 swiper/属性绑定带来的异步不同步问题
    var recordList = this.selectComponent('#recordList')
    if (recordList && recordList.setRecords) {
      recordList.setRecords(records)
      if (recordList.data.filter) {
        this.setData({ filterType: recordList.data.filter.type })
      }
    }
  },

  onEditRecord: function (e) {
    wx.navigateTo({ url: '/pages/record/record?id=' + e.detail.id })
  },

  goRecord: function () {
    var type = this.data.filterType
    if (type !== 'income' && type !== 'expense') return
    wx.navigateTo({ url: '/pages/record/record?pid=' + this.data.pid + '&type=' + type + '&fixed=1' })
  },

  onFilterTypeChange: function (e) {
    this.setData({ filterType: e.detail.type })
  },

  goProjectEdit: function () {
    wx.navigateTo({ url: '/pages/project/project?pid=' + this.data.pid })
  },

  onDataChange: function () {
    this.loadData()
  },

  /* ===================== 导出表格 ===================== */
  openExport: function () {
    var records = store.getRecords(this.data.pid)
    // 收集该项目下出现过的月份（用于「按月导出」选择器）
    var seen = {}
    var order = []
    records.forEach(function (r) {
      var m = format.monthKey(r.date)
      if (m && !seen[m]) { seen[m] = true; order.push(m) }
    })
    order.sort()
    var months = order.map(function (m) { return { key: m, label: format.monthCN(m) } }).reverse()
    this.setData({
      showExport: true,
      exportRange: 'all',
      exportMonths: months,
      exportMonthIndex: 0,
      exportMonthLabel: months.length ? months[0].label : '',
      exportTypes: { full: true, income: false, expense: false }
    })
  },

  closeExport: function () {
    this.setData({ showExport: false })
  },

  noop: function () {},

  onExRange: function (e) {
    var range = e.currentTarget.dataset.range
    var patch = { exportRange: range }
    if (range === 'month' && this.data.exportMonths.length) {
      patch.exportMonthIndex = 0
      patch.exportMonthLabel = this.data.exportMonths[0].label
    }
    this.setData(patch)
  },

  onExMonth: function (e) {
    var idx = Number(e.detail.value)
    var months = this.data.exportMonths
    if (!months.length) return
    this.setData({ exportMonthIndex: idx, exportMonthLabel: months[idx].label })
  },

  onExType: function (e) {
    var t = e.currentTarget.dataset.type
    var cur = this.data.exportTypes
    var next = { full: cur.full, income: cur.income, expense: cur.expense }
    next[t] = !next[t]
    if (!next.full && !next.income && !next.expense) {
      wx.showToast({ title: '至少选择一种类型', icon: 'none' })
      return
    }
    this.setData({ exportTypes: next })
  },

  /** 整理导出行：按月份过滤 + 升序排列 */
  prepareRows: function (monthKey) {
    var records = store.getRecords(this.data.pid)
    if (monthKey) {
      records = records.filter(function (r) { return format.monthKey(r.date) === monthKey })
    }
    records = records.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return (a.createdAt || 0) - (b.createdAt || 0)
    })
    return records.map(function (r) {
      var cat = store.resolveCategory(r.type, r.categoryId, r.categoryName)
      return {
        date: r.date,
        typeText: r.type === 'income' ? '收入' : '支出',
        categoryName: cat.name,
        amountYuan: format.toYuan(r.amount)
      }
    })
  },

  buildSheet: function (name, typeKey, projectName, rows) {
    var header = ['费用类别', '金额', '收入/支出', '日期']
    var body = rows.filter(function (r) {
      if (typeKey === 'income') return r.typeText === '收入'
      if (typeKey === 'expense') return r.typeText === '支出'
      return true
    }).map(function (r) {
      return [r.categoryName, r.amountYuan, r.typeText, r.date]
    })
    var allRows = [[projectName, '', '', ''], header].concat(body)
    return { name: name, rows: allRows, merges: [['A1', 'D1']] }
  },

  doExport: function () {
    var types = this.data.exportTypes
    if (!types.full && !types.income && !types.expense) {
      wx.showToast({ title: '至少选择一种类型', icon: 'none' })
      return
    }
    var monthKey = this.data.exportRange === 'month'
      ? (this.data.exportMonths[this.data.exportMonthIndex] || {}).key
      : ''
    var rows = this.prepareRows(monthKey)
    var pname = this.data.project ? this.data.project.name : ''
    var sheets = []
    if (types.full) sheets.push(this.buildSheet('全面流水', 'full', pname, rows))
    if (types.income) sheets.push(this.buildSheet('收入', 'income', pname, rows))
    if (types.expense) sheets.push(this.buildSheet('支出', 'expense', pname, rows))
    if (!sheets.length) {
      wx.showToast({ title: '没有可导出的数据', icon: 'none' })
      return
    }

    var self = this
    wx.showLoading({ title: '生成中...' })
    try {
      var bytes = xlsxWriter.build(sheets)
      var safeName = (self.data.project.name || '导出').replace(/[\\/:*?"<>|]/g, '_')
      var stamp = format.dateStr().replace(/-/g, '') + '_' + String(Date.now()).slice(-5)
      var filePath = wx.env.USER_DATA_PATH + '/' + safeName + '_' + stamp + '.xlsx'
      wx.getFileSystemManager().writeFile({
        filePath: filePath,
        data: bytes.buffer,
        success: function () {
          wx.hideLoading()
          self.setData({ showExport: false })
          self.promptShare(filePath)
        },
        fail: function (err) {
          wx.hideLoading()
          console.error('[export] writeFile fail', err)
          wx.showToast({ title: '导出失败', icon: 'none' })
        }
      })
    } catch (e) {
      wx.hideLoading()
      console.error('[export] build fail', e)
      wx.showToast({ title: '导出失败', icon: 'none' })
    }
  },

  /** 导出完成后询问：分享给好友 / 保存到本地 */
  promptShare: function (filePath) {
    var self = this
    wx.showModal({
      title: '是否分享发送',
      content: '分享给微信好友，还是保存到本地？',
      confirmText: '分享',
      cancelText: '保存',
      success: function (res) {
        if (res.confirm) self.shareFile(filePath)
        else self.saveFile(filePath)
      }
    })
  },

  shareFile: function (filePath) {
    var self = this
    if (!wx.shareFileMessage) {
      wx.showToast({ title: '当前环境不支持分享', icon: 'none' })
      return self.saveFile(filePath)
    }
    wx.shareFileMessage({
      filePath: filePath,
      fileName: filePath.split('/').pop(),
      success: function () {
        wx.showToast({ title: '已发送', icon: 'success' })
      },
      fail: function (err) {
        console.error('[export] share fail', err)
        // 用户取消或失败，回退到保存
        self.saveFile(filePath)
      }
    })
  },

  /** 判断当前平台：pc 端用另存为，手机端用文档查看器打开（这样才能在微信里找到/转发） */
  getPlatform: function () {
    try {
      if (wx.getDeviceInfo) return wx.getDeviceInfo().platform || ''
      if (wx.getSystemInfoSync) return wx.getSystemInfoSync().platform || ''
    } catch (e) {}
    return ''
  },

  saveFile: function (filePath) {
    var self = this
    var platform = this.getPlatform()
    var isPC = (platform === 'windows' || platform === 'mac')

    if (!isPC && wx.openDocument) {
      // 手机端：用文档查看器打开，右上角「···」可转发/收藏，文件才找得到
      wx.openDocument({
        filePath: filePath,
        fileType: 'xlsx',
        showMenu: true,
        success: function () {
          wx.showToast({ title: '已打开，点右上角「···」可保存/转发', icon: 'none', duration: 2500 })
        },
        fail: function (err) {
          console.error('[export] openDocument fail', err)
          self.trySaveToDisk(filePath)
        }
      })
    } else {
      self.trySaveToDisk(filePath)
    }
  },

  trySaveToDisk: function (filePath) {
    var self = this
    if (wx.saveFileToDisk) {
      wx.saveFileToDisk({
        filePath: filePath,
        success: function (r) {
          var path = (r && r.savedPath) || filePath
          wx.showModal({
            title: '已保存',
            content: '文件已保存至：\n' + path,
            showCancel: false,
            confirmText: '确定'
          })
        },
        fail: function (err) {
          console.error('[export] saveToDisk fail', err)
          self.showSavedPath(filePath)
        }
      })
    } else {
      self.showSavedPath(filePath)
    }
  },

  showSavedPath: function (filePath) {
    wx.showModal({
      title: '已生成文件',
      content: '文件已在小程序本地生成：\n' + filePath + '\n（手机请用微信转发/收藏后查看）',
      showCancel: false,
      confirmText: '确定'
    })
  }
})
