var store = require('../../utils/store.js')
var format = require('../../utils/format.js')
var largeText = require('../../utils/largeText.js')

Page({
  data: {
    isEdit: false,
    pid: '',
    today: '',
    form: {
      name: '',
      client: '',
      startDate: '',
      endDate: '',
      endDateTentative: false,
      status: 'doing',
      note: ''
    },
    statusOptions: [
      { key: 'doing', label: '进行中' },
      { key: 'done', label: '已完工' },
      { key: 'paused', label: '暂停' }
    ],
    largeText: false
  },

  onLoad: function (options) {
    var today = format.dateStr()
    this.setData({ today: today })

    if (options && options.pid) {
      var project = store.getProject(options.pid)
      if (!project) {
        wx.showToast({ title: '工程不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1200)
        return
      }
      wx.setNavigationBarTitle({ title: '编辑工程' })
      this.setData({
        isEdit: true,
        pid: options.pid,
        form: {
          name: project.name,
          client: project.client || '',
          startDate: project.startDate || '',
          endDate: project.endDate || '',
          endDateTentative: !!project.endDateTentative,
          status: project.status || 'doing',
          note: project.note || ''
        }
      })
    } else {
      wx.setNavigationBarTitle({ title: '新建工程' })
    }
  },

  onInput: function (e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onShow: function () {
    largeText.sync(this)
  },

  onDateChange: function (e) {
    var field = e.currentTarget.dataset.field
    var value = e.detail.value
    if (field === 'endDate' && this.data.form.startDate && value < this.data.form.startDate) {
      wx.showToast({ title: '竣工日期不能早于开工日期', icon: 'none' })
      return
    }
    if (field === 'startDate' && this.data.form.endDate && value > this.data.form.endDate) {
      this.setData({ ['form.endDate']: '' })
    }
    this.setData({ ['form.' + field]: value })
  },

  onStatusChange: function (e) {
    this.setData({ 'form.status': e.currentTarget.dataset.key })
  },

  /** 完工日期「暂定」开关：勾选后日期值保留但按暂定显示 */
  onTentativeToggle: function () {
    this.setData({ 'form.endDateTentative': !this.data.form.endDateTentative })
  },

  onSave: function () {
    var form = this.data.form
    var name = (form.name || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写工程名称', icon: 'none' })
      return
    }

    var payload = {
      name: name,
      client: form.client,
      startDate: form.startDate,
      endDate: form.endDate,
      endDateTentative: !!form.endDateTentative,
      status: form.status,
      note: form.note
    }

    if (this.data.isEdit) {
      store.updateProject(this.data.pid, payload)
      wx.showToast({ title: '已保存', icon: 'success' })
    } else {
      store.createProject(payload)
      wx.showToast({ title: '创建成功', icon: 'success' })
    }

    var app = getApp()
    if (app && app.markDataChanged) app.markDataChanged()

    setTimeout(function () { wx.navigateBack() }, 700)
  },

  onDelete: function () {
    var self = this
    var count = store.getRecords(this.data.pid).length
    wx.showModal({
      title: '删除工程',
      content: '该工程下的 ' + count + ' 条费用记录将一并删除，且无法恢复。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: function (res) {
        if (!res.confirm) return
        store.removeProject(self.data.pid)
        var app = getApp()
        if (app && app.markDataChanged) app.markDataChanged()
        wx.showToast({ title: '已删除', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 700)
      }
    })
  }
})
