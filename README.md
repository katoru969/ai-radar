# AI Radar — Version 1.2 / 無料運用

iPhoneで毎日1〜2分、個人で使えるAIの新機能・料金・使い方を確認するPWA。
公開先：[AI Radar](https://katoru969.github.io/ai-radar/)。淡い配色・角丸カード・下部ナビを維持しています。

## 今回の変更

- YouTube RSSの一時的な404 / 500などに再試行と公開ページからの復旧を追加。実際の公開日・チャンネルIDを確認し、日付を推測しません。情報源の名前・取得状況・原因をSettingsに表示します。
- **ChatGPT・Claude・Geminiの新機能・料金変更、今日から試せる使い方**を優先。簡単な設定・コピペも対象。SDK・API実装・CLI・ベンチマーク・企業導入事例を除外し、SDKのGitHub収集を停止しました。
- 「30秒要約」を**「要点」**に変更し、一覧は約3行。「自分にどう関係するか」の下に**「詳しいまとめ」**を追加。
- APIキーを使わず、**日本語の記事本文から重要な文を抽出**。詳しいまとめは本文にある範囲で約300〜550字。英語の公式記事は日本語版が取得できる場合に使用。日本語の本文がない場合は未取得と明記し、内容を作りません。
- 動画は**説明文・章立ての範囲**をまとめます。映像・字幕は未確認。おすすめ動画・講座・登録案内を混ぜません。
- 大きなA/B/C＋意味のラベル、カード全体の背景色：**A＝淡いブルー、B＝パープル、C＝ミント**。色だけに依存せず区別できます。
- mikimiki web スクール・KEITOの日本語YouTubeを追加。Zenn・QiitaはChatGPT / Gemini中心に変更。同一記事の転載も重複除外します。

## 動いている機能

- **Today**：実用性・興味・新しさ・発信元の偏りで最大5件。直近7日を優先し、少ない場合は30日まで拡大。最近の有用な動画も1件候補にします。情報源OFF・新着不足では3件未満になる場合があります。
- **Explore**：All / Official / YouTube / note / GitHub / Zenn / Qiita / Bluesky / Hacker News / Mastodon、検索・日付順。最大100件の採用記事。GitHub SDKは停止中のため該当記事はありません。
- **Learn**：Agent / MCP / API / RAG / Context window / Embedding / Inferenceなど9語、3段階の説明、未学習 / 理解済みの保存。
- **Settings**：興味・情報源ON/OFF・通知の希望をlocalStorageへ保存。以前の設定・理解済みの用語を引き継ぎます。
- PWAのホーム画面追加、safe area、前回の記事・用語集のオフライン表示。端末設定・学習履歴を公開データへ送信しません。

## 情報源と収集

`sources.json`で接続先を変更できます。稼働中は**15接続先**：OpenAI、Google AI、Google Japan、Anthropic、note公式、YouTube 3チャンネル、Zenn / Qiita各2トピック、Bluesky、Hacker News、Mastodon。SNSは指定アカウントの公開投稿・人気記事から選別し、全体検索ではありません。X・Redditは接続しません。

取得 → 共通Article → 実用情報の選別・重複除外 → 日本語本文の抽出 → 公開JSON → 端末でTodayを選出。
共通項目：`id, title, source, sourceType, url, publishedAt, summary, detailedSummary, importanceScore, importanceGrade, whyImportant, personalRelevance, terms[], thumbnail`。
原題・配信抜粋・まとめの根拠（本文 / 配信抜粋 / 動画説明文）・本文URLも保持。本文全体は公開しません。

情報源別にタイムアウト・障害を分離。前回データは24時間再利用し、全取得失敗時は前回公開分と本来の収集日時を保持。本文取得だけ失敗した場合は日本語の配信抜粋を使い、範囲を明記します。本文の取得先は既知の公開サイトに限定します。

## 費用・APIキー

**現在の構成にAPIキーは不要。課金AI APIを呼びません。** GitHub Freeの公開リポジトリ・標準Linuxランナー・GitHub Pagesを使用し、独自ドメインも不要です。

無料の本文抜粋方式は生成AIによる翻訳・文章の再構成とは異なり、長さ・読みやすさは原文に依存します。重要度・活用のヒントは編集上の目安です。

将来接続用のOpenAI providerは無効で残しています。`npm run collect`は常に無料方式。従来API版で明示的に`SUMMARIZER=openai`とキー・モデルを設定した場合だけ有料呼び出しになります。通常は設定しないでください。`.env`はGit・zip・公開ビルドから除外します。

## ローカルで確認

Node.js 24.xで、`package.json`のあるフォルダで実行：

```sh
npm ci
npm test
npm run collect
npm run build:pages
npm run preview:pages
```

[http://localhost:3001/ai-radar/](http://localhost:3001/ai-radar/)で公開と同じ構成を確認。zipの`data/feed.json`は収集時点の実データ。`data/`・`public/`は生成物のためGitへ含めません。
従来API版は`npm run dev` → [http://localhost:3000](http://localhost:3000)。API版は30秒で収集を区切り、取得済みの結果を返します。

## GitHub PagesとiPhone

1. フォルダ構造・隠しファイルを保持してGitへpush。`Settings → Pages → Source → GitHub Actions`を選択。
2. `Actions → Collect AI news and publish PWA → Run workflow`。テスト・収集・ビルド後に公開URLが更新されます。既定ブランチへのpushでも実行。
3. 毎朝**07:17（日本時間）**にGitHubが収集・公開。PCを閉じても実行されます。定時実行の遅延、公開リポジトリに60日間活動がない場合の自動停止には注意してください。[定時実行の仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
4. iPhoneのSafariで公開HTTPS URLを開き、共有 → **ホーム画面に追加**。アプリの「更新」は直近の公開データを読み直します。

## VercelへDeployする場合

1. GitHubリポジトリをImportし、Root Directoryを`package.json`のある場所にします。
2. Framework **Other**、Node.js **24.x**、Build Command **`npm run build`**、Output Directory **`public`**（`vercel.json`に設定済み）。
3. **環境変数・APIキーなし**でDeploy。`SUMMARIZER=openai`は設定しません。
4. 公開先の`/api/feed`とTodayを確認し、iPhoneのSafariから追加。

Vercel版は開いたときに取得し、15分キャッシュ。閉じている間の定時収集は今回のGitHub Pages版で行います。

## 未実装・検証範囲

- プッシュ通知の購読・配信、端末間同期・永続DB、SNS全体検索は未実装。通知は希望の保存のみ。
- 英文の全文翻訳、生成AIによるAbstract、動画の字幕・映像からの要約は未実装。日本語本文・説明文の取得範囲を明記します。
- iPhone実機のSafari / ホーム画面、Vercel実Deployは未確認。
- 2026-10-07：回帰テスト39件、15接続先の実データ収集、YouTube RSSの404から公開ページへの復旧、GitHubのLinuxサーバーでも15接続先すべて成功（採用72記事・動画24件・課金AI呼び出し0）、静的ビルド、320 / 390 / 430 / 768pxの4画面に横はみ出しなし、学習状況・設定の再読み込みを確認。

構成：`app.js / styles.css / shared.js / terms.js`（画面）、`lib/reader-summary.mjs`（日本語本文・抜粋まとめ）、`lib/youtube.mjs`（動画取得・復旧）、`lib/`（収集・正規化）、`api/feed.js`、`scripts/`、`.github/workflows/update-pages.yml`、`tests/`。
