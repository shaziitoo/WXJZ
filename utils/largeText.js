// 大字版（照顾老年人）全局状态：本地存储 + 页面同步
var KEY = 'largeText'

function get() {
  try {
    return wx.getStorageSync(KEY) === true
  } catch (e) {
    return false
  }
}

function set(val) {
  try {
    wx.setStorageSync(KEY, val)
  } catch (e) {}
}

// 在页面 onShow 中调用，把存储中的设置同步到页面 data
function sync(page) {
  var v = get()
  if (page.data.largeText !== v) page.setData({ largeText: v })
}

// 首页按钮调用：切换并持久化
function toggle(page) {
  var next = !get()
  set(next)
  page.setData({ largeText: next })
  wx.showToast({ title: next ? '已切换大字版' : '已切换标准版', icon: 'none' })
  return next
}

module.exports = {
  get: get,
  set: set,
  sync: sync,
  toggle: toggle
}
