# 使用 Vertex AI 設定（不需 VPN）

本專案已改為使用 **Google Cloud Vertex AI** 呼叫 Gemini，依你的 GCP 專案地區連線，多數地區不需開 VPN。

## 步驟一：建立 Google Cloud 專案

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 點左上角專案 → **新增專案**，輸入專案名稱後建立
3. 記下 **專案 ID**（英文與數字，例如 `my-fruit-analyzer`）

## 步驟二：啟用 Vertex AI API

1. 在 GCP Console 搜尋 **「Vertex AI API」**
2. 進入後點 **啟用**
3. 若系統要求啟用計費：Vertex AI 有免費額度，可先啟用計費並設定預算上限

## 步驟三：建立服務帳戶與金鑰

1. 左側選單 **IAM 與管理** → **服務帳戶**
2. 點 **建立服務帳戶**，名稱可填 `fruit-analyzer`
3. 角色選擇 **Vertex AI 使用者**（Vertex AI User）
4. 建立完成後，點進該服務帳戶 → **金鑰** → **新增金鑰** → **建立新金鑰** → **JSON**
5. 下載的 JSON 檔請放到專案根目錄，檔名改為 `vertex-key.json`（此檔已在 .gitignore，不會被提交）

## 步驟四：設定 .env.local

在專案根目錄的 `.env.local` 中設定（若沒有此檔，可複製 `.env.local.example` 再改）：

```env
VERTEX_PROJECT_ID=你的專案ID
VERTEX_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./vertex-key.json
```

- `VERTEX_PROJECT_ID`：步驟一記下的專案 ID  
- `VERTEX_LOCATION`：可用 `us-central1`、`asia-northeast1`（東京）等 [支援區域](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)  
- `GOOGLE_APPLICATION_CREDENTIALS`：若金鑰檔放在專案根目錄且檔名為 `vertex-key.json`，填 `./vertex-key.json` 即可

## 步驟五：重啟並測試

1. 終端機執行：`npm run dev`
2. 開啟 http://localhost:3000，上傳一張水果包裝圖並點 **開始解析**

若出現認證或權限錯誤，請確認服務帳戶角色為 **Vertex AI 使用者**，且金鑰路徑正確。
