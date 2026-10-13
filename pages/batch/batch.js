const storage = require('../../utils/storage.js');

const ACTION_WIDTH = 360; // 三个操作按钮总宽度 rpx
const THRESHOLD = 120;

Page({
  data: {
    keyword: '',
    files: [],
    allFiles: [],
    sortDesc: true,
    refreshing: false,
    actionWidth: ACTION_WIDTH,
    startX: 0,
    currentIndex: -1
  },

  onShow() {
    this.loadFiles();
  },

  onPullDownRefresh() {
    this.loadFiles();
    wx.stopPullDownRefresh();
  },

  onRefresh() {
    this.setData({ refreshing: true });
    this.loadFiles();
    setTimeout(() => this.setData({ refreshing: false }), 500);
  },

  loadFiles() {
    let files = storage.getBatchFiles();
    // 默认置顶在前，再按时间排序
    files = this.sortFiles(files);
    files = files.map(f => ({ ...f, translateX: 0, updatedAt: storage.formatDate(f.updatedAt) }));
    this.setData({ allFiles: files, files });
    this.filterFiles();
  },

  sortFiles(files) {
    const pinned = files.filter(f => f.pinned);
    const others = files.filter(f => !f.pinned);
    const sortFn = (a, b) => this.data.sortDesc
      ? new Date(b.createdAt) - new Date(a.createdAt)
      : new Date(a.createdAt) - new Date(b.createdAt);
    return [...pinned.sort(sortFn), ...others.sort(sortFn)];
  },

  filterFiles() {
    const keyword = this.data.keyword.trim().toLowerCase();
    let files = this.data.allFiles;
    if (keyword) {
      files = files.filter(f => f.name.toLowerCase().includes(keyword));
    }
    this.setData({ files });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
    this.filterFiles();
  },

  scanCode() {
    wx.scanCode({
      success: (res) => {
        wx.showModal({
          title: '扫描结果',
          content: res.result,
          confirmText: '保存',
          success: (r) => {
            if (r.confirm) {
              this.createFileAndScan(res.result, res.scanType);
            }
          }
        });
      }
    });
  },

  createFileAndScan(code, scanType) {
    const file = storage.createBatchFile();
    storage.addRecordsToBatchFile(file.id, [{ code, scanType }]);
    this.loadFiles();
  },

  createFile() {
    wx.showModal({
      title: '新建批量文件',
      content: '',
      editable: true,
      placeholderText: '请输入文件名',
      success: (res) => {
        if (res.confirm && res.content) {
          storage.createBatchFile(res.content);
          this.loadFiles();
        } else if (res.confirm) {
          storage.createBatchFile();
          this.loadFiles();
        }
      }
    });
  },

  toggleSort() {
    this.setData({ sortDesc: !this.data.sortDesc }, () => {
      this.loadFiles();
    });
  },

  // 左滑操作
  touchStart(e) {
    const index = e.currentTarget.dataset.index;
    const files = this.data.files.map((f, i) => ({ ...f, translateX: i === this.data.currentIndex ? f.translateX : 0 }));
    this.setData({ startX: e.touches[0].clientX, currentIndex: index, files });
  },

  touchMove(e) {
    const moveX = e.touches[0].clientX;
    const deltaX = this.data.startX - moveX;
    if (deltaX > 0) {
      const translateX = Math.min(deltaX, ACTION_WIDTH);
      const files = this.data.files.map((f, i) => i === this.data.currentIndex ? { ...f, translateX } : f);
      this.setData({ files });
    }
  },

  touchEnd(e) {
    const files = this.data.files.map((f, i) => {
      if (i === this.data.currentIndex) {
        const x = f.translateX || 0;
        return { ...f, translateX: x > THRESHOLD ? ACTION_WIDTH : 0 };
      }
      return f;
    });
    this.setData({ files });
  },

  resetSwipe() {
    const files = this.data.files.map(f => ({ ...f, translateX: 0 }));
    this.setData({ files, currentIndex: -1 });
  },

  pinFile(e) {
    const id = e.currentTarget.dataset.id;
    storage.togglePinBatchFile(id);
    this.resetSwipe();
    this.loadFiles();
  },

  renameFile(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '重命名',
      content: name,
      editable: true,
      success: (res) => {
        if (res.confirm && res.content) {
          storage.renameBatchFile(id, res.content);
          this.loadFiles();
        }
      }
    });
    this.resetSwipe();
  },

  deleteFile(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后可在「设置-数据回收」中恢复',
      success: (res) => {
        if (res.confirm) {
          storage.deleteBatchFile(id);
          this.loadFiles();
        }
      }
    });
    this.resetSwipe();
  }
});
