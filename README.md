# Bomber Grid

ブラウザだけで遊べる、ボンバーマン風の Canvas ゲームです。

現在のバージョン: `v1.1`

## 遊び方

- 矢印キーまたは WASD: 移動
- Space または Enter: 爆弾を置く
- 敵を全て倒し、ブロックに隠れた出口に入ると次のステージへ進みます
- 黄色いパワーアップを取ると爆風と同時設置数が増えます

## 起動

`index.html` をブラウザで開くだけで起動します。

ローカルサーバーで確認したい場合:

```sh
python3 -m http.server 8080
```

その後 `http://localhost:8080` を開いてください。

## GitHub Pages

`.github/workflows/pages.yml` で GitHub Pages へデプロイできます。

1. GitHub のリポジトリ設定で Pages の Source を `GitHub Actions` にします
2. `main` ブランチへ push します
3. Actions の `Deploy to GitHub Pages` が完了すると公開 URL が表示されます

## 更新履歴

<details>
<summary>開く</summary>

### v1.1 - 2026-04-22

- スマホ表示で十字移動を左、ボムボタンを右へ配置

### v1.0 - 2026-04-22

- 初回リリース
- 移動、爆弾、敵、出口、パワーアップ、ステージ進行を追加
- GitHub Pages デプロイに対応

</details>
