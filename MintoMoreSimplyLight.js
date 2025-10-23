/*:
 * @target MZ
 * @plugindesc 💡 MintoMoreSimplyLight v1.0 — たいまつとランタン専用の超軽量ライトシステム（色ゆらぎ対応）
 * @author MintoSoft
 * @help
 * -------------------------------------------------------
 * 【概要】
 * マップ上のたいまつやランタンなど、常設光源のみを演出する
 * 超軽量ライトシステムです。魔法スキルなどの発光処理は省略。
 * v1.0ではたいまつ光に「色ゆらぎ（Hue Flicker）」を実装し、
 * 炎が生きているような柔らかな光を表現します。
 *
 * -------------------------------------------------------
 * 【使い方】
 * 🕯 イベントのメモ欄：
 *   <torchlight radius:120 color:#ffaa66 flicker>
 *
 * 🔦 プレイヤーランタン：
 *   指定スイッチIDがONのとき点灯します。
 *
 * 推奨：
 *   radius:100〜200
 *
 * -------------------------------------------------------
 * @param LanternSwitch
 * @text ランタンONスイッチID
 * @type switch
 * @default 22
 * @desc このスイッチがONのとき、プレイヤーに光を生成します。
 */

(() => {
  const PLUGIN_NAME = document.currentScript.src.match(/([^/]+)\.js$/)[1];
  const params = PluginManager.parameters(PLUGIN_NAME);
  const PLAYER_LANTERN_SWITCH_ID = Number(params["LanternSwitch"] || 22);

  // =============================
  // 基本設定
  // =============================
  const PLAYER_LIGHT_RADIUS = 250;
  const PLAYER_LIGHT_COLOR = "#fff6cc";
  const PLAYER_LIGHT_ALPHA = 0.15;
  const DARKNESS_ALPHA = 0.75;
  const FLICKER_SPEED = 0.03;
  const FLICKER_RANGE = 0.12;

  // =============================
  // ゆらめき設定
  // =============================
  const _Game_Event_initMembers = Game_Event.prototype.initMembers;
  Game_Event.prototype.initMembers = function() {
    _Game_Event_initMembers.call(this);
    this._torchFlicker = 0;
    this._torchFlickerTarget = Math.random() * 2 - 1;
    this._torchHue = Math.random();
  };

  Game_Event.prototype.updateTorchFlicker = function() {
    if (Math.random() < 0.02) this._torchFlickerTarget = Math.random() * 2 - 1;
    this._torchFlicker += (this._torchFlickerTarget - this._torchFlicker) * FLICKER_SPEED;
    this._torchHue += (Math.random() - 0.5) * 0.01;
    this._torchHue = (this._torchHue + 1) % 1;
    return 1 + this._torchFlicker * FLICKER_RANGE;
  };

  // =============================
  // ライトレイヤー生成
  // =============================
  const _Spriteset_Map_createUpperLayer = Spriteset_Map.prototype.createUpperLayer;
  Spriteset_Map.prototype.createUpperLayer = function() {
    _Spriteset_Map_createUpperLayer.call(this);
    this._torchLightSprite = new Sprite(new Bitmap(Graphics.width, Graphics.height));
    this._torchLightSprite.blendMode = PIXI.BLEND_MODES.ADD ?? 1;
    this.addChild(this._torchLightSprite);
  };

  // =============================
  // 毎フレーム更新
  // =============================
  const _Spriteset_Map_update = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function() {
    _Spriteset_Map_update.call(this);
    this.updateTorchLights();
  };

  Spriteset_Map.prototype.updateTorchLights = function() {
    const bmp = this._torchLightSprite.bitmap;
    const ctx = bmp.context;
    bmp.clear();

    // 暗闇層
    ctx.fillStyle = `rgba(0,0,0,${DARKNESS_ALPHA})`;
    ctx.fillRect(0, 0, Graphics.width, Graphics.height);

    // 🔦 プレイヤーランタン
    if ($gameSwitches.value(PLAYER_LANTERN_SWITCH_ID)) {
      const px = $gamePlayer.screenX();
      const py = $gamePlayer.screenY() - 24;
      drawLight(ctx, px, py, PLAYER_LIGHT_RADIUS, PLAYER_LIGHT_COLOR, PLAYER_LIGHT_ALPHA);
    }

    // 🕯️ たいまつイベント
    for (const ev of $gameMap.events()) {
      const note = ev.event().note || "";
      const match = note.match(/<torchlight\s*radius:(\d+)\s*color:(#[0-9A-Fa-f]{6})(?:\s*flicker)?>/i);
      if (match) {
        const baseRadius = Number(match[1]);
        const baseColor = match[2];
        const flicker = note.toLowerCase().includes("flicker");
        let radius = baseRadius;
        if (flicker) radius *= ev.updateTorchFlicker();

        const shifted = hueShift(baseColor, ev._torchHue);
        const sx = ev.screenX();
        const sy = ev.screenY() - 24;
        drawLight(ctx, sx, sy, radius, shifted, 0.4);
      }
    }

    bmp._baseTexture.update();
  };

  // =============================
  // 光描画＋ユーティリティ
  // =============================
  function drawLight(ctx, x, y, radius, color, alpha) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(${hexToRgb(color)},${alpha * 1.2})`);
    grad.addColorStop(0.6, `rgba(${hexToRgb(color)},${alpha * 0.5})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function hexToRgb(hex) {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `${r},${g},${b}`;
  }

  // =============================
  // Hueシフト（色揺らぎ）
  // =============================
  function hueShift(hex, shift) {
    const rgb = hexToRgb(hex).split(",").map(Number);
    const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    const newHue = (h + shift * 0.02) % 1;
    const [r, g, b] = hsvToRgb(newHue, s, v);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) h = 0;
    else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, v];
  }

  function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

})();
