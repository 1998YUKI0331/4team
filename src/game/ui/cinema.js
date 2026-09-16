import { $, el, clear, show } from './dom.js';

/** 추첨 연출 중에 뜨는 레터박스 + 자막 */
export class Cinema {
  /** @param root 게임 컨테이너. 지도 앱 안에 얹힐 때 document 를 훑지 않게 한다. */
  constructor(root = document) {
    this.host = $('#cinema', root);
    this.textHost = $('#cinema-text', root);
    this.skipBtn = $('#cinema-skip', root);
    this.skipHandler = null;
    this._onSkip = () => this.skipHandler?.();
    this.skipBtn?.addEventListener('click', this._onSkip);
  }

  open(onSkip) {
    this.skipHandler = onSkip;
    show(this.host, true);
    show(this.skipBtn, !!onSkip);
  }

  close() {
    show(this.host, false);
    clear(this.textHost);
    this.skipHandler = null;
  }

  say(title, sub) {
    clear(this.textHost);
    this.textHost.append(
      el('div', { class: 'flash' }, title, sub ? el('small', {}, sub) : null),
    );
  }

  dispose() {
    this.skipBtn?.removeEventListener('click', this._onSkip);
    this.skipHandler = null;
  }
}
