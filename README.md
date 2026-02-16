# 予算管理アプリ（Budget Manager）

購入依頼書・立替払請求書・旅費計算書のスクリーンショット画像をOCRで読み取り、予算管理するWebアプリケーション（MVP版）。

## 🎯 機能概要

- **書類取り込み**: 画像アップロード → OCR（tesseract.js / 日本語）→ 項目抽出
- **ダッシュボード**: 教授 × Jコード ごとの支出/予算/残額の集計表示
- **取引一覧**: 保存した取引データの閲覧・削除
- **予算設定**: 教授 × Jコード × 年度ごとの予算登録

## 🖥 動作環境

- **Windows 11**（PowerShellで全コマンドを実行）
- **Node.js LTS**（v20以上推奨）
- ブラウザ: Chrome / Edge 推奨

## 📥 Node.js のインストール

まだ Node.js がインストールされていない場合は、以下の手順でインストールしてください。

### 方法1: 公式サイトからダウンロード（推奨）

1. [https://nodejs.org/ja](https://nodejs.org/ja) にアクセス
2. **LTS版**（推奨版）をダウンロード
3. ダウンロードした `.msi` ファイルを実行
4. インストールウィザードに従ってインストール（デフォルト設定でOK）
5. **PowerShellを再起動**

### 方法2: winget（Windows パッケージマネージャー）

```powershell
winget install OpenJS.NodeJS.LTS
```

インストール後、**PowerShellを再起動**してから以下を確認：

```powershell
node --version
npm --version
```

バージョン番号が表示されればOKです。

## 🚀 セットアップ & 起動

PowerShellを開いて、以下のコマンドを**順番にコピペ** して実行してください。

```powershell
# 1. プロジェクトフォルダに移動
cd C:\Users\efstk\.gemini\antigravity\scratch\budget-app

# 2. パッケージをインストール
npm install

# 3. 開発サーバーを起動
npm run dev
```

ブラウザで以下を開いてください：

👉 **http://localhost:3000**

サーバーを止めるには、PowerShellで `Ctrl + C` を押してください。

## 📁 ファイル構成

```
budget-app/
├── app/
│   ├── layout.tsx          # 左サイドナビ（共通レイアウト）
│   ├── page.tsx            # ダッシュボード (/)
│   ├── globals.css         # グローバルCSS
│   ├── import/
│   │   └── page.tsx        # 書類取り込み (/import)
│   ├── transactions/
│   │   └── page.tsx        # 取引一覧 (/transactions)
│   └── budgets/
│       └── page.tsx        # 予算設定 (/budgets)
├── lib/
│   ├── types.ts            # データ型定義
│   ├── storage.ts          # LocalStorage操作
│   └── extract.ts          # OCR抽出ロジック
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── README.md
```

## 📝 使い方

### 1. 予算を設定（任意）
1. サイドバーの「予算設定」をクリック
2. 年度・教授名・Jコード・予算総額を入力して「予算を登録」

### 2. 書類を取り込む
1. サイドバーの「書類取り込み」をクリック
2. スクリーンショット画像をドラッグ＆ドロップ（またはクリックして選択）
3. 「OCRを実行」ボタンをクリック
4. 初回は日本語モデル（約16MB）のダウンロードに数十秒かかります
5. 抽出結果を確認・修正して「保存」

### 3. ダッシュボードで確認
- 支出合計、予算設定数、要確認件数がカードで表示
- 教授×Jコードごとの集計表で残額を確認

## ⚙️ 技術スタック

| 技術 | 用途 |
|------|------|
| Next.js 15 (App Router) | フレームワーク |
| React 19 | UIライブラリ |
| TypeScript | 型安全 |
| Tailwind CSS 3 | スタイリング |
| tesseract.js 5 | ブラウザ内OCR（WASM） |
| LocalStorage | データ保存 |

## 🔒 プライバシー

- **完全ローカル動作**：外部API・クラウドサービスへの通信なし
- **画像は保存しません**：OCR結果テキスト＋抽出JSONのみ保存
- すべてのデータはブラウザのLocalStorageに保存

## ❓ よくあるエラーと対処

### `'node' は、コマンドレットとして認識されません`

**原因**: Node.jsがインストールされていない、またはPATHが通っていない

**対処**:
1. Node.js LTSをインストール: https://nodejs.org/ja
2. インストール後、**PowerShellを再起動**（新しいウィンドウを開く）
3. `node --version` でバージョンが表示されるか確認

### `'npm' は、コマンドレットとして認識されません`

**原因**: Node.jsインストール時にPATHが設定されなかった可能性

**対処**:
1. Node.jsを再インストール（カスタムではなくデフォルト設定で）
2. PCを再起動
3. 新しいPowerShellで `npm --version` を確認

### `npm install` でエラーが出る

**対処**:
```powershell
# node_modulesを削除して再インストール
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
```

### ポート3000が使用中

**対処**:
```powershell
# 別のポートで起動
npx next dev -p 3001
```

### OCRが動かない / 文字認識が空白になる

**考えられる原因**:
- 画像の解像度が低い → 高解像度のスクリーンショットを使用
- 文字がぼやけている → 拡大したスクリーンショットを使用
- ブラウザがWASMに対応していない → Chrome/Edge最新版を使用

### LocalStorageのデータをリセットしたい

ブラウザの開発者ツール（F12）→ Application → Local Storage → `http://localhost:3000` を右クリック → Clear
