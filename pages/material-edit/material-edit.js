const materials = require('../../utils/materials.js');
const roles = require('../../utils/material-roles.js');

Page({
  data: {
    id: '',
    isEdit: false,
    form: {
      code: '',
      name: '',
      series: '',
      mtype: '',
      model: '',
      unit: '',
      location: '',
      stock: '',
      brand: '',
      price: '',
      group: '',
      subCategory: '',
      remark: ''
    },
    photos: [],
    fakePhotos: [],
    seriesOptions: [],
    typeOptions: [],
    saving: false
  },

  onLoad(options) {
    if (!roles.canWrite()) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({
      seriesOptions: materials.listSeries().map(s => s.name),
      typeOptions: materials.listTypes().map(t => t.name)
    });
    if (options.id) {
      const material = materials.getMaterialById(options.id);
      if (!material) {
        wx.showToast({ title: '物料不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      this.setData({
        id: material.id,
        isEdit: true,
        form: {
          code: material.code,
          name: material.name,
          series: material.series,
          mtype: material.mtype,
          model: material.model,
          unit: material.unit,
          location: material.location,
          stock: material.stock,
          brand: material.brand,
          price: material.price,
          group: material.group,
          subCategory: material.subCategory,
          remark: material.remark
        },
        photos: (material.photos || []).slice(),
        fakePhotos: (material.fakePhotos || []).slice()
      });
      wx.setNavigationBarTitle({ title: '编辑物料' });
    }
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  pickSeries(e) {
    this.setData({ 'form.series': e.currentTarget.dataset.name });
  },

  pickType(e) {
    this.setData({ 'form.mtype': e.currentTarget.dataset.name });
  },

  async choosePhoto(e) {
    const kind = e.currentTarget.dataset.kind; // real | fake
    try {
      const res = await wx.chooseMedia({
        count: 9,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      });
      const paths = [];
      for (const file of res.tempFiles) {
        const compressed = await materials.compressImage(file.tempFilePath);
        paths.push(compressed);
      }
      const key = kind === 'fake' ? 'fakePhotos' : 'photos';
      const next = this.data[key].concat(paths).slice(0, 9);
      this.setData({ [key]: next });
    } catch (err) {
      // 用户取消选择时不提示
    }
  },

  removePhoto(e) {
    const { kind, index } = e.currentTarget.dataset;
    const key = kind === 'fake' ? 'fakePhotos' : 'photos';
    const next = this.data[key].slice();
    next.splice(Number(index), 1);
    this.setData({ [key]: next });
  },

  save() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!form.code.trim()) {
      wx.showToast({ title: '请填写物料号', icon: 'none' });
      return;
    }
    if (!form.name.trim() && !form.model.trim()) {
      wx.showToast({ title: '请填写名称或型号', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const payload = {
      ...form,
      photos: this.data.photos,
      fakePhotos: this.data.fakePhotos
    };
    const result = this.data.isEdit
      ? materials.updateMaterial(this.data.id, payload)
      : materials.addMaterial(payload);
    this.setData({ saving: false });
    if (!result.ok) {
      wx.showToast({ title: result.message, icon: 'none' });
      return;
    }
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
  },

  remove() {
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      confirmText: '删除',
      confirmColor: '#FF5B5B',
      success: (res) => {
        if (!res.confirm) return;
        materials.deleteMaterial(this.data.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      }
    });
  }
});
