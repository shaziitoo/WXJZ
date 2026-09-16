var store = require('../../utils/store.js')
var stats = require('../../utils/stats.js')
var format = require('../../utils/format.js')
var largeText = require('../../utils/largeText.js')

var STATUS_TEXT = { doing: '进行中', done: '已完工', paused: '暂停' }
var STATUS_CLASS = { doing: 'tag-primary', done: 'tag-income', paused: 'tag-gray' }

Page({
  data: {
    tab: 'all',
    largeText: false,
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'doing', label: '进行中' },
      { key: 'done', label: '已完工' }
    ],
    projects: [],
    list: [],
    total: {
      incomeText: '¥0.00',
      expenseText: '¥0.00',
      balanceText: '¥0.00',
      balanceClass: 't-secondary',
      projectCount: 0
    }
  },

  onShow: function () {
    largeText.sync(this)
    this.loadData()
  },

  toggleLargeText: function () {
    largeText.toggle(this)
  },

  onPullDownRefresh: function () {
    this.loadData()
    wx.stopPullDownRefresh()
  },

  loadData: function () {
    var all = store.getProjects()
    var projects = all.map(function (p) {
      var s = stats.projectSummary(p.id)
      var period = ''
      if (p.startDate || p.endDate || p.endDateTentative) {
        var endText = p.endDateTentative ? '暂定' : (p.endDate || '未定')
        period = (p.startDate || '未定') + ' 至 ' + endText
      }
      return {
        id: p.id,
        name: p.name,
        client: p.client,
        status: p.status,
        statusText: STATUS_TEXT[p.status] || '进行中',
        statusClass: STATUS_CLASS[p.status] || 'tag-primary',
        period: period,
        incomeText: s.incomeText,
        expenseText: s.expenseText,
        balanceText: s.balanceText,
        balanceClass: s.balanceClass,
        count: s.count
      }
    })

    var sum = stats.summarize(store.getAllRecords())
    this.setData({
      projects: projects,
      list: this.applyTab(projects, this.data.tab),
      total: {
        incomeText: format.moneyCompact(sum.income),
        expenseText: format.moneyCompact(sum.expense),
        balanceText: format.moneyCompact(sum.balance),
        balanceClass: sum.balance > 0 ? 'money-income' : (sum.balance < 0 ? 'money-expense' : 't-secondary'),
        projectCount: projects.length
      }
    })
  },

  applyTab: function (projects, tab) {
    if (!tab || tab === 'all') return projects
    return projects.filter(function (p) { return p.status === tab })
  },

  onTabChange: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ tab: key, list: this.applyTab(this.data.projects, key) })
  },

  goDetail: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?pid=' + e.currentTarget.dataset.id })
  },

  onCreate: function () {
    wx.navigateTo({ url: '/pages/project/project' })
  },

  goCategory: function () {
    wx.navigateTo({ url: '/pages/category/category' })
  },

  onMore: function (e) {
    var id = e.currentTarget.dataset.id
    var project = store.getProject(id)
    if (!project) return
    var self = this
    wx.showActionSheet({
      itemList: ['编辑工程', '删除工程'],
      itemColor: '#1a1a1a',
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/project/project?pid=' + id })
        } else if (res.tapIndex === 1) {
          self.confirmDelete(id, project)
        }
      },
      fail: function () {}
    })
  },

  confirmDelete: function (id, project) {
    var self = this
    var count = store.getRecords(id).length
    wx.showModal({
      title: '删除工程',
      content: '确定删除「' + project.name + '」吗？该工程下的 ' + count + ' 条费用记录将一并删除，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: function (res) {
        if (!res.confirm) return
        store.removeProject(id)
        wx.showToast({ title: '已删除', icon: 'success' })
        self.loadData()
      }
    })
  }
})
