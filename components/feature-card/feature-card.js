Component({
  properties: {
    icon: { type: String, value: '' },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    bg: { type: String, value: '#5B6CFF' },
    size: { type: String, value: 'normal' },
    url: { type: String, value: '' }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
      if (this.data.url) {
        wx.navigateTo({ url: this.data.url });
      }
    }
  }
});
