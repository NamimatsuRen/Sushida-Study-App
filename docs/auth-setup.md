# Google・メールログインの接続手順

公開先は既存のSites、認証と利用者別の保存はSupabase Auth / Postgresを使う。ユーザー指定のGoogle・メール認証に合わせた構成。ChatGPTアカウントは不要。

Project URLとPublishable Keyはアプリに設定済み。公開キーはブラウザで使うためのキーで、データへのアクセスはログインとRow Level Securityで制御する。Secret Key・service_roleキー・データベースパスワードはアプリやGitHubに入れない。

## 1. 学習記録のテーブルを作る

1. [SupabaseのSQL Editor](https://supabase.com/dashboard/project/tabpoxutfuvtcuytthqk/sql/new)を開く。
2. [マイグレーションSQL](../supabase/migrations/202611050001_profiles.sql)の内容を貼り付け、一度実行する。
3. `sushi_profiles` テーブルが作られ、RLSが有効になっていることを確認する。

SQLはテーブル・ポリシー・更新時刻のトリガーだけを作る。既存の学習データや認証ユーザーは変更しない。同じSQLを繰り返し実行する必要はない。

## 2. 認証の戻り先を設定する

Supabaseの **Authentication → URL Configuration** で以下を設定する。

- Site URL：`https://oboe-sushi-ren.namimatsuren.chatgpt.site`
- Redirect URLs：`https://oboe-sushi-ren.namimatsuren.chatgpt.site/`
- Redirect URLs：`https://oboe-sushi-ren.namimatsuren.chatgpt.site/?flow=recovery`

別ドメインへ移す場合は、そのURLも明示的に許可し、Site URLを更新する。広いワイルドカードは本番設定に使わない。

## 3. Googleログインを有効にする

1. Google Cloud Consoleでプロジェクトを選び、Google Auth PlatformのBranding・Audienceを設定する。
2. OAuthクライアントを「ウェブアプリケーション」で作成する。
3. JavaScriptの生成元に `https://oboe-sushi-ren.namimatsuren.chatgpt.site` を登録する。
4. リダイレクトURIに `https://tabpoxutfuvtcuytthqk.supabase.co/auth/v1/callback` を登録する。
5. Googleで発行されたClient ID / Client Secretを、Supabaseの **Authentication → Sign In / Providers → Google** に入力して有効にする。Client SecretはチャットやGitHubに送らず、管理画面に直接入れる。
6. GoogleのAudienceがテスト状態なら許可されたテスト利用者だけが使える。一般公開前に、対象利用者と公開状態を確認する。

公式：[Supabase・Google認証](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)

## 4. メール登録・確認メールを設定する

- Emailプロバイダーとメール確認を有効にする。
- アプリはメール＋パスワードでの登録・ログイン・パスワード再設定に対応する。
- 一般利用者への確認・再設定メールを送るため、Custom SMTPを設定する。Supabaseの既定メール送信は開発・試験向けで、送信先・件数に制限がある。
- PKCEを使うため、確認・再設定のメールは手続きを始めたブラウザで開く。

公式：[メール・パスワード認証](https://supabase.com/docs/guides/auth/passwords)、[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## 5. 公開後の確認

- ゲストで学習でき、ログイン前のデータはそのブラウザに残る。
- Googleログイン、新規メール登録→確認メール→ログイン、再設定、ログアウトを試す。
- 新しいアカウントで「この端末の学習記録を引き継ぐ」を選ぶと、元のゲスト記録を残してアカウントへ保存する。
- 別のブラウザで同じアカウントにログインすると、学習記録・復習予定・自作問題を読める。
- 別アカウントで他人の記録を読めないこと、未ログインでテーブルの内容を読めないことを確認する。
- 複数端末が同じ保存版を更新すると、後の書き込みは競合として止まり、端末の未同期分を保持する。アカウント画面から退避・再読込できる。

管理画面・Google側の設定と実際のメール配信は、Project URLと公開キーだけでは変更できない。これらが未設定の場合、アプリのボタンだけではGoogleログインやクラウド保存は完了しない。
