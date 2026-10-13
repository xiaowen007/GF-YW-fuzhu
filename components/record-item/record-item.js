Component({
  properties: {
    title: { type: String, value: '' },
    meta: { type: String, value: '' },
    badge: { type: String, value: '' }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    }
  }
});
