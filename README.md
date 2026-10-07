# AI Radar — Version 1.3 / 無料運用

iPhoneで毎日1〜2分、個人で使えるAIの新機能・料金・使い方を確認するPWA。
公開先：[AI Radar](https://katoru969.github.io/ai-radar/)。淡い配色・角丸カード・下部ナビを維持しています。

## 今回の変更

- 重要度の大きな文字・意味のラベルと、カード全体の背景を **A＝淡い赤、B＝淡い黄、C＝淡い緑** に統一。読み方の説明も同じ配色です。
- 「詳しいまとめ」の下に、元記事の説明図・操作画面を最大2枚表示。本文内の説明・画像の説明文から選び、サムネイル・アバター・小さなアイコン・広告バナーを除外。出典リンクと拡大表示を付けました。画像は元サイトから読み込み、通信できない場合も文章と出典を表示します。
- YouTubeの章名だけで作られていた詳しいまとめを改善。**5本の日本語自動字幕を今回確認し、約350〜390字のまとめと「ハンズオンの中身」を整理**しました。操作手順・できあがるもの・必要な条件と、その実演時刻へのリンクを表示します。
- 字幕を確認した動画：dots / Space、ClaudeとGeminiによる動画制作、Sol / Luna / Astraの業務比較、ChatGPT Workでのフォルダー整理、Gemini Notebookのレポート・クイズ。要点は約3行に抑え、詳細はタップして読めます。料金・利用条件は動画で説明された範囲と明記します。
- 新しい動画は公開ページの日本語字幕の取得・抽出も試行します。ただし **YouTube側の空応答・取得制限で、全動画の字幕を安定して自動取得するところまでは未完成**です。未取得の動画は説明欄で確認できる文章と時刻リンクを表示し、実演内容は未確認と明記します。今回の5本は確認済みの短い編集メモを保持するため、自動取得が失敗しても表示できます。
- 動画単位の失敗は他の記事に波及しません。公開JSONには本文全文・字幕全文・署名付き字幕URL・APIキーを含めません。

## 動いている機能

- **Today**：ChatGPT・Claude・Geminiの新機能・料金変更、今日から試せる使い方を最大5件。簡単な設定・コピペも対象。SDK・API実装・CLI・研究・企業導入中心の記事を除外。直近7日を優先し、少ない場合は30日まで拡大。本文・字幕のある記事を優先し、最近の活用動画も候補にします。
- **Explore**：All / Official / YouTube / note / GitHub / Zenn / Qiita / Bluesky / Hacker News / Mastodon、検索・日付順。最大100件。GitHub SDKの収集は停止中。
- **Learn**：Agent / MCP / API / RAG / Context window / Embedding / Inferenceなど9語、3段階の説明、未学習 / 理解済みの保存。
- **Settings**：興味・情報源ON/OFF・通知の希望をlocalStorageへ保存。以前の設定・学習状態を引き継ぎます。情報源別の取得状況・原因も表示。
- ホーム画面追加、safe area、前回の記事・用語集のオフライン表示。設定・学習履歴を公開データへ送信しません。外部の図解は通信が必要です。

## 情報源・まとめの仕組み

`sources.json`で接続先を変更できます。稼働中は15接続先：OpenAI、Google AI、Google Japan、Anthropic、note公式、YouTube 3チャンネル、Zenn / Qiita各2トピック、Bluesky、Hacker News、Mastodon。SNSは指定アカウントの公開投稿・人気記事から選別。X・Redditは接続しません。

取得 → 共通Article → 実用性の選別・重複除外 → 日本語本文・字幕の確認 → 公開JSON → 端末でTodayを選出。
共通項目：`id, title, source, sourceType, url, publishedAt, summary, detailedSummary, importanceScore, importanceGrade, whyImportant, personalRelevance, terms[], thumbnail`。
追加項目：`figures[]`（画像・説明・出典）、`videoSections[]`（手順・成果・時刻）、`videoChapters[]`、`videoRequirements[]`、`summaryBasis`、`transcriptCheckedAt`。

日本語の記事本文から重要な文を約300〜550字で抽出します。英語の記事は日本語版が取得できる場合に使用。生成AIで翻訳・補完はしません。今回確認した動画の編集メモは `content/video-guides.json` に置き、動画ID・発信元・原題が一致した場合だけ使います。自動字幕には誤認識があり、映像の画面やコード自体は未確認です。

YouTube公式の[文字起こし表示](https://support.google.com/youtube/answer/15930243?hl=ja)がある動画でも、自動取得は成功を保証できません。[公式の字幕ダウンロードAPI](https://developers.google.com/youtube/v3/docs/captions/download)には動画の編集権限が必要で、他の配信者の動画を一般のAPIキーだけで取得する仕組みではありません。

情報源別にタイムアウト・障害を分離。YouTube RSSの404 / 500や通信切断を再試行し、公開ページから復旧します。前回データは24時間再利用し、保存分の本来の日時を保持。全取得失敗時は前回公開分を保持します。本文だけ取得できない場合は配信抜粋へ戻り、範囲を明記します。画像・本文の接続先と公開データの項目も制限しています。

## 費用・APIキー

**現在の構成にAPIキーは不要。課金AI APIを呼びません。** GitHub Freeの公開リポジトリ・標準Linuxランナー・GitHub Pagesで運用。独自ドメインも不要です。紹介される他社のAI機能・配布資料は、無料とは限りません。

将来接続用のOpenAI providerは無効で残しています。`npm run collect`は常に無料方式。従来API版で明示的に `SUMMARIZER=openai` とキー・モデルを設定した場合だけ有料呼び出しになります。通常は設定不要。`.env`はGit・zip・公開ビルドから除外します。

## ローカルで確認

Node.js 24.xで、`package.json`のあるフォルダで実行：

```sh
npm ci
npm test
npm run collect
npm run build:pages
npm run preview:pages
```

[http://localhost:3001/ai-radar/](http://localhost:3001/ai-radar/)で公開と同じ構成を確認。zipの `data/feed.json` は収集時点の実データ。`data/`・`public/`は生成物のためGitへ含めません。
従来API版は `npm run dev` → [http://localhost:3000](http://localhost:3000)。API版は30秒で収集を区切り、取得済みの結果を返します。

## GitHub PagesとiPhone

1. フォルダ構造・隠しファイルを保持してGitへpush。`Settings → Pages → Source → GitHub Actions`を選択。
2. `Actions → Collect AI news and publish PWA → Run workflow`。テスト・収集・ビルド後に公開URLが更新されます。既定ブランチへのpushでも実行。
3. 毎朝07:17（日本時間）にGitHubが収集・公開。PCを閉じても実行されます。実行の遅延・公開リポジトリの長期無活動による停止については[定時実行の仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)を確認。
4. iPhoneのSafariで公開HTTPS URLを開き、共有 → **ホーム画面に追加**。「更新」は直近の公開データを読み直します。

## VercelへDeployする場合

1. GitHubリポジトリをImportし、Root Directoryを `package.json` のある場所にします。
2. Framework **Other**、Node.js **24.x**、Build Command **`npm run build`**、Output Directory **`public`**（`vercel.json`に設定済み）。
3. **環境変数・APIキーなし**でDeploy。`SUMMARIZER=openai`は設定しません。
4. 公開先の `/api/feed` とTodayを確認し、iPhoneのSafariから追加。

Vercel版は開いたときに取得し、15分キャッシュ。閉じている間の定時収集はGitHub Pages版で行います。

## 未実装・検証範囲

- 全動画の安定した字幕自動取得、映像・画面内の文字やコードの解析、英文の全文翻訳、生成AIによるAbstractは未実装・未完成です。
- プッシュ通知の購読・配信、端末間同期・永続DB、SNS全体検索は未実装。通知は希望の保存のみ。
- iPhone実機のSafari / ホーム画面、Vercel実Deployは未確認。
- 2026-10-07：回帰テスト55件、15接続先の実データ収集、日本語字幕5本の確認・整理、元記事の図解表示、静的ビルド、320 / 390 / 430 / 768pxの4画面に横はみ出しなし、課金AI呼び出し0を確認。

構成：`app.js / styles.css / shared.js / article-details.js / terms.js`（画面・公開データ検証）、`lib/reader-summary.mjs`（本文・図解）、`lib/video-summary.mjs`（字幕・手順）、`content/video-guides.json`（確認済みの動画メモ）、`lib/`（収集・正規化）、`api/feed.js`、`scripts/`、`.github/workflows/update-pages.yml`、`tests/`。
