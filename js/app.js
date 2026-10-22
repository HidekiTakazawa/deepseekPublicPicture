/**
 * 中国語写真作文 - フロントエンド Vue 3 アプリケーションロジック
 */

const { createApp, ref, computed, onMounted, nextTick } = Vue;

createApp({
  setup() {
    // 安全なローカルストレージアクセス（ブロック環境でのクラッシュ回避）
    const safeStorage = {
      get: (key, def = null) => {
        try { return localStorage.getItem(key) || def; } catch (e) { return def; }
      },
      set: (key, val) => {
        try { localStorage.setItem(key, val); } catch (e) {}
      },
      remove: (key) => {
        try { localStorage.removeItem(key); } catch (e) {}
      }
    };

    // 状態管理
    const configGasUrl = (typeof CONFIG !== 'undefined' && CONFIG.GAS_URL) ? CONFIG.GAS_URL.trim() : '';
    const configLicenseUrl = (typeof CONFIG !== 'undefined' && CONFIG.LICENSE_GAS_URL) ? CONFIG.LICENSE_GAS_URL.trim() : '';
    const licenseGasUrl = ref(configLicenseUrl);

    // ライセンス認証関連
    const currentLicenseKey = ref(safeStorage.get('chineseAppLicenseKey', ''));
    const licenseKeyInput = ref(currentLicenseKey.value);
    const isAuthenticated = ref(!!currentLicenseKey.value);
    const isAuthenticating = ref(false);

    const login = async () => {
      if (!licenseKeyInput.value.trim()) {
        showToast('ライセンスキーを入力してください。', 'error');
        return;
      }
      if (!licenseGasUrl.value) {
        currentLicenseKey.value = licenseKeyInput.value;
        safeStorage.set('chineseAppLicenseKey', currentLicenseKey.value);
        isAuthenticated.value = true;
        showToast('認証をスキップしました(サーバー未設定)', 'info');
        return;
      }
      isAuthenticating.value = true;
      try {
        const response = await fetch(licenseGasUrl.value, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'verifyLicense', licenseKey: licenseKeyInput.value }),
          redirect: 'follow'
        });
        const data = await response.json();
        if (data.error) {
          alert("エラー: " + data.error);
          showToast(data.error, 'error');
          isAuthenticating.value = false;
          return;
        }
        if (data.valid) {
          currentLicenseKey.value = licenseKeyInput.value;
          safeStorage.set('chineseAppLicenseKey', currentLicenseKey.value);
          isAuthenticated.value = true;
          showToast('認証に成功しました。', 'success');
        } else {
          alert("このライセンスキーは無効です。");
          showToast("このライセンスキーは無効です。", 'error');
        }
      } catch (error) {
        alert("通信エラー: " + error.message);
        showToast('通信エラー: ' + error.message, 'error');
      }
      isAuthenticating.value = false;
    };

    const logout = () => {
      currentLicenseKey.value = '';
      licenseKeyInput.value = '';
      safeStorage.remove('chineseAppLicenseKey');
      isAuthenticated.value = false;
      showToast('ログアウトしました。', 'info');
    };

    const gasUrl = ref(configGasUrl);
    const isDarkTheme = ref(safeStorage.get('cn_photo_essay_theme') === 'dark');

    const showSettingsModal = ref(false);

    // ユーザー識別用
    const nickname = ref(safeStorage.get('cn_photo_essay_nickname', '名無しさん'));
    const tempNickname = ref(nickname.value);
    const spreadsheetUrl = ref(safeStorage.get('cn_photo_essay_ss_url', ''));
    const driveFolderUrl = ref(safeStorage.get('cn_photo_essay_folder_url', ''));

    // 画像・解析状態
    const currentImage = ref(null); // { base64, mimeType, name, previewUrl, fromDrive, fileId, fileUrl }
    const isAnalyzing = ref(false);
    const analysisData = ref(null);
    const driveInfo = ref(null);
    const isFromCache = ref(false); // スプレッドシートキャッシュから取得したかどうか

    // Google Drive ギャラリー状態
    const showDriveModal = ref(false);
    const driveFiles = ref([]);
    const isLoadingDriveFiles = ref(false);
    const isLoadingDriveImage = ref(false);

    // 作文・添削状態
    const userEssay = ref('');
    const isCheckingEssay = ref(false);
    const correctionData = ref(null);

    // 感想文状態
    const impressions = ref([]);
    const newImpression = ref('');
    const isSubmittingImpression = ref(false);

    // UIタブ
    const activeTab = ref('words'); // 'words' | 'model' | 'correction' | 'impressions'
    const modelLevel = ref('beginner'); // 'beginner' | 'intermediate'
    const essayTextarea = ref(null);

    // トースト通知
    const toasts = ref([]);
    const showToast = (message, type = 'info') => {
      const id = Date.now() + Math.random();
      toasts.value.push({ id, message, type });
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id);
      }, 4500);
    };

    // 初期化
    onMounted(async () => {
      if (isDarkTheme.value) {
        document.body.classList.add('dark-theme');
      }

      // GAS接続がある場合はスプレッドシート情報取得およびDrive履歴を読み込み
      if (gasUrl.value) {
        fetchAppInfo();
        // 起動時にDrive画像履歴を取得し、履歴があれば先頭（最新）の画像を自動表示
        await fetchDriveFiles(true, true);
      }
    });

    // アプリ情報（スプレッドシートURL等）の取得
    const fetchAppInfo = async () => {
      if (!gasUrl.value) return;
      try {
        const response = await fetch(gasUrl.value, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'get_app_info' }),
          redirect: 'follow'
        });
        const res = await response.json();
        if (res.status === 'success') {
          if (res.spreadsheetUrl) {
            spreadsheetUrl.value = res.spreadsheetUrl;
            safeStorage.set('cn_photo_essay_ss_url', res.spreadsheetUrl);
          }
          if (res.folderUrl) {
            driveFolderUrl.value = res.folderUrl;
            safeStorage.set('cn_photo_essay_folder_url', res.folderUrl);
          }
        }
      } catch (e) {
        console.warn('App info fetch error (non-blocking):', e);
      }
    };

    // テーマ切り替え
    const toggleTheme = () => {
      isDarkTheme.value = !isDarkTheme.value;
      if (isDarkTheme.value) {
        document.body.classList.add('dark-theme');
        safeStorage.set('cn_photo_essay_theme', 'dark');
      } else {
        document.body.classList.remove('dark-theme');
        safeStorage.set('cn_photo_essay_theme', 'light');
      }
    };

    // 設定モーダル (ユーザー設定)
    const openSettings = () => {
      tempNickname.value = nickname.value;
      showSettingsModal.value = true;
    };

    const closeSettings = () => {
      showSettingsModal.value = false;
    };

    const saveSettings = () => {
      if (nickname.value !== '名無しさん' && safeStorage.get('cn_photo_essay_nickname')) {
        showToast('ニックネームは既に設定されており変更できません', 'warning');
        closeSettings();
        return;
      }
      const newNick = tempNickname.value.trim();
      if (newNick && newNick !== '名無しさん') {
        nickname.value = newNick;
        safeStorage.set('cn_photo_essay_nickname', nickname.value);
        showToast('ニックネームを保存しました', 'success');
      } else {
        nickname.value = '名無しさん';
        safeStorage.remove('cn_photo_essay_nickname');
      }
      closeSettings();
    };

    // 画像選択・ドロップ処理
    const handleFileChange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) processFile(file);
    };

    const handleDrop = (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        processFile(file);
      }
    };

    // 画像のリサイズ・圧縮＆Base64変換（高速化のため最大幅800px & 0.80クオリティに最適化）
    const processFile = (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // 高速通信 & Vision最適化のため最大800pxにリサイズ
          const maxDim = 800;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const mimeType = 'image/jpeg';
          const base64 = canvas.toDataURL(mimeType, 0.80);

          // 画像Base64のクリーン部分からハッシュを計算（GAS側と同じ方式）
          let cleanB64 = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
          let hashVal = 0;
          let step = Math.max(1, Math.floor(cleanB64.length / 5000));
          for (let i = 0; i < cleanB64.length; i += step) {
            let char = cleanB64.charCodeAt(i);
            hashVal = ((hashVal << 5) - hashVal) + char;
            hashVal = hashVal & hashVal;
          }
          const imageHash = 'h_' + Math.abs(hashVal).toString(16) + '_len' + cleanB64.length;

          currentImage.value = {
            base64: base64,
            mimeType: mimeType,
            name: file.name,
            previewUrl: base64,
            imageHash: imageHash,
            owner: nickname.value
          };

          // 以前の解析結果をリセット
          analysisData.value = null;
          correctionData.value = null;
          driveInfo.value = null;
          isFromCache.value = false;
          userEssay.value = '';
          impressions.value = [];

          showToast('画像を読み込みました。「✨ AIで画像を解析」を押してください', 'info');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    };

    // Google Drive モーダル開く（キャッシュがあれば即時0秒で表示）
    const openDriveModal = async () => {
      showDriveModal.value = true;
      // すでに一覧が取得済みであれば即時表示し、裏側で最新化（または再読み込みボタンで更新）
      if (!driveFiles.value || driveFiles.value.length === 0) {
        await fetchDriveFiles(false);
      } else {
        // バックグラウンドで静かに最新化
        fetchDriveFiles(true);
      }
    };

    const closeDriveModal = () => {
      showDriveModal.value = false;
    };

    // Google Drive から画像一覧を取得 (silent: true の場合はローディング画面を出さずに更新, autoSelectFirst: 1件以上あれば先頭を自動選択)
    const fetchDriveFiles = async (silent = false, autoSelectFirst = false) => {
      if (!silent) {
        isLoadingDriveFiles.value = true;
      }

      if (!gasUrl.value) {
        driveFiles.value = [];
        isLoadingDriveFiles.value = false;
        return;
      }

      try {
        const response = await fetch(gasUrl.value, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'list_drive_images' }),
          redirect: 'follow'
        });
        const res = await response.json();
        if (res.status === 'success' && res.data) {
          driveFiles.value = res.data.files || [];
          // 起動時などで先頭画像を自動表示する場合
          if (autoSelectFirst && driveFiles.value.length > 0 && !currentImage.value) {
            await selectDriveFile(driveFiles.value[0]);
          }
        } else if (!silent) {
          showToast(res.message || 'Drive画像の取得に失敗しました', 'error');
        }
      } catch (err) {
        console.error('Drive files fetch error:', err);
        if (!silent) {
          showToast('Drive画像の取得に失敗しました: ' + err.message, 'error');
        }
      } finally {
        isLoadingDriveFiles.value = false;
      }
    };

    // Google Drive から画像を選択してロード (即時0秒オプティミスティック表示 & 解析データ・作文・添削の一括ロード)
    const selectDriveFile = async (file) => {
      if (!file) return;

      // 1. 【即時表示】クリックされた瞬間に高速サムネイルURLを使って画面に即座（0秒）に画像を表示＆モーダルを閉じる！
      const fastPreviewUrl = file.thumbnailUrl ? file.thumbnailUrl.replace('sz=w300', 'sz=w1000') : `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000`;
      
      currentImage.value = {
        base64: fastPreviewUrl,
        mimeType: file.mimeType || 'image/jpeg',
        name: file.name,
        previewUrl: fastPreviewUrl,
        fromDrive: true,
        fileId: file.id,
        fileUrl: file.url || '',
        owner: file.owner || ''
      };

      driveInfo.value = {
        saved: true,
        fileName: file.name,
        fileUrl: file.url || '',
        isExisting: true
      };

      // 2. 【即時0秒展開】一覧取得時にすでに解析データ・作文・添削があれば、通信を待たずに即座に画面へ反映！
      if (file.analysis) {
        analysisData.value = file.analysis;
        isFromCache.value = true;
        userEssay.value = file.userEssay || '';
        correctionData.value = file.correction || null;
        impressions.value = file.impressions || [];
        activeTab.value = 'words'; // 単語一覧をデフォルト表示

        if (file.correction || file.userEssay) {
          showToast(`⚡「${file.name}」の単語一覧・模範文・前回の作文と添削を読み込みました！`, 'success');
        } else {
          showToast(`⚡「${file.name}」の解析データをスプレッドシートから読み込みました！`, 'success');
        }
      } else {
        // 未解析の場合はリセット
        analysisData.value = null;
        isFromCache.value = false;
        correctionData.value = null;
        userEssay.value = '';
        impressions.value = [];
      }

      // モーダルを即座に閉じる（待ち時間なし！）
      closeDriveModal();

      // 3. もし手元に解析データがない場合、バックグラウンドで取得
      if (!file.analysis) {
        isLoadingDriveImage.value = true;
        try {
          const response = await fetch(gasUrl.value, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'load_drive_image',
              fileId: file.id
            }),
            redirect: 'follow'
          });
          const res = await response.json();
          if (res.status === 'success' && res.data) {
            if (res.data.fileName) {
              currentImage.value.name = res.data.fileName;
            }
            if (res.data.owner !== undefined) {
              currentImage.value.owner = res.data.owner;
            }

            // 以前のユーザー作文・添削結果があれば復元
            if (res.data.userEssay) {
              userEssay.value = res.data.userEssay;
            }
            if (res.data.correction) {
              correctionData.value = res.data.correction;
            }
            if (res.data.impressions) {
              impressions.value = res.data.impressions;
            }

            // 解析済みキャッシュデータがあれば展開
            if (res.data.analysis) {
              analysisData.value = res.data.analysis;
              isFromCache.value = true;
              activeTab.value = 'words';
              
              if (res.data.hasEssay && (res.data.userEssay || res.data.correction)) {
                showToast(`⚡「${file.name}」の単語一覧・模範文・前回の作文と添削を読み込みました！`, 'success');
              } else {
                showToast(`⚡「${file.name}」の解析データをスプレッドシートから読み込みました！`, 'success');
              }
            } else {
              analysisData.value = null;
              isFromCache.value = false;
              showToast(`「${file.name}」を読み込みました。「✨ AIで画像を解析」を押してください`, 'info');
            }
          }
        } catch (err) {
          console.warn('Load drive image background warning:', err);
        } finally {
          isLoadingDriveImage.value = false;
        }
      }
    };

    // 画像解析リクエスト (forceReanalyze: true でキャッシュを無視してDeepSeekで再生成)
    const analyzeImage = async (forceReanalyze = false) => {
      if (!currentImage.value) return;

      isAnalyzing.value = true;
      activeTab.value = 'words';

      if (!gasUrl.value) {
        showToast('GASのWebアプリURLが設定されていません', 'error');
        isAnalyzing.value = false;
        return;
      }

      try {
        const payload = {
          action: 'analyze_image',
          imageBase64: currentImage.value.base64,
          mimeType: currentImage.value.mimeType,
          fileName: currentImage.value.name,
          fromDrive: !!currentImage.value.fromDrive,
          fileId: currentImage.value.fileId || '',
          fileUrl: currentImage.value.fileUrl || '',
          forceReanalyze: !!forceReanalyze,
          owner: nickname.value,
          licenseKey: currentLicenseKey.value
        };

        const response = await fetch(gasUrl.value, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });

        const res = await response.json();
        if (res.status === 'success' && res.data) {
          analysisData.value = res.data.analysis;
          driveInfo.value = res.data.drive;
          isFromCache.value = !!res.data.cached;
          
          // 新規保存されたDriveファイルIDをcurrentImageに即座に紐付け（作文添削保存で確実に利用するため）
          if (res.data.drive && res.data.drive.fileId) {
            currentImage.value.fileId = res.data.drive.fileId;
            currentImage.value.fileUrl = res.data.drive.fileUrl || '';
            if (res.data.drive.fileName) {
              currentImage.value.name = res.data.drive.fileName;
            }
          }
          currentImage.value.owner = res.data.owner !== undefined ? res.data.owner : nickname.value;

          // キャッシュヒット時に以前の作文・添削があれば復元（未入力の場合のみ）
          if (res.data.cached && !userEssay.value && res.data.userEssay) {
            userEssay.value = res.data.userEssay;
          }
          if (res.data.cached && !correctionData.value && res.data.correction) {
            correctionData.value = res.data.correction;
          }
          if (res.data.cached && res.data.impressions) {
            impressions.value = res.data.impressions;
          }

          if (res.data.spreadsheetUrl) {
            spreadsheetUrl.value = res.data.spreadsheetUrl;
            localStorage.setItem('cn_photo_essay_ss_url', res.data.spreadsheetUrl);
          }

          if (res.data.cached) {
            showToast('⚡ スプレッドシートのキャッシュから高速読み込みしました！（約0.5秒）', 'success');
          } else {
            showToast('✨ DeepSeekによる画像解析が完了し、スプレッドシートに保存しました！', 'success');
          }
        } else {
          showToast(res.message || '解析に失敗しました', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('通信エラーが発生しました: ' + err.message, 'error');
      } finally {
        isAnalyzing.value = false;
      }
    };

    // 作文添削リクエスト (添削後にスプレッドシートへ自動保存)
    const checkEssay = async () => {
      if (!userEssay.value.trim()) {
        showToast('作文を入力してください', 'warning');
        return;
      }

      if (currentImage.value && !currentImage.value.fileId && !analysisData.value) {
        showToast('先に「✨ AIで画像を解析」を行ってください', 'warning');
        return;
      }

      isCheckingEssay.value = true;
      activeTab.value = 'correction';

      if (!gasUrl.value) {
        showToast('GASのWebアプリURLが設定されていません', 'error');
        isCheckingEssay.value = false;
        return;
      }

      try {
        // 画像コンテキスト（抽出された単語やシーン概要）を付与
        let imageContext = '';
        if (analysisData.value) {
          imageContext = `画像概要: ${analysisData.value.scene_description_ja || ''}\n主な単語: ${
            (analysisData.value.words || []).map(w => w.word).join(', ')
          }`;
        }

        const payload = {
          action: 'check_essay',
          userEssay: userEssay.value,
          imageContext: imageContext,
          fileId: (currentImage.value && currentImage.value.fileId) ? currentImage.value.fileId : '',
          fileName: (currentImage.value && currentImage.value.name) ? currentImage.value.name : 'photo.jpg',
          imageHash: (currentImage.value && currentImage.value.imageHash) ? currentImage.value.imageHash : '',
          owner: nickname.value,
          licenseKey: currentLicenseKey.value
        };

        const response = await fetch(gasUrl.value, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });

        const res = await response.json();
        if (res.status === 'success' && res.data) {
          correctionData.value = res.data;
          if (res.spreadsheetUrl) {
            spreadsheetUrl.value = res.spreadsheetUrl;
            safeStorage.set('cn_photo_essay_ss_url', res.spreadsheetUrl);
          }
          showToast('✨ 作文の添削が完了し、スプレッドシートに保存しました！', 'success');
          // 一覧の作文状態（作文ありバッジや点数）を静かに同期
          fetchDriveFiles(true);
        } else {
          showToast(res.message || '添削に失敗しました', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('通信エラーが発生しました: ' + err.message, 'error');
      } finally {
        isCheckingEssay.value = false;
      }
    };

    // 単語を作文入力欄に挿入
    const insertWordToEssay = (word) => {
      if (!word) return;
      if (!userEssay.value) {
        userEssay.value = word;
      } else {
        userEssay.value += (userEssay.value.endsWith(' ') || userEssay.value.endsWith('，') || userEssay.value.endsWith('。') ? '' : ' ') + word;
      }
      showToast(`「${word}」を作文に挿入しました`, 'info');
      nextTick(() => {
        if (essayTextarea.value) {
          essayTextarea.value.focus();
        }
      });
    };

    // 画像読み込みエラー時のフォールバック処理 (Google Driveの別URL形式へ切り替え)
    const handleImageError = (e) => {
      if (!currentImage.value) return;
      const fileId = currentImage.value.fileId;
      if (!fileId) return;

      const currentSrc = currentImage.value.previewUrl || '';
      // 1. thumbnail?id=... が失敗した場合 -> lh3.googleusercontent.com/d/... を試す
      if (currentSrc.includes('drive.google.com/thumbnail')) {
        const fallbackUrl1 = `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
        currentImage.value.previewUrl = fallbackUrl1;
        currentImage.value.base64 = fallbackUrl1;
      } 
      // 2. lh3 が失敗した場合 -> uc?export=view&id=... を試す
      else if (currentSrc.includes('googleusercontent.com')) {
        const fallbackUrl2 = `https://drive.google.com/uc?export=view&id=${fileId}`;
        currentImage.value.previewUrl = fallbackUrl2;
        currentImage.value.base64 = fallbackUrl2;
      }
    };

    // 中国語音声読み上げ (Web Speech API)
    const speakChinese = (text) => {
      if (!window.speechSynthesis) {
        showToast('お使いのブラウザは音声合成に対応していません', 'warning');
        return;
      }
      window.speechSynthesis.cancel(); // 前の音声を停止
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN'; // 中国語 (普通話)
      utterance.rate = 0.85;    // 学習者向けにややゆっくり
      utterance.pitch = 1.0;

      // 中国語対応の音声を探す
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang === 'zh-CN' || v.lang.startsWith('zh'));
      if (zhVoice) {
        utterance.voice = zhVoice;
      }

      window.speechSynthesis.speak(utterance);
    };



    // 感想文送信リクエスト
    const submitImpression = async () => {
      if (!newImpression.value.trim() || !currentImage.value || !currentImage.value.fileId) {
        showToast('画像が保存されていないか、感想文が空です', 'warning');
        return;
      }
      isSubmittingImpression.value = true;
      try {
        const payload = {
          action: 'add_impression',
          fileId: currentImage.value.fileId,
          name: nickname.value || '名無しさん',
          text: newImpression.value.trim()
        };
        const response = await fetch(gasUrl.value, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });
        const res = await response.json();
        if (res.status === 'success' && res.data && res.data.impressions) {
          impressions.value = res.data.impressions;
          newImpression.value = '';
          showToast('感想を送信しました！', 'success');
        } else {
          showToast(res.message || '送信に失敗しました', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('通信エラーが発生しました: ' + err.message, 'error');
      } finally {
        isSubmittingImpression.value = false;
      }
    };

    // Google Drive 画像の削除
    const deleteDriveFile = async (file) => {
      if (!confirm(`「${file.name}」を削除しますか？\n（Google Driveとキャッシュから完全に削除されます）`)) return;
      
      try {
        const response = await fetch(gasUrl.value, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete_drive_image',
            fileId: file.id,
            owner: nickname.value
          }),
          redirect: 'follow'
        });
        const res = await response.json();
        if (res.status === 'success') {
          showToast(`画像を削除しました`, 'success');
          driveFiles.value = driveFiles.value.filter(f => f.id !== file.id);
          if (currentImage.value && currentImage.value.fileId === file.id) {
            currentImage.value = null;
            analysisData.value = null;
            userEssay.value = '';
            correctionData.value = null;
            impressions.value = [];
          }
        } else {
          showToast(res.message || '画像の削除に失敗しました', 'error');
        }
      } catch (err) {
        console.error('Delete error:', err);
        showToast('画像の削除中にエラーが発生しました', 'error');
      }
    };

    // プリント（PDF出力）処理
    const printContent = () => {
      if (!currentImage.value) {
        showToast('印刷するデータがありません。画像を読み込んでください。', 'warning');
        return;
      }
      
      let html = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <title>中国語写真作文プリント - ${currentImage.value.name}</title>
          <style>
            body { font-family: "Noto Sans JP", "Noto Sans SC", sans-serif; padding: 20px; color: #333; line-height: 1.6; }
            h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            h2 { font-size: 18px; margin-top: 25px; border-bottom: 1px solid #ccc; padding-bottom: 5px; color: #1e293b; }
            .image-container { text-align: center; margin-bottom: 20px; }
            .image-container img { max-width: 100%; max-height: 350px; border: 1px solid #ccc; border-radius: 8px; }
            .word-list { display: flex; flex-wrap: wrap; gap: 10px; }
            .word-item { border: 1px solid #ddd; padding: 10px; width: calc(50% - 15px); border-radius: 5px; box-sizing: border-box; }
            .word-zh { font-weight: bold; font-size: 18px; color: #0f172a; }
            .word-py { color: #64748b; font-weight: normal; font-size: 14px; }
            .word-ja { font-size: 14px; color: #334155; margin-top: 4px; }
            .essay-box { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e2e8f0; }
            .essay-title { font-weight: bold; margin-bottom: 10px; color: #0f172a; }
            .essay-zh { font-size: 18px; font-weight: bold; margin-bottom: 8px; color: #0f172a; }
            .essay-py { color: #475569; margin-bottom: 6px; font-size: 14px; }
            .essay-ja { font-size: 14px; color: #334155; }
            .diff-card { border-left: 4px solid #ef4444; padding: 10px; background: #fff; margin-top: 10px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .diff-card.better { border-left-color: #10b981; }
            .diff-original { color: #ef4444; text-decoration: line-through; margin-bottom: 4px; font-size: 15px; }
            .diff-corrected { color: #10b981; font-weight: bold; margin-bottom: 4px; font-size: 16px; }
            .diff-reason { color: #475569; font-size: 14px; margin-top: 5px; }
            .tips-list { margin-top: 10px; padding-left: 20px; font-size: 14px; color: #334155; }
            .tips-list li { margin-bottom: 5px; }
            .impression { border-bottom: 1px dashed #cbd5e1; padding: 10px 0; font-size: 14px; }
            @media print {
              .no-break { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>中国語写真作文 - 学習プリント</h1>
          <div class="image-container no-break">
            <img src="${currentImage.value.previewUrl}" alt="Print Image">
          </div>
      `;

      if (analysisData.value) {
        html += `<h2>1. 単語リスト</h2><div class="word-list">`;
        (analysisData.value.words || []).forEach(w => {
          html += `
            <div class="word-item no-break">
              <div class="word-zh">${w.word} <span class="word-py">(${w.pinyin})</span></div>
              <div class="word-ja"><strong>意味:</strong> ${w.meaning}</div>
              <div class="word-ja"><strong>例文:</strong> ${w.example_cn} <br><span style="color:#64748b; font-size:0.85em;">(${w.example_pinyin})</span><br>${w.example_ja}</div>
            </div>
          `;
        });
        html += `</div>`;

        if (analysisData.value.model_essays) {
          html += `<h2>2. 模範作文</h2>`;
          if (analysisData.value.model_essays.beginner) {
            const b = analysisData.value.model_essays.beginner;
            html += `<div class="essay-box no-break">
              <div class="essay-title">${b.level_title}</div>
              <div class="essay-zh">${b.essay_cn}</div>
              <div class="essay-py">${b.essay_pinyin}</div>
              <div class="essay-ja">${b.essay_ja}</div>
            </div>`;
          }
          if (analysisData.value.model_essays.intermediate) {
            const i = analysisData.value.model_essays.intermediate;
            html += `<div class="essay-box no-break">
              <div class="essay-title">${i.level_title}</div>
              <div class="essay-zh">${i.essay_cn}</div>
              <div class="essay-py">${i.essay_pinyin}</div>
              <div class="essay-ja">${i.essay_ja}</div>
            </div>`;
          }
        }
      }

      if (userEssay.value) {
        html += `<h2>3. あなたの作文</h2>`;
        html += `<div class="essay-box no-break"><div class="essay-zh">${userEssay.value}</div></div>`;
      }

      if (correctionData.value) {
        html += `<h2>4. 添削結果 (${correctionData.value.score}点)</h2>`;
        html += `<div class="essay-box no-break">
          <div class="essay-zh">${correctionData.value.corrected_essay}</div>
          <div class="essay-py">${correctionData.value.corrected_pinyin}</div>
          <div class="essay-ja">${correctionData.value.corrected_ja}</div>
          <p style="margin-top: 10px; font-size: 14px;"><strong>AI教師のコメント:</strong><br>${correctionData.value.score_comment}</p>
        </div>`;

        if (correctionData.value.corrections && correctionData.value.corrections.length > 0) {
          html += `<h3 style="margin-top: 20px; font-size: 16px;">🔍 修正箇所の解説</h3>`;
          correctionData.value.corrections.forEach(corr => {
            html += `<div class="diff-card no-break">
              <div class="diff-original">元の文: ${corr.original}</div>
              <div class="diff-corrected">修正後: ${corr.corrected} <span style="font-weight: normal; font-size: 13px; color: #64748b;">(${corr.pinyin})</span></div>
              <div class="diff-reason">${corr.reason}</div>
            </div>`;
          });
        }

        if (correctionData.value.better_expressions && correctionData.value.better_expressions.length > 0) {
          html += `<h3 style="margin-top: 20px; font-size: 16px;">💡 ネイティブ度UPの表現</h3>`;
          correctionData.value.better_expressions.forEach(exp => {
            html += `<div class="diff-card better no-break">
              <div class="essay-zh" style="margin-bottom: 2px;">${exp.expression} <span style="font-size: 14px; color: #64748b; font-weight: normal;">(${exp.pinyin})</span></div>
              <div class="diff-reason">${exp.meaning}</div>
            </div>`;
          });
        }

        if (correctionData.value.grammar_tips && correctionData.value.grammar_tips.length > 0) {
          html += `<h3 style="margin-top: 20px; font-size: 16px;">📚 日本人学習者への文法アドバイス</h3>`;
          html += `<ul class="tips-list">`;
          correctionData.value.grammar_tips.forEach(tip => {
            html += `<li>${tip}</li>`;
          });
          html += `</ul>`;
        }
      }

      if (impressions.value && impressions.value.length > 0) {
        html += `<h2>5. 感想</h2>`;
        impressions.value.forEach(imp => {
          html += `<div class="impression no-break">
            <strong>${imp.name}</strong> <span style="color: #64748b; font-size: 12px;">(${imp.date})</span><br>
            ${imp.text.replace(/\n/g, '<br>')}
          </div>`;
        });
      }

      html += `
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
        </script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      } else {
        showToast('ポップアップがブロックされました。ブラウザの設定で許可してください。', 'warning');
      }
    };

    return {
      // 設定 & テーマ
      gasUrl,
      configGasUrl,
      spreadsheetUrl,
      driveFolderUrl,
      isDarkTheme,
      showSettingsModal,
      nickname,
      tempNickname,
      toggleTheme,
      openSettings,
      closeSettings,
      saveSettings,

      // 画像 & 解析
      currentImage,
      isAnalyzing,
      analysisData,
      driveInfo,
      isFromCache,
      handleFileChange,
      handleDrop,
      analyzeImage,

      // Google Drive ギャラリー
      showDriveModal,
      driveFiles,
      isLoadingDriveFiles,
      isLoadingDriveImage,
      openDriveModal,
      closeDriveModal,
      fetchDriveFiles,
      selectDriveFile,
      deleteDriveFile,

      // 作文 & 添削
      userEssay,
      isCheckingEssay,
      correctionData,
      checkEssay,
      insertWordToEssay,
      essayTextarea,

      // 感想文
      impressions,
      newImpression,
      isSubmittingImpression,
      submitImpression,

      // UI
      activeTab,
      modelLevel,
      speakChinese,
      handleImageError,
      toasts,
      printContent,

      // 認証関連
      isAuthenticated,
      isAuthenticating,
      licenseKeyInput,
      login,
      logout
    };
  }
}).mount('#app');
