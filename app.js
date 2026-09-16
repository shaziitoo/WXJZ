const store = require('./utils/store.js')

App({
  globalData: {
    // 页面间通信用：记录有变更时通知列表/详情刷新
    dataVersion: 0
  },

  onLaunch() {
    store.init()
  },

  // 数据发生变化时调用，通知相关页面刷新
  markDataChanged() {
    this.globalData.dataVersion++
  }
})
