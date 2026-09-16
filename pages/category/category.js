var store = require('../../utils/store.js')
var largeText = require('../../utils/largeText.js')

Page({
  data: {
    type: 'expense',
    list: [],
    inputName: '',
    largeText: false
  },

  onLoad: function (options) {
    if (options && options.type === 'income') {
      this.setData({ type: 'income' })
    }
    this.loadData()
  },

  onShow: function () {
    largeText.sync(this)
    this.loadData()
  },

  loadData: function () {
    this.setData({ list: store.getCategoryList(this.data.type) })
  },

  onTypeChange: function (e) {
    this.setData({ type: e.currentTarget.dataset.type, inputName: '' })
    this.loadData()
  },

  onInputName: function (e) {
    this.setData({ inputName: e.detail.value })
  },

  onAdd: function () {
    var name = (this.data.inputName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入类别名称', icon: 'none' })
      return
    }
    var res = store.addCategory(this.data.type, name)
    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    this.setData({ inputName: '' })
    this.loadData()
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  onRename: function (e) {
    var self = this
    var id = e.currentTarget.dataset.id
    var oldName = e.currentTarget.dataset.name
    wx.showModal({
      title: '重命名类别',
      editable: true,
      placeholderText: '输入新的类别名称',
      value: oldName,
      maxLength: 10,
      success: function (res) {
        if (!res.confirm) return
        var name = (res.content || '').trim()
        if (!name || name === oldName) return
        var r = store.updateCategory(self.data.type, id, name)
        if (!r.ok) {
          wx.showToast({ title: r.msg, icon: 'none' })
          return
        }
        self.loadData()
        wx.showToast({ title: '已更新', icon: 'success' })
      }
    })
  },

  onRemove: function (e) {
    var self = this
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name
    var used = this.countUsed(id)
    var content = used > 0
      ? '已有 ' + used + ' 条记录使用「' + name + '」。删除后这些记录仍保留该名称，确定删除吗？'
      : '确定删除「' + name + '」吗？'

    wx.showModal({
      title: '删除类别',
      content: content,
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: function (res) {
        if (!res.confirm) return
        store.removeCategory(self.data.type, id)
        self.loadData()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  countUsed: function (categoryId) {
    return store.getAllRecords().filter(function (r) {
      return r.categoryId === categoryId
    }).length
  },

  onReset: function () {
    var self = this
    wx.showModal({
      title: '恢复默认类别',
      content: '将清空当前支出与收入的自定义类别，恢复为系统预设类别。已记录的流水不受影响。',
      confirmText: '恢复',
      success: function (res) {
        if (!res.confirm) return
        store.resetCategories()
        self.loadData()
        wx.showToast({ title: '已恢复', icon: 'success' })
      }
    })
  }
})
