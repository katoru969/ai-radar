# AI Radar — Version 1.1 / 無料運用

AIの最新情報を、iPhoneで毎日1〜2分確認するPWA。淡い配色・角丸カード・下部ナビを維持しています。**9種類・15接続先をキーなしで取得できます。RedditとXは対象外です。**

## 変更点・現在動く機能

- **Today**：実記事から最大5件。公式記事を優先し、A/B/C、短い日本語ガイド、重要な理由、自分への関連、関連用語、原文リンク。直近7日を優先し、少ない場合は30日まで拡大。情報源の絞り込みや新着不足時は3件未満になることがあります。
- **Explore**：All / Official / YouTube / note / GitHubに、**Zenn / Qiita / Bluesky / Hacker News / Mastodon**を追加。フィルター・検索・日付順で最大100件。SNSから元記事へ、Hacker Newsから議論へ移動できます。SNSは投稿日時を表示します。
- **Learn**：Agent / MCP / API / RAG / Context window / Embedding / Inferenceなど9語を3段階で説明。未学習・理解済みの絞り込みと保存。
- **Settings**：興味分野、9種類の情報源ON/OFF、通知の希望をlocalStorageへ保存。旧設定・学習状況を引き継ぎます。情報源ON/OFFは表示・選出に適用し、収集処理は全接続先を取得します。
- 共通Article、共有先URLを含む重複除外、情報源別のタイムアウト・障害分離を追加。少量しか更新しない情報源の記事も残します。
- GitHub Pagesのサブパス、PWAのmanifest・アイコン・safe area、前回の実記事とアプリ本体のオフライン表示に対応。設定・学習状況は端末ごとの保存です。

## 情報源

`sources.json`で接続先を変更できます。すべて公開情報を、認証なしのRSS / Atom / APIから取得します。

| 種類 | 初期設定 | 追加・変更する項目 |
| --- | --- | --- |
| Official | OpenAI、Google AI、Google JapanのRSS、Anthropic Newsroom | RSS・公式ページの`url` |
| GitHub | openai-python、anthropic-sdk-pythonのReleases Atom | `url` |
| note | note公式`info`のAI関連記事 | `handle` |
| YouTube | OpenAI公式チャンネル | `channelId` |
| Zenn | `llm`・`mcp`トピックのRSS | `topic`、または`handle` / `url` |
| Qiita | `ai`・`生成ai`タグのAtom | `tag`、または`handle` / `url` |
| Bluesky | Simon Willison (`simonwillison.net`) の公開投稿 | `actor`（ハンドルまたはDID） |
| Hacker News | 人気記事の先頭40件からAI関連記事 | `limit`（最大80件） |
| Mastodon | Simon Willisonの公開投稿 | `instance`と`account`、任意の`accountId` |

`id`は一意にしてください。`enabled: false`で収集自体を停止、`aiOnly: true`でAIキーワードに絞ります。Bluesky・Mastodonは指定アカウントの公開投稿のみで、返信・再投稿を除きます。全体を網羅する検索ではありません。一部のMastodonサーバーは公開APIにも認証を要求します。現在の接続先は認証なしで確認済みです。

取得 → 共通Article → URL・共有先URL・同一発信元の原題で重複除外 → 日本語ガイド → 最大100件の公開データ → 端末でTodayを選出。共通項目は`id, title, source, sourceType, url, publishedAt, summary, importanceScore, importanceGrade, whyImportant, personalRelevance, terms[], thumbnail`。原題・抜粋・共有先・議論へのリンクも保持。日付不明や未来の記事は採用しません。

一部の取得失敗でもほかの情報源は継続。Hacker Newsは取得できた記事だけでも表示します。接続先別の前回データは24時間まで再利用。定時収集がすべて失敗した場合は前回公開分と本来の最終収集日時を保持します。初回で記事がゼロの場合は公開を中断します。

接続方法：[Zenn RSS](https://zenn.dev/zenn/articles/zenn-feed-rss)、[Qiitaフィード](https://help.qiita.com/ja/articles/qiita-feed)、[Bluesky API](https://docs.bsky.app/docs/api/app-bsky-feed-get-author-feed)、[Hacker News API](https://github.com/HackerNews/API)、[Mastodon API](https://docs.joinmastodon.org/methods/accounts/#statuses)。

## 費用・必要なAPIキー

**無料構成に必要なAPIキーはありません。** ドメイン購入も不要です。GitHub Freeの公開リポジトリ、標準Linuxランナー、GitHub提供のPages URLを利用します。[Pagesの利用条件](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Actionsの課金](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。

`npm run collect`は常に無料の`rules`方式を使い、環境変数にキーがあっても課金AI APIを呼びません。英文の完全翻訳は行わず、既知の表現・キーワードによる日本語ガイドと原題を表示します。日本語記事はフィードの抜粋も使用します。重要度・活用のヒントは目安です。

OpenAI要約providerは将来接続できる形で残していますが、無料運用では無効です。Vercel / ローカルAPI版でのみ、`.env.example`の3項目を明示設定して有効化できます。**有効化すると料金が発生し、実キーでの呼び出しは未検証です。** キーは`.env`またはホスティングの環境変数 / Secretsに保存し、ソースに書きません。`.env`はGit・zip・公開ビルドから除外しています。

## ローカルで確認する

Node.js **24.x**を使用。このREADMEと`package.json`があるフォルダで実行します。

```sh
npm ci
npm test
npm run collect
npm run build:pages
npm run preview:pages
```

[http://localhost:3001/ai-radar/](http://localhost:3001/ai-radar/)でPagesと同じ静的構成を確認できます。zip同梱の`data/feed.json`は動作確認用の実記事です。`collect`で更新してください。`data/`・`public/`は生成物のためGitには含めません。

従来のAPI構成は`npm run dev` → [http://localhost:3000](http://localhost:3000)。`npm run check:live`で実接続とTodayを確認、`npm run build`でVercel用アセットを生成します。HTMLを直接開く方法には対応していません。

## GitHub Pagesへ公開・PCを閉じていても定時収集

1. 個人用の**公開リポジトリ**を作り、このフォルダの内容をルートへpushします。`.github/workflows/update-pages.yml`など隠しファイルも含め、`.env`・`node_modules`・`data`・`public`は含めません。コード・公開ニュースが公開対象で、端末のlocalStorageはアップロードしません。
2. **Settings → Pages → Source → GitHub Actions**を選択。リポジトリのActionsも有効にします。
3. **Actions → Collect AI news and publish PWA → Run workflow**から既定ブランチで実行。テスト → 収集 → ビルド → Pages公開の順で処理します。Secretsや独自トークンの設定は不要です。
4. 公開URLでTodayと最終収集日時を確認。公開後はGitHub側が収集するため、PC・Codex・ChatGPTを閉じていても実行されます。
5. 仮の定時設定は**毎朝07:17（日本時間）**。workflowの`cron`はUTCで`17 22 * * *`です。希望時刻が決まったら変更できます。既定ブランチへのpush・手動実行でも更新します。
6. iPhoneのSafariで公開HTTPS URLを開き、共有 → **ホーム画面に追加**。iPhoneからPCの`localhost`には接続できません。

PWAの更新ボタンは直近の公開データを読み直します。新しい記事は毎日の定時収集後に公開されます。GitHubの定時実行には遅延・実行見送りがあり得ます。また公開リポジトリに60日間活動がないと定時workflowが自動停止します。止まった場合はActionsから有効化し、手動実行してください。アプリは26時間以上更新がない場合に経過時間を表示します。[定時実行の仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## VercelへDeployする場合

1. ソースをGitHubへpushし、VercelでImport。Root Directoryは`package.json`のある場所。
2. Framework Presetは**Other**、Node.jsは**24.x**、Build Commandは`npm run build`、Output Directoryは`public`。`vercel.json`に設定済みです。
3. 簡易ガイドなら環境変数なしでDeploy。`SUMMARIZER=openai`は設定しません。
4. 公開URLの`/api/feed`とTodayを確認し、iPhoneからホーム画面に追加します。

Vercel版は開いたとき・画面に戻ったとき・表示中の15分間隔で取得。15分キャッシュと同時リクエストの集約があります。Vercel版だけではアプリを閉じた間の定時収集を行いません。今回の無料定時運用はPages版を使用します。

## 未実装・確認範囲

- プッシュ通知の購読・配信、端末間同期、永続DBは未実装。通知は希望の保存のみです。
- 英文の完全な無料翻訳、全文を読んだAI要約、SNS全体検索は未実装。X・Redditは接続しません。
- GitHubアカウント・リポジトリへの公開作業とクラウド上の定時実行、iPhone実機のSafari / ホーム画面、Vercel実Deployは未確認です。
- 2026-10-07に15接続先すべての実データ取得（計100記事）、Todayの5件、回帰テスト21件を確認。320 / 390 / 430 / 768pxで4画面に横はみ出しなし。追加5種類のフィルター、情報源設定・学習状況の再読み込み、Pagesのサブパスを確認。サーバー停止後の再読み込みでも、保存済みToday 5件とLearn 9語が表示されました。

主な構成：`app.js / styles.css / shared.js / terms.js`（画面）、`lib/`（収集・正規化・要約）、`api/feed.js`（従来API）、`scripts/collect.mjs / build.mjs`（無料静的公開）、`.github/workflows/update-pages.yml`（定時収集・公開）、`tests/`（回帰テスト）。
