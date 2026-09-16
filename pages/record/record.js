var store = require('../../utils/store.js')
var format = require('../../utils/format.js')
var largeText = require('../../utils/largeText.js')

Page({
  data: {
    isEdit: false,
    recordId: '',
    pid: '',
    today: '',
    amount: '',
    categories: [],
    createdText: '',
    fixedType: false,
    largeText: false,
    form: {
      type: 'expense',
      date: '',
      weekday: '',
      categoryId: '',
      categoryName: '',
      note: ''
    }
  },

  onLoad: function (options) {
    var today = format.dateStr()
    this.setData({ today: today })

    if (options && options.id) {
      var record = store.getRecord(options.id)
      if (!record) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1200)
        return
      }
      wx.setNavigationBarTitle({ title: '编辑记录' })
      this.setData({
        isEdit: true,
        recordId: options.id,
        pid: record.projectId,
        amount: format.toYuan(record.amount).toFixed(2),
        createdText: format.fromNow(record.createdAt),
        form: {
          type: record.type,
          date: record.date,
          weekday: format.weekdayCN(record.date),
          categoryId: record.categoryId,
          categoryName: record.categoryName,
          note: record.note
        }
      })
    } else if (options && options.pid) {
      // 从工程详情页点「记一笔」进入：type 由详情页当前收支 tab 决定，固定不可切换
      var fixedType = options.fixed === '1' || options.fixed === 1 || options.fixed === true
      var type = (options.type === 'income' || options.type === 'expense') ? options.type : 'expense'
      this.setData({
        pid: options.pid,
        fixedType: fixedType,
        'form.type': type,
        'form.date': today,
        'form.weekday': format.weekdayCN(today)
      })
    } else {
      wx.showToast({ title: '缺少工程信息', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1200)
      return
    }

    this.loadCategories()
  },

  onShow: function () {
    largeText.sync(this)
    // 从类别管理页返回时刷新类别列表
    if (this.data.pid || this.data.recordId) this.loadCategories()
  },

  loadCategories: function () {
    this.setData({ categories: store.getCategoryList(this.data.form.type) })
  },

  onTypeChange: function (e) {
    if (this.data.fixedType) return
    var type = e.currentTarget.dataset.type
    if (type === this.data.form.type) return
    // 切换收支时类别需要重新选择
    this.setData({
      'form.type': type,
      'form.categoryId': '',
      'form.categoryName': '',
      categories: store.getCategoryList(type)
    })
  },

  onAmountInput: function (e) {
    var v = String(e.detail.value || '').replace(/[^\d.]/g, '')
    var parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    var dot = v.indexOf('.')
    if (dot >= 0 && v.length - dot - 1 > 2) v = v.slice(0, dot + 3)
    if (v.length > 12) v = v.slice(0, 12)
    this.setData({ amount: v })
  },

  onDateChange: function (e) {
    this.setData({
      'form.date': e.detail.value,
      'form.weekday': format.weekdayCN(e.detail.value)
    })
  },

  onCategoryChange: function (e) {
    this.setData({
      'form.categoryId': e.currentTarget.dataset.id,
      'form.categoryName': e.currentTarget.dataset.name
    })
  },

  onNoteInput: function (e) {
    this.setData({ 'form.note': e.detail.value })
  },

  goCategory: function () {
    wx.navigateTo({ url: '/pages/category/category?type=' + this.data.form.type })
  },

  onSave: function () {
    // 仅用于校验；存储层的 createRecord/updateRecord 内部会统一转「分」，这里不能先转
    var fen = format.toFen(this.data.amount)
    if (fen <= 0) {
      wx.showToast({ title: '请输入大于 0 的金额', icon: 'none' })
      return
    }
    if (!this.data.form.categoryId) {
      wx.showToast({ title: '请选择费用类别', icon: 'none' })
      return
    }

    var payload = {
      projectId: this.data.pid,
      type: this.data.form.type,
      amount: this.data.amount,
      date: this.data.form.date,
      categoryId: this.data.form.categoryId,
      categoryName: this.data.form.categoryName,
      note: this.data.form.note
    }

    if (this.data.isEdit) {
      store.updateRecord(this.data.recordId, payload)
    } else {
      store.createRecord(payload)
    }

    var app = getApp()
    if (app && app.markDataChanged) app.markDataChanged()

    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(function () { wx.navigateBack() }, 700)
  },

  onDelete: function () {
    var self = this
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条费用记录吗？删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: function (res) {
        if (!res.confirm) return
        store.removeRecord(self.data.recordId)
        var app = getApp()
        if (app && app.markDataChanged) app.markDataChanged()
        wx.showToast({ title: '已删除', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 700)
      }
    })
  }
})
