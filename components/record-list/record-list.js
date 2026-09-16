var store = require('../../utils/store.js')
var stats = require('../../utils/stats.js')
var format = require('../../utils/format.js')

Component({
  properties: {
    records: {
      type: Array,
      value: []
    }
  },

  data: {
    showFilter: false,
    filterActive: false,
    filteredCount: 0,
    typeTabs: [
      { key: 'all', label: '全部' },
      { key: 'expense', label: '支出' },
      { key: 'income', label: '收入' }
    ],
    filter: {
      type: 'all',
      start: '',
      end: '',
      categoryId: '',
      keyword: ''
    },
    categories: [],
    groups: [],
    summary: {
      incomeText: '¥0.00',
      expenseText: '¥0.00',
      balanceText: '¥0.00',
      balanceClass: 't-secondary'
    }
  },

  lifetimes: {
    attached: function () {
      this.loadCategories()
      this.refresh()
    }
  },

  methods: {
    /** 供页面显式调用：property observer 在 swiper 内 onShow 时机可能不触发 */
    setRecords: function (records) {
      this.setData({ records: records || [] })
      this.refresh()
    },

    loadCategories: function () {
      var cats = store.getCategories()
      this.setData({ categories: cats.expense.concat(cats.income) })
    },

    refresh: function () {
      var filter = this.data.filter
      var list = stats.filterRecords(this.data.records, filter)
      var sum = stats.summarize(list)
      var rawGroups = stats.groupByDate(list)

      var groups = rawGroups.map(function (g) {
        var items = g.items.map(function (r) {
          var cat = store.resolveCategory(r.type, r.categoryId, r.categoryName)
          return {
            id: r.id,
            type: r.type,
            typeText: r.type === 'income' ? '收入' : '支出',
            typeClass: r.type === 'income' ? 'tag-income' : 'tag-expense',
            categoryName: cat.name,
            color: cat.color,
            note: r.note,
            amountText: format.money(r.amount),
            amountClass: r.type === 'income' ? 'money-income' : 'money-expense'
          }
        })
        return {
          date: g.date,
          label: g.label,
          weekday: g.weekday,
          income: g.income,
          expense: g.expense,
          incomeText: format.money(g.income),
          expenseText: format.money(g.expense),
          items: items
        }
      })

      // 「筛选结果」提示只在使用了真实筛选条件时显示；切换全部/支出/收入 tab 不算筛选
      var active = !!(filter.start || filter.end || filter.categoryId || filter.keyword)

      this.setData({
        groups: groups,
        filteredCount: list.length,
        filterActive: active,
        summary: {
          incomeText: format.money(sum.income),
          expenseText: format.money(sum.expense),
          balanceText: format.money(sum.balance),
          balanceClass: sum.balance > 0 ? 'money-income' : (sum.balance < 0 ? 'money-expense' : 't-secondary')
        }
      })
    },

    onTypeChange: function (e) {
      var type = e.currentTarget.dataset.key
      if (type === this.data.filter.type) return
      this.setData({ 'filter.type': type })
      this.refresh()
      this.triggerEvent('typechange', { type: type })
    },

    toggleFilter: function () {
      this.setData({ showFilter: !this.data.showFilter })
    },

    onDateChange: function (e) {
      var field = e.currentTarget.dataset.field
      this.setData({ ['filter.' + field]: e.detail.value })
      if (field === 'start' && this.data.filter.end && e.detail.value > this.data.filter.end) {
        this.setData({ 'filter.end': '' })
      }
      this.refresh()
    },

    onCategoryChange: function (e) {
      this.setData({ 'filter.categoryId': e.currentTarget.dataset.id })
      this.refresh()
    },

    onKeywordInput: function (e) {
      this.setData({ 'filter.keyword': e.detail.value })
      this.refresh()
    },

    onResetFilter: function () {
      this.setData({
        filter: { type: 'all', start: '', end: '', categoryId: '', keyword: '' }
      })
      this.refresh()
    },

    onEdit: function (e) {
      this.triggerEvent('edit', { id: e.currentTarget.dataset.id })
    },

    onLongPress: function (e) {
      var self = this
      var id = e.currentTarget.dataset.id
      wx.showModal({
        title: '删除记录',
        content: '确定删除这条费用记录吗？删除后无法恢复。',
        confirmText: '删除',
        confirmColor: '#E24B4A',
        success: function (res) {
          if (!res.confirm) return
          store.removeRecord(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          self.triggerEvent('change')
        }
      })
    }
  }
})
