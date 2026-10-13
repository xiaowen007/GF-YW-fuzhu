const materials = require('../../utils/materials.js');
const roles = require('../../utils/material-roles.js');

const DEMO_TEXT = 'code\tname\tseries\ttype\tmodel\tunit\tlocation\n1980009999\t断路器NXB-63 4P C32\t断路器\tNXB\tNXB-63/C32 4P\t个\tA区-3号货架';

Page({
  data: {
    text: '',
    result: null,
    previewItems: [],
    importing: false,
    importResult: null,
    columns: [
      { key: 'code', label: '物料号', required: true, alias: '物料号 / 料号 / 编码 / code' },
      { key: 'name', label: '名称', required: false, alias: '名称 / 品名 / name' },
      { key: 'series', label: '系列', required: false, alias: '系列 / 分类 / category' },
      { key: 'mtype', label: '类型', required: false, alias: '类型 / type' },
      { key: 'model', label: '型号', required: false, alias: '型号 / 规格 / model' },
      { key: 'unit', label: '单位', required: false, alias: '单位 / unit' },
      { key: 'location', label: '存放位置', required: false, alias: '位置 / 库位 / location' },
      { key: 'stock', label: '库存', required: false, alias: '库存 / 数量 / stock' },
      { key: 'brand', label: '品牌', required: false, alias: '品牌 / 厂家 / brand' },
      { key: 'price', label: '价格', required: false, alias: '价格 / 单价 / price' },
      { key: 'group', label: '物料组', required: false, alias: '物料组 / group' },
      { key: 'subCategory', label: '二级分类', required: false, alias: '二级分类 / subCategory' },
      { key: 'remark', label: '备注 / 判定要点', required: false, alias: '备注 / 说明 / remark' }
    ]
  },

  onLoad() {
    if (!roles.canWrite()) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
    }
  },

  onTextInput(e) {
    this.setData({ text: e.detail.value, result: null, importResult: null });
  },

  fillDemo() {
    this.setData({ text: DEMO_TEXT, result: null, importResult: null });
  },

  clearText() {
    this.setData({ text: '', result: null, importResult: null });
  },

  parse() {
    const text = this.data.text.trim();
    if (!text) {
      wx.showToast({ title: '请先粘贴内容', icon: 'none' });
      return;
    }
    const result = materials.parseImport(text);
    if (result.error) {
      wx.showToast({ title: result.error, icon: 'none' });
      return;
    }
    if (!result.items.length) {
      wx.showToast({ title: '没有解析出有效物料', icon: 'none' });
      return;
    }
    this.setData({
      result,
      previewItems: result.items.slice(0, 10),
      importResult: null
    });
  },

  confirmImport() {
    if (!this.data.result || !this.data.result.items.length) return;
    wx.showModal({
      title: '确认导入',
      content: `将导入 ${this.data.result.items.length} 条物料，物料号已存在的会被更新，是否继续？`,
      confirmText: '导入',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ importing: true });
        const { added, updated } = materials.upsertMaterials(this.data.result.items);
        this.setData({
          importing: false,
          importResult: { added, updated }
        });
        wx.showToast({ title: `新增 ${added} · 更新 ${updated}`, icon: 'none' });
      }
    });
  }
});
