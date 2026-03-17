// 스코어보드 클라이언트 + 공통 유틸리티
// ActionCable 기반 실시간 스코어보드의 핵심 로직을 담당한다.
// 분리된 파일: list_sort.js, drag_and_drop.js, sidebar.js

// HTML escape utility to prevent XSS via innerHTML
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

document.addEventListener("DOMContentLoaded", () => {
  // Flash Messages Auto-dismiss
  const flashMessages = document.getElementById("flash-messages");
  if (flashMessages && flashMessages.children.length > 0) {
    setTimeout(() => {
      // Fade out
      flashMessages.style.transition = "opacity 0.5s ease-out";
      flashMessages.style.opacity = "0";

      // Remove after fade out
      setTimeout(() => {
        flashMessages.remove();
      }, 500);
    }, 3000);
  }

  document.querySelectorAll("[data-href]").forEach((card) => {
    card.addEventListener("click", (event) => {
      const target = event.target;
      if (
        target.closest("a") ||
        target.closest("button") ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest("textarea")
      ) {
        return;
      }
      const href = card.dataset.href;
      if (href) {
        window.location.href = href;
      }
    });
  });



  const scoreboardRoot = document.querySelector("[data-scoreboard-root]");

  if (scoreboardRoot) {

    const parseJsonDataset = (raw, fallback = []) => {
      if (!raw) return fallback;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : fallback;
      } catch (error) {
        console.warn("JSON dataset parse failed", error);
        return fallback;
      }
    };

    const role = scoreboardRoot.dataset.scoreboardRole;
    const matchId = scoreboardRoot.dataset.matchId;
    const quarterScoreViewStorageKey = `scoreboard:quarter-score-view:${matchId}`;
    const QUARTER_SCORE_VIEW_MODES = ["cumulative", "per_quarter"];
    const teams = parseJsonDataset(scoreboardRoot.dataset.teams, []);
    const games = parseJsonDataset(scoreboardRoot.dataset.games, []);
    const teamsCount = parseInt(scoreboardRoot.dataset.teamsCount || "2", 10);
    const parsedDefaultPeriodSeconds = parseInt(scoreboardRoot.dataset.defaultPeriodSeconds || "480", 10);
    const defaultPeriodSeconds = Number.isFinite(parsedDefaultPeriodSeconds) && parsedDefaultPeriodSeconds > 0 ? parsedDefaultPeriodSeconds : 480;
    // 샷클락 리셋 값: 0.99초를 더해 floor() 표시 시 첫 1초간 24/14가 보이도록 함
    const SHOT_CLOCK_24 = 24.99;
    const SHOT_CLOCK_14 = 14.99;
    const parseBooleanDataset = (value, fallback = true) => {
      if (value === undefined || value === null || value === "") return fallback;
      const normalized = String(value).trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
      return fallback;
    };
    const parseRegularQuarters = (value, fallback = 4) => {
      const parsed = Number.parseInt(value, 10);
      if ([3, 4].includes(parsed)) return parsed;
      return [3, 4].includes(fallback) ? fallback : 4;
    };
    const defaultSoundEnabled = parseBooleanDataset(scoreboardRoot.dataset.soundEnabled, true);
    const defaultVoiceEnabled = parseBooleanDataset(scoreboardRoot.dataset.voiceEnabled, true);
    const defaultAnnouncementsEnabled = defaultSoundEnabled && defaultVoiceEnabled;
    const defaultRegularQuarters = parseRegularQuarters(scoreboardRoot.dataset.regularQuarters, 4);
    const VOICE_ANNOUNCEMENT_RATES = [1.0, 1.1, 0.9];
    const normalizeVoiceRate = (value, fallback = 1.0) => {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) return fallback;
      const rounded = Math.round(parsed * 10) / 10;
      return VOICE_ANNOUNCEMENT_RATES.includes(rounded) ? rounded : fallback;
    };
    const defaultVoiceRate = normalizeVoiceRate(scoreboardRoot.dataset.voiceRate, 1.0);
    const SUPPORTED_UI_LOCALES = ["ko", "ja", "en", "zh", "fr", "es", "it", "pt", "tl", "de"];
    const DEFAULT_VOICE_LANG_BY_LOCALE = {
      ko: "ko-KR",
      ja: "ja-JP",
      en: "en-US",
      zh: "zh-CN",
      fr: "fr-FR",
      es: "es-ES",
      it: "it-IT",
      pt: "pt-BR",
      tl: "fil-PH",
      de: "de-DE"
    };
    const normalizeUiLocale = (value) => {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "ko";
      const code = raw.split("-")[0];
      return SUPPORTED_UI_LOCALES.includes(code) ? code : "ko";
    };
    const uiLocale = normalizeUiLocale(scoreboardRoot.dataset.locale || document.documentElement.lang || "ko");
    const scoreboardVoiceLang = String(scoreboardRoot.dataset.voiceLang || DEFAULT_VOICE_LANG_BY_LOCALE[uiLocale] || "ko-KR");
    const UI_MESSAGES = {
      ko: {
        team_word: "팀",
        roster_empty: "명단 없음",
        roster_label: "명단",
        quarter_table_need_teams: "점수표를 표시하려면 최소 2팀이 필요합니다.",
        quarter_table_matchup: "경기 (Matchup)",
        quarter_table_final: "최종",
        main_start: "시작",
        main_stop: "멈춤",
        announcements_on: "🔊 안내 ON",
        announcements_off: "🔇 안내 OFF",
        quarter_reset_on: "쿼터별 점수 리셋 ON",
        quarter_reset_off: "쿼터별 점수 리셋 OFF",
        progression_sequential: "경기별 진행",
        progression_round_robin: "쿼터별 진행",
        finish_current_game: "🏁 현재 경기 종료",
        finish_match: "🏁 경기 종료",
        add_game_enabled: "+ 경기 추가 (%{current}/%{max})",
        add_game_completed: "경기 추가 완료 (%{max}/%{max})",
        next_quarter: "다음 쿼터",
        prev_quarter: "이전 쿼터",
        score_finalize: "점수 확정",
        saved_complete: "저장 완료",
        shortcuts_hide: "⌨️ 상세 숨기기",
        shortcuts_show: "⌨️ 상세 보기",
        possession_left: "왼쪽",
        possession_right: "오른쪽",
        possession_toggle: "공격 전환",
        confirm_reset_all: "정말로 모든 점수와 시간을 초기화하시겠습니까?",
        confirm_reset_timer: "타이머를 초기화하시겠습니까?",
        confirm_reset_score: "점수를 초기화하시겠습니까?",
        connection_lost: "연결 끊김",
        reconnecting: "재연결 중...",
        timeout_label: "타임아웃",
        alert_club_not_found: "클럽 정보를 찾을 수 없습니다.",
        alert_add_game_failed: "경기 추가에 실패했습니다.",
        alert_add_game_error: "경기 추가 중 오류가 발생했습니다.",
        alert_score_save_failed: "점수 저장 실패: %{error}",
        alert_unknown_error: "알 수 없는 오류",
        alert_finish_current_game: "현재 경기 종료!\n최종 점수: %{team1} %{score1} : %{score2} %{team2}\n다음 경기로 이동합니다.",
        alert_finish_match: "경기 종료!\n최종 점수: %{team1} %{score1} : %{score2} %{team2}\n결과: %{result}",
        alert_score_save_error: "점수 저장 중 오류가 발생했습니다.",
        confirm_finish_current_game: "현재 경기를 종료하고 점수를 저장한 뒤 다음 경기로 이동하시겠습니까?",
        confirm_finish_match: "경기를 종료하고 현재 점수를 저장하시겠습니까?",
        confirm_new_game_reset: "모든 경기 점수 데이터가 초기화 됩니다. 진행 하시겠습니까?",
        voice_score_pattern: "%{home} 대 %{away}",
        voice_countdown_pattern: "%{count}",
        control_panel_prefix: "제어",
        control_panel_highlight: "패널",
        control_connected: "연결됨",
        open_display: "디스플레이 열기",
        live: "라이브",
        game_timer: "경기 타이머",
        reset: "리셋",
        shot_clock_title: "샷클락",
        foul: "파울",
        buzzer_label: "🔔 버저",
        reset_all: "🔄 전체 리셋",
        swap_scores: "🔄 점수 바꾸기",
        match_reset: "경기 리셋",
        view_cumulative: "누적",
        view_per_quarter: "쿼터별",
        drag: "↕ 드래그",
        drag_matchup_aria: "경기 순서 변경",
        shortcuts_title: "키보드 단축키",
        drag_shortcuts_aria: "단축키 순서 변경",
        shortcut_game_clock_toggle: "경기 시간 시작 / 멈춤",
        shortcut_shot_reset: "샷클락 리셋 (14초 / 24초)",
        shortcut_shot_toggle: "샷클락 멈춤 / 시작",
        shortcut_announcements_toggle: "B: 안내 ON / V: 안내 OFF",
        shortcut_buzzer: "부저 울리기",
        shortcut_left_score_add: "왼쪽 팀 득점 (+1, +2, +3)",
        shortcut_right_score_add: "오른쪽 팀 득점 (+1, +2, +3)",
        shortcut_score_subtract: "5: 오른쪽 팀 -1 / 6: 왼쪽 팀 -1",
        shortcut_fouls: "A/S: 오른쪽 파울 -, + · K/L: 왼쪽 파울 -, +",
        shortcut_next_quarter: "다음 쿼터로 이동",
        game_clock_label: "경기 시계",
        shot_clock_label: "샷클락",
        fullscreen: "전체 화면",
        exit_fullscreen: "화면 축소",
        standalone_mode: "단독 모드",
        team_label_pattern: "%{label}",
        matchup_pattern: "%{home} vs %{away}",
        member_name_unknown: "이름없음",
        toggle_possession: "↔️ 공격 전환",
        save_and_pause: "💾 저장하고 중단",
        confirm_save_and_pause: "현재 경기 상황을 저장하고 중단하시겠습니까?",
        alert_save_and_pause_success: "경기 상황이 저장되었습니다. 언제든 다시 시작할 수 있습니다.",
        alert_save_and_pause_error: "저장 중 오류가 발생했습니다."
      },
      ja: {
        team_word: "チーム",
        roster_empty: "メンバーなし",
        roster_label: "ロスター",
        quarter_table_need_teams: "スコア表を表示するには最低2チームが必要です。",
        quarter_table_matchup: "対戦 (Matchup)",
        quarter_table_final: "最終",
        main_start: "開始",
        main_stop: "停止",
        announcements_on: "🔊 音声案内 ON",
        announcements_off: "🔇 音声案内 OFF",
        quarter_reset_on: "クォーターごとリセット ON",
        quarter_reset_off: "クォーターごとリセット OFF",
        progression_sequential: "試合別進行",
        progression_round_robin: "クォーター別進行",
        finish_current_game: "🏁 現在の試合終了",
        finish_match: "🏁 試合終了",
        add_game_enabled: "+ 試合追加 (%{current}/%{max})",
        add_game_completed: "試合追加完了 (%{max}/%{max})",
        next_quarter: "次のクォーター",
        prev_quarter: "前のクォーター",
        score_finalize: "スコア確定",
        saved_complete: "保存完了",
        shortcuts_hide: "⌨️ 詳細を隠す",
        shortcuts_show: "⌨️ 詳細を表示",
        possession_left: "左",
        possession_right: "右",
        possession_toggle: "攻撃切替",
        confirm_reset_all: "本当にすべてのスコアと時間を初期化しますか？",
        confirm_reset_timer: "タイマーをリセットしますか？",
        confirm_reset_score: "スコアをリセットしますか？",
        connection_lost: "接続切断",
        reconnecting: "再接続中...",
        timeout_label: "タイムアウト",
        alert_club_not_found: "クラブ情報が見つかりません。",
        alert_add_game_failed: "試合の追加に失敗しました。",
        alert_add_game_error: "試合追加中にエラーが発生しました。",
        alert_score_save_failed: "スコア保存失敗: %{error}",
        alert_unknown_error: "不明なエラー",
        alert_finish_current_game: "現在の試合終了！\n最終スコア: %{team1} %{score1} : %{score2} %{team2}\n次の試合へ移動します。",
        alert_finish_match: "試合終了！\n最終スコア: %{team1} %{score1} : %{score2} %{team2}\n結果: %{result}",
        alert_score_save_error: "スコア保存中にエラーが発生しました。",
        confirm_finish_current_game: "現在の試合を終了してスコアを保存し、次の試合へ移動しますか？",
        confirm_finish_match: "試合を終了して現在のスコアを保存しますか？",
        confirm_new_game_reset: "すべての試合スコアデータを初期化します。続行しますか？",
        voice_score_pattern: "%{home} 対 %{away}",
        voice_countdown_pattern: "%{count}",
        control_panel_prefix: "操作",
        control_panel_highlight: "パネル",
        control_connected: "接続中",
        open_display: "ディスプレイを開く",
        live: "ライブ",
        game_timer: "試合タイマー",
        reset: "リセット",
        shot_clock_title: "ショットクロック",
        foul: "ファウル",
        buzzer_label: "🔔 ブザー",
        reset_all: "🔄 全体リセット",
        swap_scores: "🔄 スコア入替",
        match_reset: "試合リセット",
        view_cumulative: "累計",
        view_per_quarter: "クォーター別",
        drag: "↕ ドラッグ",
        drag_matchup_aria: "対戦順を変更",
        shortcuts_title: "キーボードショートカット",
        drag_shortcuts_aria: "ショートカット順を変更",
        shortcut_game_clock_toggle: "試合時間 開始 / 停止",
        shortcut_shot_reset: "ショットクロック リセット (14秒 / 24秒)",
        shortcut_shot_toggle: "ショットクロック 停止 / 開始",
        shortcut_announcements_toggle: "B: 案内 ON / V: 案内 OFF",
        shortcut_buzzer: "ブザーを鳴らす",
        shortcut_left_score_add: "左チーム得点 (+1, +2, +3)",
        shortcut_right_score_add: "右チーム得点 (+1, +2, +3)",
        shortcut_score_subtract: "5: 右チーム -1 / 6: 左チーム -1",
        shortcut_fouls: "A/S: 右ファウル -, + · K/L: 左ファウル -, +",
        shortcut_next_quarter: "次のクォーターへ",
        game_clock_label: "ゲームクロック",
        shot_clock_label: "ショットクロック",
        fullscreen: "全画面",
        exit_fullscreen: "全画面解除",
        standalone_mode: "単独モード",
        team_label_pattern: "%{label}",
        matchup_pattern: "%{home} vs %{away}",
        member_name_unknown: "名前なし",
        toggle_possession: "↔️ 攻撃方向切替",
        save_and_pause: "💾 保存して中断",
        confirm_save_and_pause: "現在の試合状況を保存して中断しますか?",
        alert_save_and_pause_success: "試合状況が保存されました。いつでも再開できます。",
        alert_save_and_pause_error: "保存中にエラーが発生しました。"
      },
      en: {
        team_word: "Team",
        roster_empty: "No roster",
        roster_label: "Roster",
        quarter_table_need_teams: "At least two teams are required to show the score table.",
        quarter_table_matchup: "Matchup",
        quarter_table_final: "Final",
        main_start: "Start",
        main_stop: "Stop",
        announcements_on: "🔊 Announcements ON",
        announcements_off: "🔇 Announcements OFF",
        quarter_reset_on: "Quarter Reset ON",
        quarter_reset_off: "Quarter Reset OFF",
        progression_sequential: "By Game",
        progression_round_robin: "By Quarter",
        finish_current_game: "🏁 End Current Game",
        finish_match: "🏁 End Match",
        add_game_enabled: "+ Add Game (%{current}/%{max})",
        add_game_completed: "Game Slots Full (%{max}/%{max})",
        next_quarter: "Next Quarter",
        prev_quarter: "Prev Quarter",
        score_finalize: "Finalize Score",
        saved_complete: "Saved",
        shortcuts_hide: "⌨️ Hide Details",
        shortcuts_show: "⌨️ Show Details",
        possession_left: "Left",
        possession_right: "Right",
        possession_toggle: "Toggle Possession",
        confirm_reset_all: "Reset all scores and timers?",
        confirm_reset_timer: "Reset the timer?",
        confirm_reset_score: "Reset the score?",
        connection_lost: "Connection Lost",
        reconnecting: "Reconnecting...",
        timeout_label: "Timeout",
        alert_club_not_found: "Club information was not found.",
        alert_add_game_failed: "Failed to add game.",
        alert_add_game_error: "An error occurred while adding the game.",
        alert_score_save_failed: "Failed to save score: %{error}",
        alert_unknown_error: "Unknown error",
        alert_finish_current_game: "Current game ended!\nFinal score: %{team1} %{score1} : %{score2} %{team2}\nMoving to the next game.",
        alert_finish_match: "Match ended!\nFinal score: %{team1} %{score1} : %{score2} %{team2}\nResult: %{result}",
        alert_score_save_error: "An error occurred while saving score.",
        confirm_finish_current_game: "End the current game, save the score, and move to the next game?",
        confirm_finish_match: "End the match and save the current score?",
        confirm_new_game_reset: "All game score data will be reset. Continue?",
        voice_score_pattern: "%{home} to %{away}",
        voice_countdown_pattern: "%{count}",
        control_panel_prefix: "Control",
        control_panel_highlight: "Panel",
        control_connected: "Connected",
        open_display: "Open Display",
        live: "Live",
        game_timer: "Game Timer",
        reset: "Reset",
        shot_clock_title: "Shot Clock",
        foul: "Foul",
        buzzer_label: "🔔 Buzzer",
        reset_all: "🔄 Reset All",
        swap_scores: "🔄 Swap Scores",
        match_reset: "Reset Match",
        view_cumulative: "Cumulative",
        view_per_quarter: "Per Quarter",
        drag: "↕ Drag",
        drag_matchup_aria: "Reorder matchups",
        shortcuts_title: "Keyboard Shortcuts",
        drag_shortcuts_aria: "Reorder shortcuts",
        shortcut_game_clock_toggle: "Game clock start / stop",
        shortcut_shot_reset: "Shot clock reset (14s / 24s)",
        shortcut_shot_toggle: "Shot clock stop / start",
        shortcut_announcements_toggle: "B: announcements ON / V: announcements OFF",
        shortcut_buzzer: "Trigger buzzer",
        shortcut_left_score_add: "Left team score (+1, +2, +3)",
        shortcut_right_score_add: "Right team score (+1, +2, +3)",
        shortcut_score_subtract: "5: right team -1 / 6: left team -1",
        shortcut_fouls: "A/S: right fouls -, + · K/L: left fouls -, +",
        shortcut_next_quarter: "Go to next quarter",
        game_clock_label: "Game Clock",
        shot_clock_label: "Shot Clock",
        fullscreen: "Fullscreen",
        exit_fullscreen: "Exit Full",
        standalone_mode: "Standalone Mode",
        team_label_pattern: "%{label}",
        matchup_pattern: "%{home} vs %{away}",
        member_name_unknown: "Unknown",
        toggle_possession: "↔️ Toggle Possession",
        save_and_pause: "💾 Save & Pause",
        confirm_save_and_pause: "Save current game status and pause?",
        alert_save_and_pause_success: "Game status saved. You can resume anytime.",
        alert_save_and_pause_error: "Error occurred while saving."
      },
      zh: {
        team_word: "队",
        roster_empty: "无名单",
        roster_label: "名单",
        quarter_table_need_teams: "至少需要两支队伍才能显示记分表。",
        quarter_table_matchup: "对阵",
        quarter_table_final: "最终",
        main_start: "开始",
        main_stop: "停止",
        announcements_on: "🔊 语音提示 开",
        announcements_off: "🔇 语音提示 关",
        quarter_reset_on: "每节重置 开",
        quarter_reset_off: "每节重置 关",
        progression_sequential: "按比赛进行",
        progression_round_robin: "按节进行",
        finish_current_game: "🏁 结束当前比赛",
        finish_match: "🏁 结束比赛",
        add_game_enabled: "+ 添加比赛 (%{current}/%{max})",
        add_game_completed: "比赛已满 (%{max}/%{max})",
        next_quarter: "下一节",
        prev_quarter: "上一节",
        score_finalize: "确认比分",
        saved_complete: "已保存",
        shortcuts_hide: "⌨️ 隐藏详情",
        shortcuts_show: "⌨️ 显示详情",
        possession_left: "左",
        possession_right: "右",
        possession_toggle: "切换球权",
        confirm_reset_all: "确定重置所有比分和时间吗？",
        confirm_reset_timer: "确定重置计时器吗？",
        confirm_reset_score: "确定重置比分吗？",
        connection_lost: "连接断开",
        reconnecting: "重新连接中...",
        timeout_label: "暂停",
        alert_club_not_found: "未找到俱乐部信息。",
        alert_add_game_failed: "添加比赛失败。",
        alert_add_game_error: "添加比赛时发生错误。",
        alert_score_save_failed: "保存比分失败: %{error}",
        alert_unknown_error: "未知错误",
        alert_finish_current_game: "当前比赛结束！\n最终比分: %{team1} %{score1} : %{score2} %{team2}\n即将进入下一场比赛。",
        alert_finish_match: "比赛结束！\n最终比分: %{team1} %{score1} : %{score2} %{team2}\n结果: %{result}",
        alert_score_save_error: "保存比分时发生错误。",
        confirm_finish_current_game: "结束当前比赛并保存比分后进入下一场吗？",
        confirm_finish_match: "结束比赛并保存当前比分吗？",
        confirm_new_game_reset: "所有比赛比分数据将被重置。是否继续？",
        voice_score_pattern: "%{home} 比 %{away}",
        voice_countdown_pattern: "%{count}",
        control_panel_prefix: "控制",
        control_panel_highlight: "面板",
        control_connected: "已连接",
        open_display: "打开显示屏",
        live: "实时",
        game_timer: "比赛计时器",
        reset: "重置",
        shot_clock_title: "进攻计时",
        foul: "犯规",
        buzzer_label: "🔔 蜂鸣器",
        reset_all: "🔄 全部重置",
        swap_scores: "🔄 对调比分",
        match_reset: "比赛重置",
        view_cumulative: "累计",
        view_per_quarter: "按节",
        drag: "↕ 拖动",
        drag_matchup_aria: "调整对阵顺序",
        shortcuts_title: "键盘快捷键",
        drag_shortcuts_aria: "调整快捷键顺序",
        shortcut_game_clock_toggle: "比赛时间 开始 / 停止",
        shortcut_shot_reset: "进攻计时重置 (14秒 / 24秒)",
        shortcut_shot_toggle: "进攻计时 停止 / 开始",
        shortcut_announcements_toggle: "B: 提示开 / V: 提示关",
        shortcut_buzzer: "鸣响蜂鸣器",
        shortcut_left_score_add: "左侧队伍得分 (+1, +2, +3)",
        shortcut_right_score_add: "右侧队伍得分 (+1, +2, +3)",
        shortcut_score_subtract: "5: 右侧队伍 -1 / 6: 左侧队伍 -1",
        shortcut_fouls: "A/S: 右侧犯规 -, + · K/L: 左侧犯规 -, +",
        shortcut_next_quarter: "进入下一节",
        game_clock_label: "比赛时钟",
        shot_clock_label: "进攻计时",
        fullscreen: "全屏",
        exit_fullscreen: "退出全屏",
        standalone_mode: "独立模式",
        team_label_pattern: "%{label}",
        matchup_pattern: "%{home} vs %{away}",
        member_name_unknown: "未知姓名",
        toggle_possession: "↔️ 切换进攻方向",
        save_and_pause: "💾 保存并暂停",
        confirm_save_and_pause: "保存当前比赛状态并暂停吗?",
        alert_save_and_pause_success: "比赛状态已保存。您可以随时继续。",
        alert_save_and_pause_error: "保存时发生错误。"
      },
      fr: {
        team_word: "Équipe",
        roster_empty: "Aucun effectif",
        roster_label: "Effectif",
        quarter_table_need_teams: "Au moins deux équipes sont nécessaires pour afficher le tableau des scores.",
        quarter_table_matchup: "Affiche",
        quarter_table_final: "Final",
        main_start: "Démarrer",
        main_stop: "Arrêter",
        announcements_on: "🔊 Annonces ON",
        announcements_off: "🔇 Annonces OFF",
        quarter_reset_on: "Réinit. par quart ON",
        quarter_reset_off: "Réinit. par quart OFF",
        progression_sequential: "Par match",
        progression_round_robin: "Par quart",
        finish_current_game: "🏁 Terminer le match en cours",
        finish_match: "🏁 Terminer le match",
        add_game_enabled: "+ Ajouter un match (%{current}/%{max})",
        add_game_completed: "Ajout terminé (%{max}/%{max})",
        next_quarter: "Quart suivant",
        prev_quarter: "Quart précédent",
        score_finalize: "Valider le score",
        saved_complete: "Enregistré",
        shortcuts_hide: "⌨️ Masquer les détails",
        shortcuts_show: "⌨️ Afficher les détails",
        possession_left: "Gauche",
        possession_right: "Droite",
        possession_toggle: "Changer possession",
        confirm_reset_all: "Réinitialiser tous les scores et chronos ?",
        confirm_reset_timer: "Réinitialiser le chrono ?",
        confirm_reset_score: "Réinitialiser le score ?",
        connection_lost: "Connexion perdue",
        reconnecting: "Reconnexion...",
        timeout_label: "Temps mort",
        alert_club_not_found: "Informations du club introuvables.",
        alert_add_game_failed: "Échec de l'ajout du match.",
        alert_add_game_error: "Une erreur est survenue pendant l'ajout du match.",
        alert_score_save_failed: "Échec de l'enregistrement du score : %{error}",
        alert_unknown_error: "Erreur inconnue",
        alert_finish_current_game: "Match en cours terminé !\nScore final : %{team1} %{score1} : %{score2} %{team2}\nPassage au match suivant.",
        alert_finish_match: "Match terminé !\nScore final : %{team1} %{score1} : %{score2} %{team2}\nRésultat : %{result}",
        alert_score_save_error: "Une erreur est survenue lors de l'enregistrement du score.",
        confirm_finish_current_game: "Terminer le match en cours, enregistrer le score et passer au suivant ?",
        confirm_finish_match: "Terminer le match et enregistrer le score actuel ?",
        confirm_new_game_reset: "Toutes les données de score seront réinitialisées. Continuer ?",
        voice_score_pattern: "%{home} à %{away}",
        voice_countdown_pattern: "%{count}",
        control_panel_prefix: "Panneau",
        control_panel_highlight: "de contrôle",
        control_connected: "Connecté",
        open_display: "Ouvrir l'affichage",
        live: "En direct",
        game_timer: "Chronomètre du match",
        reset: "Réinitialiser",
        shot_clock_title: "Chrono tir",
        foul: "Faute",
        buzzer_label: "🔔 Buzzer",
        reset_all: "🔄 Réinit. totale",
        swap_scores: "🔄 Inverser score",
        match_reset: "Réinit. match",
        view_cumulative: "Cumulé",
        view_per_quarter: "Par quart",
        drag: "↕ Glisser",
        drag_matchup_aria: "Réordonner les affiches",
        shortcuts_title: "Raccourcis clavier",
        drag_shortcuts_aria: "Réordonner les raccourcis",
        shortcut_game_clock_toggle: "Chrono match démarrer / arrêter",
        shortcut_shot_reset: "Chrono tir réinit. (14s / 24s)",
        shortcut_shot_toggle: "Chrono tir arrêter / démarrer",
        shortcut_announcements_toggle: "B : annonces ON / V : annonces OFF",
        shortcut_buzzer: "Déclencher le buzzer",
        shortcut_left_score_add: "Score équipe gauche (+1, +2, +3)",
        shortcut_right_score_add: "Score équipe droite (+1, +2, +3)",
        shortcut_score_subtract: "5 : équipe droite -1 / 6 : équipe gauche -1",
        shortcut_fouls: "A/S : fautes droite -, + · K/L : fautes gauche -, +",
        shortcut_next_quarter: "Passer au quart suivant",
        game_clock_label: "Horloge de match",
        shot_clock_label: "Chrono tir",
        fullscreen: "Plein écran",
        exit_fullscreen: "Quitter",
        standalone_mode: "Mode autonome",
        team_label_pattern: "%{label}",
        matchup_pattern: "%{home} vs %{away}",
        member_name_unknown: "Sans nom",
        toggle_possession: "↔️ Changer possession",
        save_and_pause: "💾 Sauv. et pause",
        confirm_save_and_pause: "Sauvegarder l'état actuel et mettre en pause ?",
        alert_save_and_pause_success: "État du match sauvegardé. Vous pouvez reprendre à tout moment.",
        alert_save_and_pause_error: "Erreur lors de la sauvegarde."
      },
      es: {
        team_word: "Equipo",
        roster_empty: "Sin plantilla",
        roster_label: "Plantilla",
        quarter_table_need_teams: "Se requieren al menos dos equipos para mostrar la tabla de puntuación.",
        quarter_table_matchup: "Enfrentamiento",
        quarter_table_final: "Final",
        main_start: "Iniciar",
        main_stop: "Detener",
        announcements_on: "🔊 Avisos ON",
        announcements_off: "🔇 Avisos OFF",
        quarter_reset_on: "Reinicio por cuarto ON",
        quarter_reset_off: "Reinicio por cuarto OFF",
        progression_sequential: "Por partido",
        progression_round_robin: "Por cuarto",
        finish_current_game: "🏁 Finalizar juego actual",
        finish_match: "🏁 Finalizar partido",
        add_game_enabled: "+ Agregar juego (%{current}/%{max})",
        add_game_completed: "Juegos completos (%{max}/%{max})",
        next_quarter: "Siguiente cuarto",
        prev_quarter: "Cuarto anterior",
        score_finalize: "Confirmar marcador",
        saved_complete: "Guardado",
        shortcuts_hide: "⌨️ Ocultar detalles",
        shortcuts_show: "⌨️ Mostrar detalles",
        possession_left: "Izquierda",
        possession_right: "Derecha",
        possession_toggle: "Cambiar posesión",
        confirm_reset_all: "¿Restablecer todos los marcadores y tiempos?",
        confirm_reset_timer: "¿Restablecer el cronómetro?",
        confirm_reset_score: "¿Restablecer el marcador?",
        connection_lost: "Conexión perdida",
        reconnecting: "Reconectando...",
        timeout_label: "Tiempo muerto",
        alert_club_not_found: "No se encontró la información del club.",
        alert_add_game_failed: "No se pudo agregar el juego.",
        alert_add_game_error: "Se produjo un error al agregar el juego.",
        alert_score_save_failed: "Error al guardar marcador: %{error}",
        alert_unknown_error: "Error desconocido",
        alert_finish_current_game: "¡Juego actual finalizado!\nMarcador final: %{team1} %{score1} : %{score2} %{team2}\nMoviendo al siguiente juego.",
        alert_finish_match: "¡Partido finalizado!\nMarcador final: %{team1} %{score1} : %{score2} %{team2}\nResultado: %{result}",
        alert_score_save_error: "Se produjo un error al guardar el marcador.",
        confirm_finish_current_game: "¿Finalizar el juego actual, guardar marcador y pasar al siguiente?",
        confirm_finish_match: "¿Finalizar el partido y guardar el marcador actual?",
        confirm_new_game_reset: "Se restablecerán todos los datos de puntuación. ¿Continuar?",
        voice_score_pattern: "%{home} a %{away}",
        voice_countdown_pattern: "%{count}",
        control_panel_prefix: "Panel",
        control_panel_highlight: "de control",
        control_connected: "Conectado",
        open_display: "Abrir pantalla",
        live: "En vivo",
        game_timer: "Reloj del partido",
        reset: "Reiniciar",
        shot_clock_title: "Reloj de tiro",
        foul: "Falta",
        buzzer_label: "🔔 Zumbador",
        reset_all: "🔄 Reiniciar todo",
        swap_scores: "🔄 Intercambiar marcador",
        match_reset: "Reiniciar partido",
        view_cumulative: "Acumulado",
        view_per_quarter: "Por cuarto",
        drag: "↕ Arrastrar",
        drag_matchup_aria: "Reordenar enfrentamientos",
        shortcuts_title: "Atajos de teclado",
        drag_shortcuts_aria: "Reordenar atajos",
        shortcut_game_clock_toggle: "Reloj del partido iniciar / detener",
        shortcut_shot_reset: "Reloj de tiro reiniciar (14s / 24s)",
        shortcut_shot_toggle: "Reloj de tiro detener / iniciar",
        shortcut_announcements_toggle: "B: avisos ON / V: avisos OFF",
        shortcut_buzzer: "Activar zumbador",
        shortcut_left_score_add: "Puntos equipo izquierdo (+1, +2, +3)",
        shortcut_right_score_add: "Puntos equipo derecho (+1, +2, +3)",
        shortcut_score_subtract: "5: equipo derecho -1 / 6: equipo izquierdo -1",
        shortcut_fouls: "A/S: faltas derecha -, + · K/L: faltas izquierda -, +",
        shortcut_next_quarter: "Ir al siguiente cuarto",
        game_clock_label: "Reloj de juego",
        shot_clock_label: "Reloj de tiro",
        fullscreen: "Pantalla completa",
        exit_fullscreen: "Salir",
        standalone_mode: "Modo independiente",
        team_label_pattern: "%{label}",
        matchup_pattern: "%{home} vs %{away}",
        member_name_unknown: "Sin nombre",
        toggle_possession: "↔️ Cambiar posesión",
        save_and_pause: "💾 Guardar y pausar",
        confirm_save_and_pause: "¿Guardar el estado actual del juego y pausar?",
        alert_save_and_pause_success: "Estado del juego guardado. Puede reanudar en cualquier momento.",
        alert_save_and_pause_error: "Error al guardar."
      },
      it: {
        team_word: "Squadra",
        roster_empty: "Nessun roster",
        roster_label: "Roster",
        quarter_table_need_teams: "Sono necessarie almeno due squadre per mostrare il tabellone.",
        quarter_table_matchup: "Sfida",
        quarter_table_final: "Finale",
        main_start: "Avvia",
        main_stop: "Ferma",
        announcements_on: "🔊 Avvisi ON",
        announcements_off: "🔇 Avvisi OFF",
        quarter_reset_on: "Reset per quarto ON",
        quarter_reset_off: "Reset per quarto OFF",
        progression_sequential: "Per partita",
        progression_round_robin: "Per quarto",
        finish_current_game: "🏁 Termina partita corrente",
        finish_match: "🏁 Termina partita",
        add_game_enabled: "+ Aggiungi partita (%{current}/%{max})",
        add_game_completed: "Partite complete (%{max}/%{max})",
        next_quarter: "Quarto successivo",
        prev_quarter: "Quarto precedente",
        score_finalize: "Conferma punteggio",
        saved_complete: "Salvato",
        shortcuts_hide: "⌨️ Nascondi dettagli",
        shortcuts_show: "⌨️ Mostra dettagli",
        possession_left: "Sinistra",
        possession_right: "Destra",
        possession_toggle: "Cambia possesso",
        confirm_reset_all: "Reimpostare tutti i punteggi e i timer?",
        confirm_reset_timer: "Reimpostare il timer?",
        confirm_reset_score: "Reimpostare il punteggio?",
        connection_lost: "Connessione persa",
        reconnecting: "Riconnessione...",
        timeout_label: "Time-out",
        alert_club_not_found: "Informazioni club non trovate.",
        alert_add_game_failed: "Aggiunta partita non riuscita.",
        alert_add_game_error: "Si è verificato un errore durante l'aggiunta della partita.",
        alert_score_save_failed: "Salvataggio punteggio non riuscito: %{error}",
        alert_unknown_error: "Errore sconosciuto",
        alert_finish_current_game: "Partita corrente terminata!\nPunteggio finale: %{team1} %{score1} : %{score2} %{team2}\nPassaggio alla partita successiva.",
        alert_finish_match: "Partita terminata!\nPunteggio finale: %{team1} %{score1} : %{score2} %{team2}\nRisultato: %{result}",
        alert_score_save_error: "Si è verificato un errore durante il salvataggio del punteggio.",
        confirm_finish_current_game: "Terminare la partita corrente, salvare il punteggio e passare alla successiva?",
        confirm_finish_match: "Terminare la partita e salvare il punteggio attuale?",
        confirm_new_game_reset: "Tutti i dati punteggio verranno reimpostati. Continuare?",
        voice_score_pattern: "%{home} a %{away}",
        voice_countdown_pattern: "%{count}",
        control_panel_prefix: "Pannello",
        control_panel_highlight: "di controllo",
        control_connected: "Connesso",
        open_display: "Apri display",
        live: "Live",
        game_timer: "Timer partita",
        reset: "Reset",
        shot_clock_title: "Crono tiro",
        foul: "Fallo",
        buzzer_label: "🔔 Buzzer",
        reset_all: "🔄 Reset totale",
        swap_scores: "🔄 Scambia punteggi",
        match_reset: "Reset partita",
        view_cumulative: "Cumulato",
        view_per_quarter: "Per quarto",
        drag: "↕ Trascina",
        drag_matchup_aria: "Riordina sfide",
        shortcuts_title: "Scorciatoie tastiera",
        drag_shortcuts_aria: "Riordina scorciatoie",
        shortcut_game_clock_toggle: "Timer partita avvia / ferma",
        shortcut_shot_reset: "Crono tiro reset (14s / 24s)",
        shortcut_shot_toggle: "Crono tiro ferma / avvia",
        shortcut_announcements_toggle: "B: avvisi ON / V: avvisi OFF",
        shortcut_buzzer: "Attiva buzzer",
        shortcut_left_score_add: "Punti squadra sinistra (+1, +2, +3)",
        shortcut_right_score_add: "Punti squadra destra (+1, +2, +3)",
        shortcut_score_subtract: "5: squadra destra -1 / 6: squadra sinistra -1",
        shortcut_fouls: "A/S: falli destra -, + · K/L: falli sinistra -, +",
        shortcut_next_quarter: "Vai al quarto successivo",
        game_clock_label: "Cronometro gara",
        shot_clock_label: "Crono tiro",
        fullscreen: "Schermo intero",
        exit_fullscreen: "Esci",
        standalone_mode: "Modalità standalone",
        team_label_pattern: "%{label}",
        matchup_pattern: "%{home} vs %{away}",
        member_name_unknown: "Senza nome",
        toggle_possession: "↔️ Cambia possesso",
        save_and_pause: "💾 Salva e pausa",
        confirm_save_and_pause: "Salvare lo stato attuale della partita e mettere in pausa?",
        alert_save_and_pause_success: "Stato della partita salvato. Puoi riprendere in qualsiasi momento.",
        alert_save_and_pause_error: "Errore durante il salvataggio."
      }
    };
    const baseEnglishMessages = UI_MESSAGES.en;
    UI_MESSAGES.pt = {
      ...baseEnglishMessages,
      team_word: "Equipe",
      roster_empty: "Sem elenco",
      roster_label: "Elenco",
      quarter_table_need_teams: "São necessárias pelo menos duas equipes para exibir a tabela de pontuação.",
      quarter_table_matchup: "Confronto",
      quarter_table_final: "Final",
      main_start: "Iniciar",
      main_stop: "Parar",
      announcements_on: "🔊 Avisos ON",
      announcements_off: "🔇 Avisos OFF",
      quarter_reset_on: "Reset por quarto ON",
      quarter_reset_off: "Reset por quarto OFF",
      progression_sequential: "Por jogo",
      progression_round_robin: "Por quarto",
      finish_current_game: "🏁 Encerrar jogo atual",
      finish_match: "🏁 Encerrar partida",
      add_game_enabled: "+ Adicionar jogo (%{current}/%{max})",
      add_game_completed: "Jogos completos (%{max}/%{max})",
      next_quarter: "Próximo quarto",
      prev_quarter: "Quarto anterior",
      score_finalize: "Confirmar placar",
      saved_complete: "Salvo",
      shortcuts_hide: "⌨️ Ocultar detalhes",
      shortcuts_show: "⌨️ Mostrar detalhes",
      possession_left: "Esquerda",
      possession_right: "Direita",
      possession_toggle: "Alternar posse",
      confirm_reset_all: "Redefinir todos os placares e cronômetros?",
      confirm_reset_timer: "Redefinir o cronômetro?",
      confirm_reset_score: "Redefinir o placar?",
      connection_lost: "Conexão perdida",
      reconnecting: "Reconectando...",
      timeout_label: "Tempo esgotado",
      alert_club_not_found: "Informações do clube não encontradas.",
      alert_add_game_failed: "Falha ao adicionar jogo.",
      alert_add_game_error: "Ocorreu um erro ao adicionar o jogo.",
      alert_score_save_failed: "Falha ao salvar placar: %{error}",
      alert_unknown_error: "Erro desconhecido",
      alert_finish_current_game: "Jogo atual encerrado!\nPlacar final: %{team1} %{score1} : %{score2} %{team2}\nIndo para o próximo jogo.",
      alert_finish_match: "Partida encerrada!\nPlacar final: %{team1} %{score1} : %{score2} %{team2}\nResultado: %{result}",
      alert_score_save_error: "Ocorreu um erro ao salvar o placar.",
      confirm_finish_current_game: "Encerrar o jogo atual, salvar o placar e ir para o próximo jogo?",
      confirm_finish_match: "Encerrar a partida e salvar o placar atual?",
      confirm_new_game_reset: "Todos os dados de placar serão redefinidos. Continuar?",
      voice_score_pattern: "%{home} a %{away}",
      control_panel_prefix: "Painel",
      control_panel_highlight: "de Controle",
      control_connected: "Conectado",
      open_display: "Abrir Display",
      live: "Ao Vivo",
      game_timer: "Cronômetro do Jogo",
      reset: "Reset",
      shot_clock_title: "Cronômetro de Arremesso",
      foul: "Falta",
      buzzer_label: "🔔 Buzina",
      reset_all: "🔄 Resetar Tudo",
      swap_scores: "🔄 Trocar Placar",
      match_reset: "Resetar Partida",
      view_cumulative: "Acumulado",
      view_per_quarter: "Por Quarto",
      drag: "↕ Arrastar",
      drag_matchup_aria: "Reordenar confrontos",
      shortcuts_title: "Atalhos de Teclado",
      drag_shortcuts_aria: "Reordenar atalhos",
      shortcut_game_clock_toggle: "Cronômetro do jogo iniciar / parar",
      shortcut_shot_reset: "Cronômetro de arremesso reset (14s / 24s)",
      shortcut_shot_toggle: "Cronômetro de arremesso parar / iniciar",
      shortcut_announcements_toggle: "B: avisos ON / V: avisos OFF",
      shortcut_buzzer: "Tocar buzina",
      shortcut_left_score_add: "Pontuação equipe esquerda (+1, +2, +3)",
      shortcut_right_score_add: "Pontuação equipe direita (+1, +2, +3)",
      shortcut_score_subtract: "5: equipe direita -1 / 6: equipe esquerda -1",
      shortcut_fouls: "A/S: faltas direita -, + · K/L: faltas esquerda -, +",
      shortcut_next_quarter: "Ir para o próximo quarto",
      game_clock_label: "Relógio de Jogo",
      shot_clock_label: "Cronômetro de Arremesso",
      fullscreen: "Tela Cheia",
      exit_fullscreen: "Sair",
      standalone_mode: "Modo Independente",
      team_label_pattern: "%{label}",
      matchup_pattern: "%{home} vs %{away}",
      member_name_unknown: "Sem nome",
      toggle_possession: "↔️ Alternar posse",
      save_and_pause: "💾 Salvar e pausar",
      confirm_save_and_pause: "Salvar o estado atual do jogo e pausar?",
      alert_save_and_pause_success: "Estado do jogo salvo. Você pode retomar a qualquer momento.",
      alert_save_and_pause_error: "Erro ao salvar."
    };
    UI_MESSAGES.tl = {
      ...baseEnglishMessages,
      team_word: "Koponan",
      roster_empty: "Walang roster",
      roster_label: "Roster",
      quarter_table_need_teams: "Kailangan ng hindi bababa sa dalawang koponan para maipakita ang score table.",
      quarter_table_matchup: "Matchup",
      quarter_table_final: "Final",
      main_start: "Simulan",
      main_stop: "Ihinto",
      announcements_on: "🔊 Anunsyo ON",
      announcements_off: "🔇 Anunsyo OFF",
      quarter_reset_on: "Quarter Reset ON",
      quarter_reset_off: "Quarter Reset OFF",
      progression_sequential: "Per Game",
      progression_round_robin: "Per Quarter",
      finish_current_game: "🏁 Tapusin ang kasalukuyang laro",
      finish_match: "🏁 Tapusin ang laban",
      add_game_enabled: "+ Magdagdag ng laro (%{current}/%{max})",
      add_game_completed: "Puno na ang laro (%{max}/%{max})",
      next_quarter: "Susunod na quarter",
      prev_quarter: "Nakaraang quarter",
      score_finalize: "I-finalize ang score",
      saved_complete: "Na-save",
      shortcuts_hide: "⌨️ Itago ang detalye",
      shortcuts_show: "⌨️ Ipakita ang detalye",
      possession_left: "Kaliwa",
      possession_right: "Kanan",
      possession_toggle: "Palitan ang possession",
      confirm_reset_all: "I-reset ang lahat ng score at timer?",
      confirm_reset_timer: "I-reset ang timer?",
      confirm_reset_score: "I-reset ang score?",
      connection_lost: "Nawala ang koneksyon",
      reconnecting: "Nagkokonekta muli...",
      timeout_label: "Timeout",
      alert_club_not_found: "Hindi makita ang impormasyon ng club.",
      alert_add_game_failed: "Nabigo ang pagdagdag ng laro.",
      alert_add_game_error: "Nagkaroon ng error habang nagdadagdag ng laro.",
      alert_score_save_failed: "Nabigo ang pag-save ng score: %{error}",
      alert_unknown_error: "Hindi kilalang error",
      alert_finish_current_game: "Natapos ang kasalukuyang laro!\nFinal score: %{team1} %{score1} : %{score2} %{team2}\nLilipat sa susunod na laro.",
      alert_finish_match: "Natapos ang laban!\nFinal score: %{team1} %{score1} : %{score2} %{team2}\nResulta: %{result}",
      alert_score_save_error: "Nagkaroon ng error habang sine-save ang score.",
      confirm_finish_current_game: "Tapusin ang kasalukuyang laro, i-save ang score, at lumipat sa susunod na laro?",
      confirm_finish_match: "Tapusin ang laban at i-save ang kasalukuyang score?",
      confirm_new_game_reset: "Mare-reset ang lahat ng game score data. Magpatuloy?",
      voice_score_pattern: "%{home} laban sa %{away}",
      control_panel_prefix: "Control",
      control_panel_highlight: "Panel",
      control_connected: "Nakakonekta",
      open_display: "Buksan ang Display",
      live: "Live",
      game_timer: "Game Timer",
      reset: "I-reset",
      shot_clock_title: "Shot Clock",
      foul: "Foul",
      buzzer_label: "🔔 Buzzer",
      reset_all: "🔄 I-reset Lahat",
      swap_scores: "🔄 Pagpalitin ang Score",
      match_reset: "I-reset ang Laban",
      view_cumulative: "Cumulative",
      view_per_quarter: "Per Quarter",
      drag: "↕ I-drag",
      drag_matchup_aria: "Ayusin ang matchup order",
      shortcuts_title: "Keyboard Shortcuts",
      drag_shortcuts_aria: "Ayusin ang shortcut order",
      shortcut_game_clock_toggle: "Game clock start / stop",
      shortcut_shot_reset: "Shot clock reset (14s / 24s)",
      shortcut_shot_toggle: "Shot clock stop / start",
      shortcut_announcements_toggle: "B: anunsyo ON / V: anunsyo OFF",
      shortcut_buzzer: "Patunugin ang buzzer",
      shortcut_left_score_add: "Score ng kaliwang koponan (+1, +2, +3)",
      shortcut_right_score_add: "Score ng kanang koponan (+1, +2, +3)",
      shortcut_score_subtract: "5: kanang koponan -1 / 6: kaliwang koponan -1",
      shortcut_fouls: "A/S: fouls kanan -, + · K/L: fouls kaliwa -, +",
      shortcut_next_quarter: "Pumunta sa susunod na quarter",
      game_clock_label: "Game Clock",
      shot_clock_label: "Shot Clock",
      fullscreen: "Fullscreen",
      exit_fullscreen: "Exit Full",
      standalone_mode: "Standalone Mode",
      team_label_pattern: "%{label}",
      matchup_pattern: "%{home} vs %{away}",
      member_name_unknown: "Walang pangalan",
      toggle_possession: "↔️ Palitan ang possession",
      save_and_pause: "💾 I-save at i-pause",
      confirm_save_and_pause: "I-save ang kasalukuyang estado ng laro at i-pause?",
      alert_save_and_pause_success: "Na-save ang estado ng laro. Maaaring magpatuloy anumang oras.",
      alert_save_and_pause_error: "May error habang sine-save."
    };
    UI_MESSAGES.de = {
      ...baseEnglishMessages,
      team_word: "Team",
      roster_empty: "Kein Kader",
      roster_label: "Kader",
      quarter_table_need_teams: "Mindestens zwei Teams sind erforderlich, um die Punktetabelle anzuzeigen.",
      quarter_table_matchup: "Matchup",
      quarter_table_final: "Endstand",
      main_start: "Start",
      main_stop: "Stopp",
      announcements_on: "🔊 Ansagen AN",
      announcements_off: "🔇 Ansagen AUS",
      quarter_reset_on: "Viertel-Reset AN",
      quarter_reset_off: "Viertel-Reset AUS",
      progression_sequential: "Pro Spiel",
      progression_round_robin: "Pro Viertel",
      finish_current_game: "🏁 Aktuelles Spiel beenden",
      finish_match: "🏁 Spiel beenden",
      add_game_enabled: "+ Spiel hinzufügen (%{current}/%{max})",
      add_game_completed: "Spiele voll (%{max}/%{max})",
      next_quarter: "Nächstes Viertel",
      prev_quarter: "Vorheriges Viertel",
      score_finalize: "Punktestand festlegen",
      saved_complete: "Gespeichert",
      shortcuts_hide: "⌨️ Details ausblenden",
      shortcuts_show: "⌨️ Details anzeigen",
      possession_left: "Links",
      possession_right: "Rechts",
      possession_toggle: "Ballbesitz wechseln",
      confirm_reset_all: "Alle Punktestände und Timer zurücksetzen?",
      confirm_reset_timer: "Timer zurücksetzen?",
      confirm_reset_score: "Punktestand zurücksetzen?",
      connection_lost: "Verbindung verloren",
      reconnecting: "Verbindung wird wiederhergestellt...",
      timeout_label: "Auszeit",
      alert_club_not_found: "Club-Informationen wurden nicht gefunden.",
      alert_add_game_failed: "Spiel konnte nicht hinzugefügt werden.",
      alert_add_game_error: "Beim Hinzufügen des Spiels ist ein Fehler aufgetreten.",
      alert_score_save_failed: "Speichern des Punktestands fehlgeschlagen: %{error}",
      alert_unknown_error: "Unbekannter Fehler",
      alert_finish_current_game: "Aktuelles Spiel beendet!\nEndstand: %{team1} %{score1} : %{score2} %{team2}\nWechsel zum nächsten Spiel.",
      alert_finish_match: "Spiel beendet!\nEndstand: %{team1} %{score1} : %{score2} %{team2}\nErgebnis: %{result}",
      alert_score_save_error: "Beim Speichern des Punktestands ist ein Fehler aufgetreten.",
      confirm_finish_current_game: "Aktuelles Spiel beenden, Punktestand speichern und zum nächsten Spiel wechseln?",
      confirm_finish_match: "Spiel beenden und aktuellen Punktestand speichern?",
      confirm_new_game_reset: "Alle Spielstandsdaten werden zurückgesetzt. Fortfahren?",
      voice_score_pattern: "%{home} zu %{away}",
      control_panel_prefix: "Kontroll",
      control_panel_highlight: "panel",
      control_connected: "Verbunden",
      open_display: "Anzeige öffnen",
      live: "Live",
      game_timer: "Spiel-Timer",
      reset: "Zurücksetzen",
      shot_clock_title: "Wurfuhr",
      foul: "Foul",
      buzzer_label: "🔔 Buzzer",
      reset_all: "🔄 Alles zurücksetzen",
      swap_scores: "🔄 Punktestand tauschen",
      match_reset: "Spiel zurücksetzen",
      view_cumulative: "Kumuliert",
      view_per_quarter: "Pro Viertel",
      drag: "↕ Ziehen",
      drag_matchup_aria: "Matchups neu anordnen",
      shortcuts_title: "Tastaturkürzel",
      drag_shortcuts_aria: "Kürzel neu anordnen",
      shortcut_game_clock_toggle: "Spieluhr Start / Stopp",
      shortcut_shot_reset: "Wurfuhr zurücksetzen (14s / 24s)",
      shortcut_shot_toggle: "Wurfuhr Stopp / Start",
      shortcut_announcements_toggle: "B: Ansagen AN / V: Ansagen AUS",
      shortcut_buzzer: "Buzzer auslösen",
      shortcut_left_score_add: "Punkte linkes Team (+1, +2, +3)",
      shortcut_right_score_add: "Punkte rechtes Team (+1, +2, +3)",
      shortcut_score_subtract: "5: rechtes Team -1 / 6: linkes Team -1",
      shortcut_fouls: "A/S: Fouls rechts -, + · K/L: Fouls links -, +",
      shortcut_next_quarter: "Zum nächsten Viertel wechseln",
      game_clock_label: "Spieluhr",
      shot_clock_label: "Wurfuhr",
      fullscreen: "Vollbild",
      exit_fullscreen: "Beenden",
      standalone_mode: "Standalone-Modus",
      team_label_pattern: "%{label}",
      matchup_pattern: "%{home} vs %{away}",
      member_name_unknown: "Unbekannt",
      toggle_possession: "↔️ Ballbesitz wechseln",
      save_and_pause: "💾 Speichern & Pause",
      confirm_save_and_pause: "Aktuellen Spielstand speichern und pausieren?",
      alert_save_and_pause_success: "Spielstand gespeichert. Sie können jederzeit fortfahren.",
      alert_save_and_pause_error: "Fehler beim Speichern."
    };
    const i18nForScoreboard = (key, params = {}) => {
      const template = UI_MESSAGES[uiLocale]?.[key] ?? UI_MESSAGES.ko[key] ?? key;
      return String(template).replace(/%\{(\w+)\}/g, (_, token) => {
        const replacement = params[token];
        return replacement === undefined || replacement === null ? "" : String(replacement);
      });
    };
    const applyStaticUiText = () => {
      scoreboardRoot.querySelectorAll("[data-ui-key]").forEach((element) => {
        const key = String(element.dataset.uiKey || "").trim();
        if (!key) return;
        element.textContent = i18nForScoreboard(key);
      });

      scoreboardRoot.querySelectorAll("[data-ui-aria-key]").forEach((element) => {
        const key = String(element.dataset.uiAriaKey || "").trim();
        if (!key) return;
        element.setAttribute("aria-label", i18nForScoreboard(key));
      });

      const clubTitle = scoreboardRoot.querySelector("[data-club-title]");
      if (clubTitle && String(clubTitle.dataset.clubName || "").trim() === "") {
        clubTitle.textContent = i18nForScoreboard("standalone_mode");
      }
    };
    const formatTeamName = (team) => {
      const teamName = String(team?.name || "").trim();
      if (teamName) return teamName;

      const rawLabel = String(team?.label || "").trim();
      const label = rawLabel || "?";
      return i18nForScoreboard("team_label_pattern", { label });
    };
    const formatMatchupText = (homeTeam, awayTeam) => i18nForScoreboard("matchup_pattern", {
      home: formatTeamName(homeTeam),
      away: formatTeamName(awayTeam)
    });
    applyStaticUiText();
    const POSSESSION_SWITCH_PATTERNS = ["fiba", "nba", "club"];
    const defaultPossessionSwitchPattern = POSSESSION_SWITCH_PATTERNS.includes(scoreboardRoot.dataset.possessionSwitchPattern)
      ? scoreboardRoot.dataset.possessionSwitchPattern
      : "fiba";
    const readQuarterScoreViewMode = () => {
      try {
        const raw = window.localStorage.getItem(quarterScoreViewStorageKey);
        return QUARTER_SCORE_VIEW_MODES.includes(raw) ? raw : "cumulative";
      } catch (error) {
        return "cumulative";
      }
    };
    let quarterScoreViewMode = readQuarterScoreViewMode();

    const cableUrl =
      (window.location.protocol === "https:" ? "wss://" : "ws://") +
      window.location.host +
      "/cable";
    let socket = new WebSocket(cableUrl);
    const identifier = JSON.stringify({ channel: "ScoreboardChannel", match_id: matchId });
    let state = null;
    const buildClientId = () => {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
      return `client_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    };
    const localClientId = buildClientId();
    let localStateVersion = 0;
    let mainTimer = null;
    let shotTimer = null;
    let mainLastTickAtMs = null;
    let shotLastTickAtMs = null;
    let matchupSortInstance = null;
    let isMatchupDragging = false;
    let displayAnimFrame = null;
    let wsReconnectDelay = 1000;
    const bcChannel = (typeof BroadcastChannel !== "undefined")
      ? new BroadcastChannel(`scoreboard_${matchId}`)
      : null;

    // Colors
    const COLORS = {
      bg: '#0F0F0F',
      cardBg: '#1A1A1A',
      text: '#FAFAF7',
      textMuted: '#999999',
      border: '#E0E0E0',
      homeAccent: '#C41E3A',
      awayAccent: '#3B82F6',
      homeLogoBg: '#1A1A2E',
      awayLogoBg: '#1A2E1A',
      awayLogoBorder: '#4CAF50',
      shotClock: '#FF9800',
      centerBg: '#0F0F0F',
      displayBg: '#0A0A0A',
      displayCardBg: '#141414',
      displayBorder: '#222222'
    };

    const defaultTeams = () => {
      if (teams.length > 0) return teams;
      const labels = ["A", "B", "C"];
      const colors = [COLORS.homeAccent, COLORS.awayAccent, "#22C55E"];
      return Array.from({ length: teamsCount }, (_, index) => ({
        id: `temp-${index + 1}`,
        label: labels[index] || `T${index + 1}`,
        color: colors[index % colors.length],
      }));
    };

    const regularQuartersForState = (sourceState = state) => parseRegularQuarters(sourceState?.regular_quarters, defaultRegularQuarters);
    const totalRegularQuarters = () => regularQuartersForState(state);

    const formatTime = (seconds) => {
      const totalSeconds = Math.max(0, seconds);
      const min = Math.floor(totalSeconds / 60);

      // Under 1 minute: show SS.s format (seconds with deciseconds)
      if (min < 1 && totalSeconds < 60) {
        const sec = Math.floor(totalSeconds);
        const deciseconds = Math.floor((totalSeconds - sec) * 10);
        return `${sec.toString().padStart(2, "0")}.${deciseconds}`;
      }

      // 1 minute or more: show m:ss format
      const sec = Math.floor(totalSeconds % 60);
      return `${min}:${sec.toString().padStart(2, "0")}`;
    };

    const parseStateVersion = (value, fallback = 0) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.max(0, parsed);
    };

    const parseUpdatedAtMs = (value, fallback = 0) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.max(0, parsed);
    };

    const normalizeSourceClientId = (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (trimmed.length === 0) return null;
      return trimmed.slice(0, 128);
    };

    const parseColorToRgb = (color) => {
      if (!color || typeof color !== "string") return null;
      const value = color.trim().toLowerCase();

      if (value === "white") return { r: 255, g: 255, b: 255 };
      if (value === "black") return { r: 0, g: 0, b: 0 };

      const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        const raw = hex[1];
        const normalized = raw.length === 3
          ? raw.split("").map((ch) => ch + ch).join("")
          : raw;
        return {
          r: parseInt(normalized.slice(0, 2), 16),
          g: parseInt(normalized.slice(2, 4), 16),
          b: parseInt(normalized.slice(4, 6), 16)
        };
      }

      const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgb) {
        return {
          r: Number.parseInt(rgb[1], 10),
          g: Number.parseInt(rgb[2], 10),
          b: Number.parseInt(rgb[3], 10)
        };
      }

      return null;
    };

    const isLightColor = (color) => {
      const rgb = parseColorToRgb(color);
      if (!rgb) return false;
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      return luminance > 0.85;
    };

    const applyTeamIconColor = (iconEl, color) => {
      if (!iconEl) return;
      const iconColor = String(color || "#111827").trim();
      const isExplicitWhite = /^(white|#fff|#ffffff)$/i.test(iconColor);
      const light = isExplicitWhite || isLightColor(iconColor);

      iconEl.textContent = "";
      iconEl.style.backgroundColor = iconColor;
      iconEl.style.borderColor = light ? "#111827" : iconColor;
      iconEl.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.15)";
    };

    const applyTeamHeaderColor = (headerEl, color) => {
      if (!headerEl) return;
      const validColors = ['white', 'black', 'red', 'blue', 'yellow', 'green', 'pink', 'skyblue', 'brown', 'orange'];
      const colorName = String(color || 'white').toLowerCase().trim();
      // Remove all existing team-header-* classes
      validColors.forEach(c => headerEl.classList.remove(`team-header-${c}`));
      // Add the appropriate class
      const safeColor = validColors.includes(colorName) ? colorName : 'white';
      headerEl.classList.add(`team-header-${safeColor}`);
    };

    // 파울 숫자 색상을 팀 배경색에 따라 동적으로 적용
    const applyFoulColor = (foulEl, foulCount, teamColor) => {
      if (!foulEl) return;
      const colorName = String(teamColor || 'white').toLowerCase().trim();
      const isHighFoul = foulCount >= 5;

      // 빨간색 계열 배경 (red, orange, pink, brown)
      const redishBg = ['red', 'orange', 'pink', 'brown'].includes(colorName);
      // 어두운 배경 (black, blue, green, skyblue)
      const darkBg = ['black', 'blue', 'green', 'skyblue'].includes(colorName);
      // 밝은 배경 (white, yellow)
      const lightBg = ['white', 'yellow'].includes(colorName);

      if (isHighFoul) {
        // 파울 5개 이상: 경고색
        if (redishBg) {
          // 빨간 계열 배경에서는 노란색으로 강조
          foulEl.style.color = '#fef08a'; // yellow-200
          foulEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
        } else if (darkBg) {
          // 어두운 배경에서는 밝은 빨간색
          foulEl.style.color = '#fca5a5'; // red-300
          foulEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
        } else {
          // 밝은 배경에서는 진한 빨간색
          foulEl.style.color = '#dc2626'; // red-600
          foulEl.style.textShadow = 'none';
        }
      } else {
        // 파울 5개 미만: 기본 색상 (배경에 맞춰 가시성 확보)
        if (darkBg || redishBg) {
          foulEl.style.color = '#ffffff';
          foulEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
        } else {
          foulEl.style.color = 'inherit';
          foulEl.style.textShadow = 'none';
        }
      }
    };

    // TEAM FOUL 배지 표시 (파울 5개 이상일 때)
    const applyTeamFoulBadge = (badgeEl, foulCount, teamColor) => {
      if (!badgeEl) return;
      const colorName = String(teamColor || 'white').toLowerCase().trim();
      const isHighFoul = foulCount >= 5;

      if (isHighFoul) {
        badgeEl.classList.remove('hidden');
        // 배경색에 따른 대비 색상 설정
        const redishBg = ['red', 'orange', 'pink', 'brown'].includes(colorName);
        const darkBg = ['black', 'blue', 'green', 'skyblue'].includes(colorName);

        if (redishBg) {
          // 빨간 계열 배경: 노란색 배지
          badgeEl.style.backgroundColor = '#fef08a';
          badgeEl.style.color = '#78350f';
        } else if (darkBg) {
          // 어두운 배경: 밝은 빨간색 배지
          badgeEl.style.backgroundColor = '#fca5a5';
          badgeEl.style.color = '#7f1d1d';
        } else {
          // 밝은 배경: 진한 빨간색 배지
          badgeEl.style.backgroundColor = '#dc2626';
          badgeEl.style.color = '#ffffff';
        }
      } else {
        badgeEl.classList.add('hidden');
      }
    };

    const fallbackMatchupSlots = (sourceTeams) => {
      const safeTeams = Array.isArray(sourceTeams) && sourceTeams.length >= 2 ? sourceTeams : defaultTeams();
      if (safeTeams.length <= 2) {
        return [ { id: 0, gameId: null, team1Idx: 0, team2Idx: 1 } ];
      }

      return [
        { id: 0, gameId: null, team1Idx: 0, team2Idx: 1 },
        { id: 1, gameId: null, team1Idx: 1, team2Idx: 2 },
        { id: 2, gameId: null, team1Idx: 2, team2Idx: 0 }
      ];
    };

    const buildMatchupSlotsFromGames = (sourceTeams) => {
      const safeTeams = Array.isArray(sourceTeams) && sourceTeams.length >= 2 ? sourceTeams : defaultTeams();
      if (!Array.isArray(games) || games.length === 0) return [];

      return games.map((game, index) => {
        const team1Idx = safeTeams.findIndex((team) => String(team?.id) === String(game.home_team_id));
        const team2Idx = safeTeams.findIndex((team) => String(team?.id) === String(game.away_team_id));
        if (team1Idx < 0 || team2Idx < 0) return null;

        return {
          id: index,
          gameId: game.id ?? null,
          team1Idx,
          team2Idx
        };
      }).filter((slot) => slot);
    };

    const normalizeMatchupSlots = (rawSlots, sourceTeams) => {
      if (!Array.isArray(rawSlots)) return [];

      const safeTeams = Array.isArray(sourceTeams) && sourceTeams.length >= 2 ? sourceTeams : defaultTeams();
      return rawSlots.map((slot, index) => {
        if (!slot || typeof slot !== "object") return null;

        const team1IdxRaw = slot.team1Idx ?? slot.team1_idx;
        const team2IdxRaw = slot.team2Idx ?? slot.team2_idx;
        const gameId = slot.gameId ?? slot.game_id ?? null;

        const team1Idx = Number.parseInt(team1IdxRaw, 10);
        const team2Idx = Number.parseInt(team2IdxRaw, 10);
        if (!Number.isInteger(team1Idx) || !Number.isInteger(team2Idx)) return null;
        if (team1Idx < 0 || team2Idx < 0 || team1Idx >= safeTeams.length || team2Idx >= safeTeams.length) return null;

        return {
          id: Number.parseInt(slot.id, 10) || index,
          gameId,
          team1Idx,
          team2Idx
        };
      }).filter((slot) => slot);
    };

    const serializeMatchupSlots = (slots) => {
      return slots.map((slot, index) => ({
        id: Number.isInteger(slot.id) ? slot.id : index,
        game_id: slot.gameId ?? null,
        team1_idx: slot.team1Idx,
        team2_idx: slot.team2Idx
      }));
    };

    const initialMatchupSlots = (sourceTeams) => {
      const fromGames = buildMatchupSlotsFromGames(sourceTeams);
      if (fromGames.length > 0) return fromGames;
      return fallbackMatchupSlots(sourceTeams);
    };

    const matchupSlots = () => {
      const sourceTeams = Array.isArray(state?.teams) && state.teams.length >= 2 ? state.teams : defaultTeams();
      const fromState = normalizeMatchupSlots(state?.matchup_slots, sourceTeams);
      if (fromState.length > 0) return fromState;
      return initialMatchupSlots(sourceTeams);
    };

    const roundsPerQuarter = () => Math.max(1, matchupSlots().length);
    const isTwoTeamMode = () => teamsCount === 2;

    const maxRotationStepForRounds = (rounds, regularQuarters = totalRegularQuarters()) => {
      const safeRegularQuarters = parseRegularQuarters(regularQuarters, totalRegularQuarters());
      return (safeRegularQuarters * Math.max(1, rounds)) - 1;
    };

    const maxRotationStep = () => maxRotationStepForRounds(roundsPerQuarter());

    const quarterForStepWithRounds = (step, rounds, regularQuarters = totalRegularQuarters(), sequential = false) => {
      const safeRounds = Math.max(1, rounds);
      const safeRegularQuarters = parseRegularQuarters(regularQuarters, totalRegularQuarters());
      const parsedStep = Number.parseInt(step, 10);
      const safeStep = Number.isFinite(parsedStep) ? Math.max(0, parsedStep) : 0;

      // 경기별 순차 진행: 한 경기의 모든 쿼터를 마친 뒤 다음 경기
      if (sequential) {
        return (safeStep % safeRegularQuarters) + 1;
      }

      // 쿼터별 라운드 로빈: 모든 경기가 같은 쿼터를 돌아가며 진행
      return Math.floor(safeStep / safeRounds) + 1;
    };

    const matchupSlotForStepWithRounds = (step, rounds, regularQuarters = totalRegularQuarters(), sequential = false) => {
      const safeRounds = Math.max(1, rounds);
      const safeRegularQuarters = parseRegularQuarters(regularQuarters, totalRegularQuarters());
      const parsedStep = Number.parseInt(step, 10);
      const safeStep = Number.isFinite(parsedStep) ? Math.max(0, parsedStep) : 0;

      if (sequential) {
        return Math.floor(safeStep / safeRegularQuarters) % safeRounds;
      }

      return ((safeStep % safeRounds) + safeRounds) % safeRounds;
    };

    const rotationStepForPosition = (quarter, matchupSlot, rounds, regularQuarters = totalRegularQuarters(), sequential = false) => {
      const safeRounds = Math.max(1, rounds);
      const safeRegularQuarters = parseRegularQuarters(regularQuarters, totalRegularQuarters());
      const parsedQuarter = Number.parseInt(quarter, 10);
      const safeQuarter = Number.isFinite(parsedQuarter)
        ? Math.max(1, Math.min(safeRegularQuarters, parsedQuarter))
        : 1;
      const parsedSlot = Number.parseInt(matchupSlot, 10);
      const safeSlot = Number.isFinite(parsedSlot)
        ? Math.max(0, Math.min(safeRounds - 1, parsedSlot))
        : 0;

      if (sequential) {
        return (safeSlot * safeRegularQuarters) + (safeQuarter - 1);
      }

      return ((safeQuarter - 1) * safeRounds) + safeSlot;
    };

    const quarterForStep = (step) => quarterForStepWithRounds(step, roundsPerQuarter(), totalRegularQuarters(), isSequentialProgression());

    const normalizePossession = (value, fallback = "away") => {
      if (value === "home" || value === "away") return value;
      return fallback;
    };

    const normalizePossessionSwitchPattern = (value) => {
      return POSSESSION_SWITCH_PATTERNS.includes(value) ? value : defaultPossessionSwitchPattern;
    };

    const oppositePossession = (value) => (value === "home" ? "away" : "home");

    const isPossessionSwappedQuarter = (quarter, pattern) => {
      const quarterNumber = Number.parseInt(quarter, 10);
      const safeQuarter = Number.isFinite(quarterNumber) && quarterNumber > 0 ? quarterNumber : 1;

      if (pattern === "nba") {
        return safeQuarter === 2 || safeQuarter === 3;
      }

      if (pattern === "club") {
        return safeQuarter >= 3;
      }

      return safeQuarter % 2 === 0;
    };

    const possessionForQuarter = (quarter, basePossession, pattern) => {
      const safeBasePossession = normalizePossession(basePossession, "away");
      const safePattern = normalizePossessionSwitchPattern(pattern);
      if (!isPossessionSwappedQuarter(quarter, safePattern)) return safeBasePossession;
      return oppositePossession(safeBasePossession);
    };

    const basePossessionForSelectedQuarterDirection = (quarter, selectedPossession, pattern) => {
      const safeSelected = normalizePossession(selectedPossession, "away");
      const safePattern = normalizePossessionSwitchPattern(pattern);
      if (!isPossessionSwappedQuarter(quarter, safePattern)) return safeSelected;
      return oppositePossession(safeSelected);
    };

    const defaultMatchupOrder = (slots = matchupSlots()) => slots.map((_, index) => index);

    const normalizeMatchupOrder = (rawOrder, fallback = defaultMatchupOrder()) => {
      if (!Array.isArray(rawOrder)) return fallback;

      const seen = new Set();
      const normalized = [];

      rawOrder.forEach((value) => {
        const index = Number.parseInt(value, 10);
        if (!Number.isInteger(index)) return;
        if (index < 0 || index >= fallback.length) return;
        if (seen.has(index)) return;
        seen.add(index);
        normalized.push(index);
      });

      fallback.forEach((index) => {
        if (!seen.has(index)) {
          normalized.push(index);
          seen.add(index);
        }
      });

      return normalized;
    };

    const matchupSlotById = (matchupId) => {
      const slots = matchupSlots();
      return slots[matchupId] || slots[0] || { id: 0, gameId: null, team1Idx: 0, team2Idx: 1 };
    };

    const matchupPairById = (matchupId) => {
      const slot = matchupSlotById(matchupId);
      return [ slot.team1Idx, slot.team2Idx ];
    };

    const matchupGameIdById = (matchupId) => {
      const slot = matchupSlotById(matchupId);
      return slot?.gameId ?? null;
    };

    const matchupIdForStep = (step = state?.rotation_step || 0) => {
      const order = normalizeMatchupOrder(state?.matchup_order);
      const rounds = roundsPerQuarter();
      const slot = matchupSlotForStepWithRounds(step, rounds, totalRegularQuarters(), isSequentialProgression());
      return order[slot] ?? defaultMatchupOrder()[slot] ?? 0;
    };

    const syncScoresForActiveMatchup = () => {
      if (!state || !Array.isArray(state.teams)) return;

      const activeMatchupId = matchupIdForStep(state.rotation_step || 0);
      const [team1Idx, team2Idx] = matchupPairById(activeMatchupId);
      const savedScores = state.matchup_scores?.[activeMatchupId] || { team1: 0, team2: 0 };
      const savedFouls = state.matchup_fouls?.[activeMatchupId] || { team1: 0, team2: 0 };

      if (state.teams[team1Idx]) state.teams[team1Idx].score = Number(savedScores.team1) || 0;
      if (state.teams[team2Idx]) state.teams[team2Idx].score = Number(savedScores.team2) || 0;

      // 파울도 경기별로 복원
      state.home_fouls = Number(savedFouls.team1) || 0;
      state.away_fouls = Number(savedFouls.team2) || 0;

      if (teamsCount === 3) {
        [ 0, 1, 2 ].forEach((index) => {
          if (index !== team1Idx && index !== team2Idx && state.teams[index]) {
            state.teams[index].score = 0;
          }
        });
      }
    };

    const emptyMatchupScores = () => matchupSlots().map(() => ({ team1: 0, team2: 0 }));

    // 게임 데이터에서 기존 점수를 추출하여 matchup_scores 초기화
    const getInitialMatchupScoresFromGames = (seededSlots) => {
      if (!Array.isArray(games) || games.length === 0) {
        return seededSlots.map(() => ({ team1: 0, team2: 0 }));
      }

      return seededSlots.map((_, index) => {
        const game = games[index];
        if (!game) return { team1: 0, team2: 0 };

        const homeScore = Number(game.home_score) || 0;
        const awayScore = Number(game.away_score) || 0;

        // 점수가 있으면 기존 점수 사용
        if (homeScore > 0 || awayScore > 0) {
          return { team1: homeScore, team2: awayScore };
        }
        return { team1: 0, team2: 0 };
      });
    };

    const defaultState = () => {
      const seededTeams = defaultTeams().map((team) => ({ ...team, score: 0 }));
      const seededSlots = initialMatchupSlots(seededTeams);
      const initialScores = getInitialMatchupScoresFromGames(seededSlots);
      const hasExistingScores = initialScores.some(s => s.team1 > 0 || s.team2 > 0);

      // 기존 점수가 있으면 현재 매치업의 점수로 팀 점수 설정
      const initialTeamScores = hasExistingScores && initialScores[0]
        ? { home: initialScores[0].team1, away: initialScores[0].team2 }
        : { home: 0, away: 0 };

      const teamsWithScores = seededTeams.map((team, index) => {
        // 첫 번째 매치업(index 0)의 팀1(home)과 팀2(away)에 점수 할당
        if (seededSlots[0]) {
          if (index === seededSlots[0].team1Idx) return { ...team, score: initialTeamScores.home };
          if (index === seededSlots[0].team2Idx) return { ...team, score: initialTeamScores.away };
        }
        return { ...team, score: 0 };
      });

      return {
        quarter: 1,
        regular_quarters: defaultRegularQuarters,
        period_seconds: defaultPeriodSeconds,
        shot_seconds: SHOT_CLOCK_24,
        running: false,
        shot_running: false,
        // Timer sync references for smooth display
        main_ref_at_ms: 0,
        main_ref_value: defaultPeriodSeconds,
        shot_ref_at_ms: 0,
        shot_ref_value: SHOT_CLOCK_24,
        sound_enabled: defaultAnnouncementsEnabled,
        voice_enabled: defaultAnnouncementsEnabled,
        voice_rate: defaultVoiceRate,
        matchup_index: 0,
        rotation_step: 0,
        home_fouls: 0,
        away_fouls: 0,
        home_timeouts: 0,
        away_timeouts: 0,
        teams: teamsWithScores,
        matchup_slots: serializeMatchupSlots(seededSlots),
        matchup_scores: initialScores,
        matchup_fouls: seededSlots.map(() => ({ team1: 0, team2: 0 })),
        matchup_order: defaultMatchupOrder(seededSlots),
        quarter_history: {}, // { pairIdx: { quarterNum: { team1: score, team2: score } } }
        progression_mode: isTwoTeamMode() ? "by_game" : "by_quarter",
        base_possession: "home",
        possession_switch_pattern: defaultPossessionSwitchPattern,
        possession: "home", // 'home' or 'away'
        manual_swap: false,
        quarter_score_reset_enabled: totalRegularQuarters() === 3,
        state_version: 0,
        source_client_id: null,
        updated_at_ms: 0
      };
    };

    const isSoundEnabled = () => state?.sound_enabled !== false;
    const isVoiceEnabled = () => state?.voice_enabled !== false;
    // 음성 안내 토글용 — 부저와 분리됨 (부저는 isSoundEnabled로 항상 동작)
    const isAnnouncementsEnabled = () => isVoiceEnabled();
    // 경기별 순차 진행 모드 (by_game: 1경기 모든 쿼터 → 2경기, by_quarter: 모든 경기 1쿼터 → 2쿼터)
    const isSequentialProgression = () => state?.progression_mode === "by_game";
    // 사용자가 세션 내에서 토글을 직접 변경했는지 추적
    let voiceToggledLocally = false;
    const isQuarterScoreResetEnabled = () => state?.quarter_score_reset_enabled === true;
    const currentVoiceRate = () => normalizeVoiceRate(state?.voice_rate, defaultVoiceRate);
    const isPerQuarterScoreView = () => quarterScoreViewMode === "per_quarter";
    const setQuarterScoreViewMode = (nextMode) => {
      if (!QUARTER_SCORE_VIEW_MODES.includes(nextMode)) return;
      quarterScoreViewMode = nextMode;
      try {
        window.localStorage.setItem(quarterScoreViewStorageKey, nextMode);
      } catch (error) {
        // ignore storage failures
      }
    };
    const buildQuarterTotalsForStorage = (pairIdx, quarterNumber, team1DisplayScore, team2DisplayScore) => {
      const currentTeam1 = Number(team1DisplayScore) || 0;
      const currentTeam2 = Number(team2DisplayScore) || 0;

      if (!isQuarterScoreResetEnabled()) {
        return { team1: currentTeam1, team2: currentTeam2 };
      }

      const previous = state.quarter_history?.[pairIdx]?.[quarterNumber - 1];
      const previousTeam1 = Number(previous?.team1) || 0;
      const previousTeam2 = Number(previous?.team2) || 0;
      return {
        team1: previousTeam1 + currentTeam1,
        team2: previousTeam2 + currentTeam2
      };
    };

    const normalizeState = (incomingState) => {
      const base = defaultState();
      if (!incomingState || typeof incomingState !== "object") return base;

      const normalized = { ...base, ...incomingState };

      normalized.teams = Array.isArray(incomingState.teams) && incomingState.teams.length >= 2
        ? incomingState.teams
        : base.teams;

      const slotsFromPayload = normalizeMatchupSlots(incomingState.matchup_slots, normalized.teams);
      const slotsForState = slotsFromPayload.length > 0 ? slotsFromPayload : initialMatchupSlots(normalized.teams);
      normalized.matchup_slots = serializeMatchupSlots(slotsForState);

      // 서버에서 받은 점수가 모두 0인지 확인
      const incomingScoresAllZero = !Array.isArray(incomingState.matchup_scores) ||
        incomingState.matchup_scores.every(row =>
          (Number(row?.team1) || 0) === 0 && (Number(row?.team2) || 0) === 0
        );

      // 게임 데이터에 점수가 있는지 확인
      const gamesHaveScores = Array.isArray(games) && games.some(game =>
        (Number(game.home_score) || 0) > 0 || (Number(game.away_score) || 0) > 0
      );

      // 서버 점수가 0이고 게임에 점수가 있으면 게임 점수 사용
      if (incomingScoresAllZero && gamesHaveScores) {
        normalized.matchup_scores = slotsForState.map((_, index) => {
          const game = games[index];
          if (!game) return { team1: 0, team2: 0 };
          const homeScore = Number(game.home_score) || 0;
          const awayScore = Number(game.away_score) || 0;
          return { team1: homeScore, team2: awayScore };
        });
        // 팀 점수도 게임 점수로 설정
        if (normalized.matchup_scores[0] && normalized.teams.length >= 2) {
          const firstSlot = slotsForState[0];
          if (firstSlot) {
            if (normalized.teams[firstSlot.team1Idx]) {
              normalized.teams[firstSlot.team1Idx].score = normalized.matchup_scores[0].team1;
            }
            if (normalized.teams[firstSlot.team2Idx]) {
              normalized.teams[firstSlot.team2Idx].score = normalized.matchup_scores[0].team2;
            }
          }
        }
      } else {
        normalized.matchup_scores = slotsForState.map((_, index) => {
          const row = incomingState.matchup_scores?.[index];
          return {
            team1: Number.isFinite(Number(row?.team1)) ? Number(row.team1) : 0,
            team2: Number.isFinite(Number(row?.team2)) ? Number(row.team2) : 0
          };
        });
      }

      normalized.matchup_fouls = slotsForState.map((_, index) => {
        const row = incomingState.matchup_fouls?.[index];
        return {
          team1: Number.isFinite(Number(row?.team1)) ? Number(row.team1) : 0,
          team2: Number.isFinite(Number(row?.team2)) ? Number(row.team2) : 0
        };
      });

      normalized.matchup_order = normalizeMatchupOrder(
        incomingState.matchup_order,
        defaultMatchupOrder(slotsForState)
      );

      normalized.quarter_history = incomingState.quarter_history && typeof incomingState.quarter_history === "object"
        ? incomingState.quarter_history
        : {};
      normalized.regular_quarters = parseRegularQuarters(incomingState.regular_quarters, base.regular_quarters);

      normalized.possession_switch_pattern = normalizePossessionSwitchPattern(
        incomingState.possession_switch_pattern || normalized.possession_switch_pattern
      );
      normalized.voice_rate = normalizeVoiceRate(incomingState.voice_rate, base.voice_rate);
      // 부저(sound_enabled)는 항상 true — 부저는 독립적으로 항상 작동
      normalized.sound_enabled = true;
      // 음성안내(voice_enabled): 세션 내 토글 변경 시 로컬 값 유지, 아니면 설정 기본값
      if (voiceToggledLocally && state) {
        normalized.voice_enabled = state.voice_enabled;
      } else {
        normalized.voice_enabled = defaultVoiceEnabled;
      }
      normalized.quarter_score_reset_enabled = parseBooleanDataset(normalized.quarter_score_reset_enabled, false);
      normalized.state_version = parseStateVersion(incomingState.state_version, base.state_version);
      normalized.updated_at_ms = parseUpdatedAtMs(incomingState.updated_at_ms, base.updated_at_ms);
      normalized.source_client_id = normalizeSourceClientId(incomingState.source_client_id);

      const parsedStep = Number.parseInt(incomingState.rotation_step, 10);
      const roundsForState = Math.max(1, slotsForState.length);
      const regularQuartersForIncoming = normalized.regular_quarters;
      const maxStepForState = maxRotationStepForRounds(roundsForState, regularQuartersForIncoming);
      normalized.rotation_step = Number.isFinite(parsedStep)
        ? Math.max(0, Math.min(parsedStep, maxStepForState))
        : 0;
      // progression_mode: incoming 값을 존중, 없으면 팀 수 기반 기본값
      const incomingProgressionMode = incomingState.progression_mode;
      if (incomingProgressionMode === "by_game" || incomingProgressionMode === "by_quarter") {
        normalized.progression_mode = incomingProgressionMode;
      } else {
        normalized.progression_mode = isTwoTeamMode() ? "by_game" : "by_quarter";
      }
      const isIncomingSequential = normalized.progression_mode === "by_game";

      if (isTwoTeamMode() && incomingProgressionMode !== "by_game") {
        // Backward compatibility: convert old quarter-first step sequencing to game-first.
        // Guard: if incoming quarter already matches by-game progression, skip conversion.
        const legacyStep = normalized.rotation_step;
        const legacyQuarter = Math.floor(legacyStep / roundsForState) + 1;
        const legacySlot = ((legacyStep % roundsForState) + roundsForState) % roundsForState;
        const byGameQuarter = (legacyStep % regularQuartersForIncoming) + 1;
        const incomingQuarter = Number.parseInt(incomingState.quarter, 10);
        const hasIncomingQuarter = Number.isFinite(incomingQuarter) && incomingQuarter > 0;
        const looksLikeByGameState =
          hasIncomingQuarter &&
          incomingQuarter === byGameQuarter &&
          incomingQuarter !== legacyQuarter;

        if (!looksLikeByGameState) {
          const convertedStep = rotationStepForPosition(legacyQuarter, legacySlot, roundsForState, regularQuartersForIncoming, isIncomingSequential);
          normalized.rotation_step = Math.max(0, Math.min(convertedStep, maxStepForState));
        }
      }

      const parsedQuarter = Number.parseInt(incomingState.quarter, 10);
      if (Number.isFinite(parsedQuarter) && parsedQuarter > regularQuartersForIncoming) {
        normalized.quarter = parsedQuarter;
      } else {
        normalized.quarter = quarterForStepWithRounds(normalized.rotation_step, roundsForState, regularQuartersForIncoming, isIncomingSequential);
      }
      if (incomingState.base_possession === "home" || incomingState.base_possession === "away") {
        normalized.base_possession = incomingState.base_possession;
      } else {
        normalized.base_possession = basePossessionForSelectedQuarterDirection(
          normalized.quarter,
          normalizePossession(incomingState.possession, "home"),
          normalized.possession_switch_pattern
        );
      }
      normalized.possession = possessionForQuarter(
        normalized.quarter,
        normalized.base_possession,
        normalized.possession_switch_pattern
      );

      return normalized;
    };

    const currentMatchupIndex = () => {
      return matchupSlotForStepWithRounds(state.rotation_step, roundsPerQuarter(), totalRegularQuarters(), isSequentialProgression());
    };

    const currentMatchupId = () => {
      return matchupIdForStep(state.rotation_step || 0);
    };

    const currentQuarter = () => {
      return quarterForStep(state.rotation_step);
    };

    const applyQuarterPossession = (quarter = currentQuarter()) => {
      state.possession = possessionForQuarter(
        quarter,
        state.base_possession,
        state.possession_switch_pattern
      );
    };

    const isSidesSwapped = () => {
      // Automatic swap for Q3/Q4, or manual swap override
      const autoSwap = currentQuarter() >= 3;
      return state.manual_swap ? !autoSwap : autoSwap;
    };

    const currentMatchup = () => {
      const pairIdx = currentMatchupId();
      const [idx1, idx2] = matchupPairById(pairIdx);
      const fallbackTeams = defaultTeams().map((team) => ({ ...team, score: 0 }));
      const firstTeam = state.teams[idx1] || fallbackTeams[0];
      const secondTeam = state.teams[idx2] || fallbackTeams[1] || fallbackTeams[0];

      // Logic:
      // Q1/Q2: idx1 vs idx2 (e.g., A vs B)
      // Q3/Q4: idx2 vs idx1 (e.g., B vs A) -> Swapped

      if (isSidesSwapped()) {
        return [secondTeam, firstTeam]; // Visual Home is Team 2, Visual Away is Team 1
      }
      return [firstTeam, secondTeam]; // Visual Home is Team 1, Visual Away is Team 2
    };

    const setText = (selector, value) => {
      scoreboardRoot.querySelectorAll(selector).forEach(el => { el.textContent = value; });
    };

    const setTextOrValue = (selector, value) => {
      const el = scoreboardRoot.querySelector(selector);
      if (!el) return;
      if ("value" in el) {
        el.value = value;
      } else {
        el.textContent = value;
      }
    };

    // Control page: Render teams with inline styles
    const renderTeamsControl = () => {
      const wrapper = scoreboardRoot.querySelector("[data-scoreboard-teams]");
      if (!wrapper) return;

      const [home, away] = currentMatchup();

      wrapper.innerHTML = `
        <!-- Home Team -->
        <div style="background: ${COLORS.cardBg}; padding: 24px; border-radius: 2px;" data-team="home">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <span style="color: ${COLORS.homeAccent}; font-size: 10px; font-weight: 600; letter-spacing: 2px; font-family: Inter, sans-serif;">HOME</span>
            <span style="color: ${COLORS.text}; font-size: 14px; font-weight: 600; font-family: Inter, sans-serif;">TEAM ${escapeHtml(home.label)}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 24px; margin-bottom: 16px;">
            <button style="width: 48px; height: 48px; background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer;" data-team-action="sub-home">
              <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; color: ${COLORS.text};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4"/>
              </svg>
            </button>
            <span style="color: ${COLORS.text}; font-size: 64px; font-weight: 500; min-width: 120px; text-align: center; font-family: 'Cormorant Garamond', serif;">${String(home.score).padStart(2, '0')}</span>
            <button style="width: 48px; height: 48px; background: ${COLORS.homeAccent}; border: none; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer;" data-team-action="add-home">
              <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; color: ${COLORS.text};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
            </button>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-home-1">+1</button>
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-home-2">+2</button>
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-home-3">+3</button>
          </div>
        </div>

        <!-- Away Team -->
        <div style="background: ${COLORS.cardBg}; padding: 24px; border-radius: 2px;" data-team="away">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <span style="color: ${COLORS.awayAccent}; font-size: 10px; font-weight: 600; letter-spacing: 2px; font-family: Inter, sans-serif;">AWAY</span>
            <span style="color: ${COLORS.text}; font-size: 14px; font-weight: 600; font-family: Inter, sans-serif;">TEAM ${escapeHtml(away.label)}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 24px; margin-bottom: 16px;">
            <button style="width: 48px; height: 48px; background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer;" data-team-action="sub-away">
              <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; color: ${COLORS.text};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4"/>
              </svg>
            </button>
            <span style="color: ${COLORS.text}; font-size: 64px; font-weight: 500; min-width: 120px; text-align: center; font-family: 'Cormorant Garamond', serif;">${String(away.score).padStart(2, '0')}</span>
            <button style="width: 48px; height: 48px; background: ${COLORS.awayAccent}; border: none; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer;" data-team-action="add-away">
              <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; color: ${COLORS.text};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
            </button>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-away-1">+1</button>
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-away-2">+2</button>
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-away-3">+3</button>
          </div>
        </div>
      `;

      // Attach event handlers
      wrapper.querySelectorAll("[data-team-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.dataset.teamAction;
          const [homeIdx, awayIdx] = matchupPairById(currentMatchupId());

          const isScoreAddAction = ["add-home", "add-home-1", "add-home-2", "add-home-3",
                                    "add-away", "add-away-1", "add-away-2", "add-away-3"].includes(action);

          if (action === "add-home") state.teams[homeIdx].score += 1;
          else if (action === "sub-home") state.teams[homeIdx].score = Math.max(0, state.teams[homeIdx].score - 1);
          else if (action === "add-home-1") state.teams[homeIdx].score += 1;
          else if (action === "add-home-2") state.teams[homeIdx].score += 2;
          else if (action === "add-home-3") state.teams[homeIdx].score += 3;
          else if (action === "add-away") state.teams[awayIdx].score += 1;
          else if (action === "sub-away") state.teams[awayIdx].score = Math.max(0, state.teams[awayIdx].score - 1);
          else if (action === "add-away-1") state.teams[awayIdx].score += 1;
          else if (action === "add-away-2") state.teams[awayIdx].score += 2;
          else if (action === "add-away-3") state.teams[awayIdx].score += 3;

          // 득점 시 샷클락 리셋
          if (isScoreAddAction) {
            if (state.period_seconds >= 24) {
              state.shot_seconds = SHOT_CLOCK_24;
            } else {
              state.shot_seconds = -1;
            }
            state.shot_running = false;
          }

          render();
          broadcast();
        });
      });
    };

    // Display page: Render with inline styles
    const renderDisplayScores = () => {
      const wrapper = scoreboardRoot.querySelector("[data-scoreboard-display-scores]");
      if (!wrapper) return;

      const [home, away] = currentMatchup();

      wrapper.innerHTML = `
        <!-- Home Team -->
        <div style="width: 280px; height: 300px; background: ${COLORS.displayCardBg}; border: 1px solid ${COLORS.displayBorder}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
          <div style="width: 72px; height: 72px; background: ${COLORS.homeLogoBg}; border: 2px solid #E53935; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 22px; font-weight: 800; font-family: Inter, sans-serif;">${escapeHtml(home.label)}</span>
          </div>
          <span style="color: #999999; font-size: 11px; font-weight: 500; letter-spacing: 2px; font-family: Inter, sans-serif;">HOME TEAM</span>
          <span style="color: white; font-size: 18px; font-weight: 700; letter-spacing: 1px; font-family: Inter, sans-serif;">TEAM ${escapeHtml(home.label)}</span>
          <span style="color: white; font-size: 80px; font-weight: 700; line-height: 1; font-family: 'JetBrains Mono', monospace;">${home.score}</span>
          <span style="color: #E53935; font-size: 10px; font-weight: 600; letter-spacing: 2px; font-family: Inter, sans-serif;">HOME</span>
          <div style="width: 40px; height: 40px; background: ${state.possession === 'home' ? '#E53935' : 'transparent'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-top: 8px;">
            ${state.possession === 'home' ? '<span style="color: white; font-size: 24px; font-weight: bold;">◀</span>' : ''}
          </div>
        </div>

        <!-- Center Panel -->
        <div style="flex: 1; height: 300px; background: ${COLORS.centerBg}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
          <div style="width: 80px; height: 32px; background: #E53935; display: flex; align-items: center; justify-content: center; gap: 4px;">
            <span style="color: white; font-size: 10px; font-weight: 600; letter-spacing: 1px; font-family: Inter, sans-serif;">QTR</span>
            <span style="color: white; font-size: 16px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${state.quarter}</span>
          </div>
          <div style="width: 40px; height: 1px; background: #333333;"></div>
          <span style="color: white; font-size: 56px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${formatTime(state.period_seconds)}</span>
          <span style="color: #666666; font-size: 9px; font-weight: 500; letter-spacing: 2px; font-family: Inter, sans-serif;">GAME TIME</span>
          <div style="width: 40px; height: 1px; background: #333333;"></div>
          <div style="width: 90px; height: 48px; background: #161616; border: 1px solid #333333; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
            <span style="color: ${COLORS.shotClock}; font-size: 22px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${state.shot_seconds < 0 ? '--' : (state.shot_seconds < 5 && state.shot_seconds > 0 ? Number(state.shot_seconds).toFixed(1) : Math.floor(state.shot_seconds))}</span>
            <span style="color: #666666; font-size: 8px; font-weight: 500; letter-spacing: 1px; font-family: Inter, sans-serif;">SHOT CLOCK</span>
          </div>
        </div>

        <!-- Away Team -->
        <div style="width: 280px; height: 300px; background: ${COLORS.displayCardBg}; border: 1px solid ${COLORS.displayBorder}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
          <div style="width: 72px; height: 72px; background: ${COLORS.awayLogoBg}; border: 2px solid ${COLORS.awayLogoBorder}; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 22px; font-weight: 800; font-family: Inter, sans-serif;">${escapeHtml(away.label)}</span>
          </div>
          <span style="color: #999999; font-size: 11px; font-weight: 500; letter-spacing: 2px; font-family: Inter, sans-serif;">AWAY TEAM</span>
          <span style="color: white; font-size: 18px; font-weight: 700; letter-spacing: 1px; font-family: Inter, sans-serif;">TEAM ${escapeHtml(away.label)}</span>
          <span style="color: white; font-size: 80px; font-weight: 700; line-height: 1; font-family: 'JetBrains Mono', monospace;">${away.score}</span>
          <span style="color: ${COLORS.awayLogoBorder}; font-size: 10px; font-weight: 600; letter-spacing: 2px; font-family: Inter, sans-serif;">AWAY</span>
          <div style="width: 40px; height: 40px; background: ${state.possession === 'away' ? COLORS.awayLogoBorder : 'transparent'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-top: 8px;">
            ${state.possession === 'away' ? '<span style="color: white; font-size: 24px; font-weight: bold;">▶</span>' : ''}
          </div>
        </div>
      `;
    };

    const renderPreview = () => {
      const [home, away] = currentMatchup();
      setText("[data-preview-matchup]", formatMatchupText(home, away));
      setText("[data-preview-quarter]", `${state.quarter}Q`);
      setText("[data-preview-timer]", formatTime(state.period_seconds));
      setText("[data-preview-home]", home.score);
      setText("[data-preview-away]", away.score);
      // Show "--" for shot clock when disabled (shot_seconds < 0)
      // 5초 미만이면 소수점 한자리 표시, 그 외에는 정수 (올림)
      let previewShotDisplay;
      if (state.shot_seconds < 0) {
        previewShotDisplay = "--";
      } else if (state.shot_seconds < 5 && state.shot_seconds > 0) {
        previewShotDisplay = Number(state.shot_seconds).toFixed(1);
      } else {
        previewShotDisplay = Math.floor(state.shot_seconds);
      }
      setText("[data-preview-shot]", previewShotDisplay);
    };

    const render = () => {
      const [home, away] = currentMatchup();

      // For display page, swap left/right (Control: A:B, Display: B:A)
      const isDisplayPage = role === 'display';
      const leftTeam = isDisplayPage ? away : home;
      const rightTeam = isDisplayPage ? home : away;
      const leftFouls = isDisplayPage ? (state.away_fouls || 0) : (state.home_fouls || 0);
      const rightFouls = isDisplayPage ? (state.home_fouls || 0) : (state.away_fouls || 0);

      // Quarter and timers
      const quarterLabel = role === "control" ? `${state.quarter}Q` : state.quarter;
      setText("[data-scoreboard-quarter]", quarterLabel);
      setText("[data-scoreboard-timer]", formatTime(state.period_seconds));

      // Show "--" for shot clock when disabled (shot_seconds < 0)
      // 5초 미만: 소수점 한자리 표시
      // 5초 이상: floor() 사용 (전광판과 동일하게 즉시 반영)
      let shotClockDisplay;
      if (state.shot_seconds < 0) {
        shotClockDisplay = "--";
      } else if (state.shot_seconds < 5 && state.shot_seconds > 0) {
        shotClockDisplay = Number(state.shot_seconds).toFixed(1);
      } else {
        shotClockDisplay = Math.floor(state.shot_seconds);
      }
      setText("[data-scoreboard-shot]", shotClockDisplay);

      // Team names (for new sports display)
      setText("[data-team-name-left]", formatTeamName(leftTeam));
      setText("[data-team-name-right]", formatTeamName(rightTeam));

      const applyDisplayBadgeStyle = (selector, team) => {
        const badge = scoreboardRoot.querySelector(selector);
        if (!badge) return;
        const teamColor = String(team?.color || "").trim();
        if (!teamColor) return;

        const isExplicitWhite = /^(white|#fff|#ffffff)$/i.test(teamColor);
        const light = isExplicitWhite || isLightColor(teamColor);
        badge.style.backgroundColor = teamColor;
        badge.style.borderColor = light ? "#111827" : teamColor;

        const label = badge.querySelector("span");
        if (label) {
          label.style.color = light ? "#111827" : "#ffffff";
        }
      };

      if (isDisplayPage) {
        applyDisplayBadgeStyle(".team-badge-left", leftTeam);
        applyDisplayBadgeStyle(".team-badge-right", rightTeam);

        // Display 페이지 팀 색상 인디케이터 및 바 업데이트
        const DISPLAY_TEAM_COLOR_MAP = {
          'White': '#ffffff',
          'Black': '#1f2937',
          'Red': '#ef4444',
          'Blue': '#3b82f6',
          'Yellow': '#eab308',
          'Green': '#22c55e',
          'Pink': '#ec4899',
          'SkyBlue': '#38bdf8',
          'Brown': '#a16207',
          'Orange': '#f97316'
        };

        const getDisplayTeamColor = (colorName) => {
          return DISPLAY_TEAM_COLOR_MAP[colorName] || colorName || '#3b82f6';
        };

        const leftColor = getDisplayTeamColor(leftTeam?.color);
        const rightColor = getDisplayTeamColor(rightTeam?.color);

        // 팀 색상 인디케이터 (원형) - setProperty로 강제 적용
        const leftIndicator = scoreboardRoot.querySelector('[data-team-color-left]');
        const rightIndicator = scoreboardRoot.querySelector('[data-team-color-right]');
        if (leftIndicator) {
          leftIndicator.style.setProperty('background-color', leftColor, 'important');
        }
        if (rightIndicator) {
          rightIndicator.style.setProperty('background-color', rightColor, 'important');
        }

        // 팀 색상 바 - setProperty로 강제 적용
        const leftBar = scoreboardRoot.querySelector('[data-team-bar-left]');
        const rightBar = scoreboardRoot.querySelector('[data-team-bar-right]');
        if (leftBar) {
          leftBar.style.setProperty('background-color', leftColor, 'important');
        }
        if (rightBar) {
          rightBar.style.setProperty('background-color', rightColor, 'important');
        }
      }

      // Scores (new display)
      setText("[data-score-left]", leftTeam.score);
      setText("[data-score-right]", rightTeam.score);


      // Fouls (new display) - Fill circles based on count + data-foul-active attribute
      const updateFoulCircles = (containerSelector, foulCount) => {
        const container = scoreboardRoot.querySelector(containerSelector);
        if (!container) return;

        const circles = container.querySelectorAll('[data-foul-circle]');
        circles.forEach((circle, index) => {
          const isActive = index < foulCount;
          if (isActive) {
            circle.style.backgroundColor = '#dc2626'; // red-600
          } else {
            circle.style.backgroundColor = ''; // CSS 기본값 사용
          }
          circle.setAttribute('data-foul-active', isActive ? 'true' : 'false');
        });
      };

      updateFoulCircles('[data-foul-indicators-left]', leftFouls);
      updateFoulCircles('[data-foul-indicators-right]', rightFouls);

      // Possession arrows (new display)
      // Possession arrows (new display)
      const arrowsLeft = scoreboardRoot.querySelectorAll(".possession-arrow-left");
      const arrowsRight = scoreboardRoot.querySelectorAll(".possession-arrow-right");

      const centerText = scoreboardRoot.querySelector(".center-vs-text");
      if (centerText) {
        if (state.possession === 'home' || state.possession === 'away') {
          centerText.classList.add('hidden');
        } else {
          centerText.classList.remove('hidden');
        }
      }

      const showArrows = (arrows, show) => {
        arrows.forEach(a => a.classList.toggle('hidden', !show));
      };

      if (state.possession === 'home' || state.possession === 'away') {
        // Q3/Q4에서 카드 스왑(isSidesSwapped)과 공격방향 스왑(possessionForQuarter)이
        // 동시에 일어나면 상쇄되므로, 화살표 방향을 한 번 더 반전시킨다.
        const swapped = isSidesSwapped();
        let showLeft = role === 'control'
          ? state.possession === 'away'
          : state.possession === 'home';
        if (swapped) showLeft = !showLeft;
        showArrows(arrowsLeft, showLeft);
        showArrows(arrowsRight, !showLeft);
      } else {
        showArrows(arrowsLeft, false);
        showArrows(arrowsRight, false);
      }

      // Legacy display elements
      setText("[data-scoreboard-matchup]", formatMatchupText(home, away));
      setText("[data-home-name]", formatTeamName(home));
      setText("[data-away-name]", formatTeamName(away));
      const homeIconEl = scoreboardRoot.querySelector("[data-home-icon]");
      if (homeIconEl) {
        applyTeamIconColor(homeIconEl, home.color);
      }
      const homeHeaderEl = scoreboardRoot.querySelector("[data-home-header]");
      if (homeHeaderEl) {
        applyTeamHeaderColor(homeHeaderEl, home.color);
      }

      const awayIconEl = scoreboardRoot.querySelector("[data-away-icon]");
      if (awayIconEl) {
        applyTeamIconColor(awayIconEl, away.color);
      }
      const awayHeaderEl = scoreboardRoot.querySelector("[data-away-header]");
      if (awayHeaderEl) {
        applyTeamHeaderColor(awayHeaderEl, away.color);
      }
      setText("[data-home-fouls]", state.home_fouls || 0);
      setText("[data-away-fouls]", state.away_fouls || 0);

      // 파울 숫자 색상 적용 (팀 배경색에 따른 가시성 확보)
      const homeFoulEl = scoreboardRoot.querySelector("[data-home-fouls]");
      if (homeFoulEl) {
        applyFoulColor(homeFoulEl, state.home_fouls || 0, home.color);
      }
      const awayFoulEl = scoreboardRoot.querySelector("[data-away-fouls]");
      if (awayFoulEl) {
        applyFoulColor(awayFoulEl, state.away_fouls || 0, away.color);
      }

      // TEAM FOUL 배지 표시 (파울 5개 이상)
      const homeFoulBadge = scoreboardRoot.querySelector("[data-home-team-foul-badge]");
      if (homeFoulBadge) {
        applyTeamFoulBadge(homeFoulBadge, state.home_fouls || 0, home.color);
      }
      const awayFoulBadge = scoreboardRoot.querySelector("[data-away-team-foul-badge]");
      if (awayFoulBadge) {
        applyTeamFoulBadge(awayFoulBadge, state.away_fouls || 0, away.color);
      }

      // 마지막 라운드 도달 시 NEXT QUARTER 버튼 상태 변경
      const nextQuarterBtn = scoreboardRoot.querySelector('[data-action="next-quarter"]');
      if (nextQuarterBtn) {
        const finalRotationStep = maxRotationStep();
        if (state.rotation_step === finalRotationStep) {
          nextQuarterBtn.textContent = i18nForScoreboard("score_finalize");
          nextQuarterBtn.classList.add("bg-red-600", "hover:bg-red-700"); // 스타일 강조 (선택사항)
          nextQuarterBtn.style.display = '';
        } else if (state.rotation_step > finalRotationStep) {
          nextQuarterBtn.style.display = 'none';
        } else {
          nextQuarterBtn.textContent = i18nForScoreboard("next_quarter");
          nextQuarterBtn.classList.remove("bg-red-600", "hover:bg-red-700");
          nextQuarterBtn.style.display = '';
        }
      }

      // PREV QUARTER 버튼: 첫 스텝이면 숨기고, 그 외에는 표시
      const prevQuarterBtn = scoreboardRoot.querySelector('[data-action="prev-quarter"]');
      if (prevQuarterBtn) {
        prevQuarterBtn.style.display = state.rotation_step > 0 ? '' : 'none';
      }

      const quarterScoreResetBtn = scoreboardRoot.querySelector('[data-action="toggle-quarter-score-reset"]');
      if (quarterScoreResetBtn) {
        const enabled = isQuarterScoreResetEnabled();
        quarterScoreResetBtn.textContent = enabled ? i18nForScoreboard("quarter_reset_on") : i18nForScoreboard("quarter_reset_off");
        quarterScoreResetBtn.classList.toggle("bg-green-50", enabled);
        quarterScoreResetBtn.classList.toggle("text-green-700", enabled);
        quarterScoreResetBtn.classList.toggle("border-green-200", enabled);
        quarterScoreResetBtn.classList.toggle("bg-white", !enabled);
        quarterScoreResetBtn.classList.toggle("text-gray-600", !enabled);
        quarterScoreResetBtn.classList.toggle("border-gray-300", !enabled);
      }

      // 진행 순서 토글 버튼 상태 업데이트
      const progressionBtn = scoreboardRoot.querySelector('[data-action="toggle-progression-mode"]');
      if (progressionBtn) {
        const seq = isSequentialProgression();
        progressionBtn.textContent = seq ? i18nForScoreboard("progression_sequential") : i18nForScoreboard("progression_round_robin");
        progressionBtn.classList.toggle("bg-indigo-50", seq);
        progressionBtn.classList.toggle("text-indigo-700", seq);
        progressionBtn.classList.toggle("border-indigo-200", seq);
        progressionBtn.classList.toggle("bg-gray-50", !seq);
        progressionBtn.classList.toggle("text-gray-600", !seq);
        progressionBtn.classList.toggle("border-gray-200", !seq);
        // 경기 진행 중이면 비활성화
        progressionBtn.disabled = state.rotation_step > 0;
        progressionBtn.classList.toggle("opacity-50", state.rotation_step > 0);
        progressionBtn.classList.toggle("cursor-not-allowed", state.rotation_step > 0);
      }

      const cumulativeViewBtn = scoreboardRoot.querySelector('[data-action="set-quarter-view-cumulative"]');
      const perQuarterViewBtn = scoreboardRoot.querySelector('[data-action="set-quarter-view-per-quarter"]');
      if (cumulativeViewBtn && perQuarterViewBtn) {
        const cumulativeActive = !isPerQuarterScoreView();

        // 누적 버튼: 선택되면 bg-gray-900, 비선택이면 bg-white + hover 효과
        cumulativeViewBtn.classList.toggle("bg-gray-900", cumulativeActive);
        cumulativeViewBtn.classList.toggle("text-white", cumulativeActive);
        cumulativeViewBtn.classList.toggle("bg-white", !cumulativeActive);
        cumulativeViewBtn.classList.toggle("text-gray-500", !cumulativeActive);
        cumulativeViewBtn.classList.toggle("hover:bg-gray-100", !cumulativeActive);

        // 쿼터별 버튼: 선택되면 bg-gray-900, 비선택이면 bg-white + hover 효과
        perQuarterViewBtn.classList.toggle("bg-gray-900", !cumulativeActive);
        perQuarterViewBtn.classList.toggle("text-white", !cumulativeActive);
        perQuarterViewBtn.classList.toggle("bg-white", cumulativeActive);
        perQuarterViewBtn.classList.toggle("text-gray-500", cumulativeActive);
        perQuarterViewBtn.classList.toggle("hover:bg-gray-100", cumulativeActive);
      }

      const addGameBtn = scoreboardRoot.querySelector('[data-action="add-game"]');
      if (addGameBtn) {
        const currentGames = matchupSlots().length;
        const maxGames = 3;
        const canAddGame = teamsCount === 2 && currentGames < maxGames;
        addGameBtn.disabled = !canAddGame;
        addGameBtn.textContent = canAddGame
          ? i18nForScoreboard("add_game_enabled", { current: currentGames, max: maxGames })
          : i18nForScoreboard("add_game_completed", { max: maxGames });
        addGameBtn.classList.toggle("opacity-50", !canAddGame);
        addGameBtn.classList.toggle("cursor-not-allowed", !canAddGame);
      }

      const finishGameBtn = scoreboardRoot.querySelector('[data-action="finish-game"]');
      if (finishGameBtn) {
        const hasRemainingGames = isSequentialProgression() && currentMatchupIndex() < (roundsPerQuarter() - 1);
        finishGameBtn.textContent = hasRemainingGames ? i18nForScoreboard("finish_current_game") : i18nForScoreboard("finish_match");
      }

      const toggleMainBtn = scoreboardRoot.querySelector('[data-action="toggle-main"]');
      if (toggleMainBtn) {
        const span = toggleMainBtn.querySelector('span');
        if (span) span.textContent = state.running ? i18nForScoreboard("main_stop") : i18nForScoreboard("main_start");
        toggleMainBtn.style.backgroundColor = state.running ? '#dc2626' : '#22C55E';
      }

      const toggleShotBtn = scoreboardRoot.querySelector('[data-action="toggle-shot"]');
      if (toggleShotBtn) {
        toggleShotBtn.textContent = state.shot_running ? i18nForScoreboard("main_stop") : i18nForScoreboard("main_start");
        toggleShotBtn.style.backgroundColor = state.shot_running ? '#ef4444' : '#22C55E';
        toggleShotBtn.style.color = '#FFFFFF';
      }

      const possToggleBtn = scoreboardRoot.querySelector('[data-possession-toggle-btn]');
      if (possToggleBtn) {
        const currentPossession = normalizePossession(state.possession, "away");
        // 아이콘을 유지하면서 색상만 변경 (텍스트는 고정: "공격 전환")
        possToggleBtn.style.color = "#FFFFFF";
        possToggleBtn.style.textShadow = "0 1px 1px rgba(0,0,0,0.25)";
        if (currentPossession === "home") {
          possToggleBtn.style.backgroundColor = "#E53935";
          possToggleBtn.style.borderColor = "#E53935";
        } else {
          possToggleBtn.style.backgroundColor = "#2563EB";
          possToggleBtn.style.borderColor = "#2563EB";
        }
      }

      const renderRoster = () => {
        const rosterEl = scoreboardRoot.querySelector("[data-roster-display]");
        if (!rosterEl) return;

        const positionColors = {
          "PG": "#3B82F6",
          "SG": "#8B5CF6",
          "SF": "#10B981",
          "PF": "#F59E0B",
          "C": "#EF4444"
        };

        const getTeamRosterHtml = (team) => {
          if (!team || !team.members || team.members.length === 0) {
            return `<div class="flex-1 flex flex-col gap-4">
                      <div class="flex items-center gap-3 border-b border-gray-100 pb-2 mb-2">
                        <span class="text-2xl">${escapeHtml(team?.icon) || '🛡️'}</span>
                        <span class="font-black text-lg uppercase text-gray-900">${escapeHtml(team?.label) || i18nForScoreboard("team_word")} ${i18nForScoreboard("roster_label")}</span>
                      </div>
                      <div class="text-gray-400 text-sm italic">${i18nForScoreboard("roster_empty")}</div>
                    </div>`;
          }

          const sortedMembers = [...team.members].sort((a, b) => (a.back_number || 999) - (b.back_number || 999));

          return `
              <div class="flex-1 flex flex-col gap-3 min-w-[200px]">
                 <div class="flex items-center gap-2 border-b-2 border-gray-100 pb-2 mb-1">
                    <span class="text-2xl">${escapeHtml(team.icon) || '🛡️'}</span>
                    <span class="font-black text-lg uppercase text-gray-900 truncate">${escapeHtml(team.label)}</span>
                 </div>
                 <div class="grid grid-cols-2 gap-2">
                    ${sortedMembers.map(m => `
                      <div class="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-2 py-2 shadow-sm">
                        <span class="font-bold text-gray-800 text-xs truncate mr-1">${escapeHtml(m.name)}</span>
                        <span class="px-2 py-0.5 rounded-full text-[8px] font-black text-white shadow-sm flex-shrink-0 border border-white/20"
                              style="background-color: ${positionColors[m.position] || '#6B7280'}">
                          ${escapeHtml(m.position) || '?'}
                        </span>
                      </div>
                    `).join('')}
                 </div>
              </div>
            `;
        };

        rosterEl.innerHTML = `
            <div class="flex flex-wrap lg:flex-nowrap gap-8 w-full">
              ${state.teams.map(t => getTeamRosterHtml(t)).join('')}
            </div>
         `;
      };

      // Call Roster Render
      renderRoster();

      const renderQuarterTable = () => {
        const tableContainer = scoreboardRoot.querySelector("[data-quarter-table]");
        if (!tableContainer) return;

        if (state.teams.length < 2) {
          tableContainer.innerHTML = `<p class='text-center text-gray-500'>${i18nForScoreboard("quarter_table_need_teams")}</p>`;
          return;
        }

        const slots = matchupSlots();
        const orderedMatchupIds = normalizeMatchupOrder(state.matchup_order);
        const regularQuarterCount = totalRegularQuarters();
        const quarterHeaderHtml = Array.from({ length: regularQuarterCount }, (_, index) => {
          const quarterNumber = index + 1;
          return `<th class="p-4 w-20">${quarterNumber}Q</th>`;
        }).join("");

        let html = `
           <table class="w-full text-center text-base border-collapse">
             <thead>
               <tr class="bg-gray-100 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-sm">
                 <th class="p-4 text-left">${i18nForScoreboard("quarter_table_matchup")}</th>
                 ${quarterHeaderHtml}
                 <th class="p-4 w-24">${i18nForScoreboard("quarter_table_final")}</th>
               </tr>
             </thead>
             <tbody class="divide-y divide-gray-200" data-matchup-tbody>
         `;

        const activeMatchupIdx = currentMatchupId();
        const currentQ = Number.isFinite(Number(state.quarter)) ? Number(state.quarter) : currentQuarter();

        orderedMatchupIds.forEach((pairIdx) => {
          const slot = slots[pairIdx];
          if (!slot) return;

          const t1 = state.teams[slot.team1Idx];
          const t2 = state.teams[slot.team2Idx];
          if (!t1 || !t2) return;

          const scores = state.quarter_history[pairIdx] || {};
          const finalScore = state.matchup_scores[pairIdx] || { team1: 0, team2: 0 };
          const isActiveRow = pairIdx === activeMatchupIdx;

          const getQuarterScoresForDisplay = (q) => {
            const score = scores[q];
            if (!score) return null;

            const currentTeam1 = Number(score.team1) || 0;
            const currentTeam2 = Number(score.team2) || 0;
            if (!isPerQuarterScoreView()) {
              return { team1: currentTeam1, team2: currentTeam2 };
            }

            const prevScore = scores[q - 1];
            const previousTeam1 = Number(prevScore?.team1) || 0;
            const previousTeam2 = Number(prevScore?.team2) || 0;
            return {
              team1: currentTeam1 - previousTeam1,
              team2: currentTeam2 - previousTeam2
            };
          };

          const getScoreCell = (q) => {
            const displayScore = getQuarterScoresForDisplay(q);
            if (displayScore) {
              const t1Won = displayScore.team1 > displayScore.team2;
              const t2Won = displayScore.team2 > displayScore.team1;
              const t1Class = t1Won ? "font-bold text-[#FF6B35] text-lg" : "font-bold text-gray-900 text-lg";
              const t2Class = t2Won ? "font-bold text-[#FF6B35] text-lg" : "font-bold text-gray-500 text-lg";
              return `<div class="flex flex-col leading-none gap-1">
                             <span class="${t1Class}">${displayScore.team1}</span>
                             <span class="${t2Class}">${displayScore.team2}</span>
                           </div>`;
            }
            return `<span class="text-gray-300 text-lg">-</span>`;
          };

          const getCellClass = (q) => {
            const base = "p-4 ";
            if (isActiveRow && currentQ === q) {
              return base + "bg-blue-50 border-x-2 border-blue-200 ring-2 ring-blue-500/20 z-10 relative";
            }
            return base + (q % 2 === 0 ? "bg-gray-50/50" : "bg-white/50");
          };

          const formatTeamLabel = (label) => {
            const raw = String(label || "").trim();
            return raw || "";
          };

          const getTeamNameStyle = (team, fallbackColor = "#111827") => {
            const rawColor = String(team?.color || "").trim();
            const color = rawColor || fallbackColor;
            const isExplicitWhite = /^(white|#fff|#ffffff)$/i.test(color);

            if (isExplicitWhite || isLightColor(color)) {
              return "color:#111827; text-shadow:0 0 1px #9ca3af;";
            }

            return `color:${color};`;
          };

          const getTeamDotStyle = (team, fallbackColor = "#111827") => {
            const rawColor = String(team?.color || "").trim();
            const color = rawColor || fallbackColor;
            const isExplicitWhite = /^(white|#fff|#ffffff)$/i.test(color);
            const borderColor = (isExplicitWhite || isLightColor(color)) ? "#111827" : color;
            return `background-color:${color}; border-color:${borderColor}; box-shadow:0 1px 3px rgba(15, 23, 42, 0.15);`;
          };

          const getMemberChips = (team) => {
            if (!team || !Array.isArray(team.members) || team.members.length === 0) {
              return `<span class="text-xs text-gray-400 italic">${i18nForScoreboard("roster_empty")}</span>`;
            }

            const sortedMembers = [ ...team.members ].sort((a, b) => (a.back_number || 999) - (b.back_number || 999));
            const names = sortedMembers.map((member) => escapeHtml(member?.name || i18nForScoreboard("member_name_unknown")));
            return `
              <div class="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1">
                ${names.map((name) => `<span class="text-sm font-semibold text-gray-700 shrink-0">${name}</span>`).join('<span class="text-gray-300 shrink-0">·</span>')}
              </div>
            `;
          };

          const quarterCellsHtml = Array.from({ length: regularQuarterCount }, (_, index) => {
            const quarterNumber = index + 1;
            return `<td class="${getCellClass(quarterNumber)}">${getScoreCell(quarterNumber)}</td>`;
          }).join("");

          html += `
               <tr data-matchup-id="${pairIdx}" class="${isActiveRow ? 'bg-gray-100/80 shadow-inner' : 'hover:bg-gray-50'} transition-all duration-300 cursor-move">
                 <td class="p-4 text-left border-l-4 ${isActiveRow ? 'border-blue-500' : 'border-transparent'}">
                   <div class="flex flex-col gap-3">
                     <div class="flex items-center gap-10">
                       <div class="flex items-center gap-3 min-w-[172px]">
                         <span class="inline-flex w-6 h-6 rounded-full border-2 shrink-0" style="${getTeamDotStyle(t1, "#111827")}"></span>
                         <span class="font-black text-base uppercase tracking-tight" style="${getTeamNameStyle(t1, "#111827")}">${escapeHtml(formatTeamLabel(t1.label))}</span>
                       </div>
                       <div class="min-w-0 flex-1">
                         ${getMemberChips(t1)}
                       </div>
                     </div>
                     <div class="flex items-center gap-10">
                       <div class="flex items-center gap-3 min-w-[172px]">
                         <span class="inline-flex w-6 h-6 rounded-full border-2 shrink-0" style="${getTeamDotStyle(t2, "#6B7280")}"></span>
                         <span class="font-black text-base uppercase tracking-tight" style="${getTeamNameStyle(t2, "#6B7280")}">${escapeHtml(formatTeamLabel(t2.label))}</span>
                       </div>
                       <div class="min-w-0 flex-1">
                         ${getMemberChips(t2)}
                       </div>
                     </div>
                   </div>
                 </td>
                 ${quarterCellsHtml}
                 <td class="p-4 font-bold">
                   <div class="flex flex-col leading-none gap-1">
                     <span class="${finalScore.team1 > finalScore.team2 ? 'text-[#FF6B35]' : 'text-gray-900'} text-lg">${finalScore.team1}</span>
                     <span class="${finalScore.team2 > finalScore.team1 ? 'text-[#FF6B35]' : 'text-gray-500'} text-lg">${finalScore.team2}</span>
                   </div>
                 </td>
               </tr>
             `;
        });

        html += `</tbody></table>`;
        tableContainer.innerHTML = html;

        if (role !== "control" || typeof Sortable === "undefined") return;

        const tbody = tableContainer.querySelector("[data-matchup-tbody]");
        if (!tbody) return;

        const rows = tbody.querySelectorAll("tr[data-matchup-id]");
        if (rows.length < 2) return;

        if (matchupSortInstance) {
          matchupSortInstance.destroy();
          matchupSortInstance = null;
        }

        matchupSortInstance = new Sortable(tbody, {
          animation: 150,
          draggable: "tr[data-matchup-id]",
          ghostClass: "opacity-60",
          chosenClass: "ring-2",
          dragClass: "cursor-grabbing",
          onStart: () => {
            isMatchupDragging = true;
          },
          onEnd: () => {
            isMatchupDragging = false;
            const previousMatchupId = currentMatchupId();
            const [prevTeam1Idx, prevTeam2Idx] = matchupPairById(previousMatchupId);
            if (state.teams[prevTeam1Idx] && state.teams[prevTeam2Idx]) {
              state.matchup_scores[previousMatchupId] = {
                team1: state.teams[prevTeam1Idx].score,
                team2: state.teams[prevTeam2Idx].score
              };
              // 이전 경기 파울 저장
              if (!state.matchup_fouls) state.matchup_fouls = [];
              state.matchup_fouls[previousMatchupId] = {
                team1: state.home_fouls || 0,
                team2: state.away_fouls || 0
              };
            }

            const newOrder = Array.from(tbody.querySelectorAll("tr[data-matchup-id]"))
              .map((row) => Number.parseInt(row.dataset.matchupId, 10))
              .filter((index) => Number.isInteger(index));

            state.matchup_order = normalizeMatchupOrder(newOrder);
            syncScoresForActiveMatchup();
            render();
            syncTimers();
            broadcast();
          }
        });
      };

      if (!isMatchupDragging) {
        renderQuarterTable();
      }

      // --- Team Foul Visuals (Control Page) ---
      const updateFoulVisuals = (team, count) => {
        const countEl = scoreboardRoot.querySelector(`[data-${team}-fouls]`);
        const indicatorEl = scoreboardRoot.querySelector(`[data-${team}-team-foul-indicator]`);

        if (countEl) {
          if (count >= 5) {
            countEl.classList.add("text-red-500");
            countEl.classList.remove("text-gray-900");
          } else {
            countEl.classList.remove("text-red-500");
            countEl.classList.add("text-gray-900");
          }
        }


      };

      updateFoulVisuals("home", state.home_fouls || 0);
      updateFoulVisuals("away", state.away_fouls || 0);

      // Display page specific updates
      setTextOrValue("[data-home-score]", home.score);
      setTextOrValue("[data-away-score]", away.score);
      setText("[data-home-fouls-display]", state.home_fouls || 0);
      setText("[data-away-fouls-display]", state.away_fouls || 0);
      setText("[data-scoreboard-quarter-num]", state.quarter);
      setText("[data-home-total]", home.score);
      setText("[data-away-total]", away.score);

      // Update Main Timer Button Text/Style (CSS 클래스 기반)
      const mainToggleBtn = scoreboardRoot.querySelector('[data-action="toggle-main"]');
      if (mainToggleBtn) {
        const span = mainToggleBtn.querySelector('span');
        const svg = mainToggleBtn.querySelector('svg');
        if (state.running) {
          if (span) span.textContent = i18nForScoreboard("main_stop");
          mainToggleBtn.classList.remove("timer-btn-green", "bg-[#22C55E]", "hover:bg-[#15803d]");
          mainToggleBtn.classList.add("timer-btn-red");
          if (svg) svg.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // pause icon
        } else {
          if (span) span.textContent = i18nForScoreboard("main_start");
          mainToggleBtn.classList.remove("timer-btn-red", "bg-[#ef4444]", "hover:bg-[#b91c1c]");
          mainToggleBtn.classList.add("timer-btn-green");
          if (svg) svg.innerHTML = '<path d="M8 5v14l11-7z"/>'; // play icon
        }
      }

      // Update Control timeout indicators
      const updateControlTimeouts = (selector, count) => {
        const container = scoreboardRoot.querySelector(selector);
        if (!container) return;
        const indicators = container.querySelectorAll('[data-timeout]');
        indicators.forEach((ind, idx) => {
          const active = idx < count;
          ind.setAttribute('data-timeout-active', active ? 'true' : 'false');
          ind.querySelector('span').textContent = active ? 'T/O' : '-';
          ind.querySelector('span').className = active ? 'text-yellow-600 font-bold' : 'text-gray-300';
          ind.style.backgroundColor = active ? '#fef3c7' : 'transparent';
        });
      };
      updateControlTimeouts('[data-timeout-indicators-home]', state.home_timeouts || 0);
      updateControlTimeouts('[data-timeout-indicators-away]', state.away_timeouts || 0);

      // Update Shot Clock Toggle Icon/Text with color
      const shotToggleBtn = scoreboardRoot.querySelector('[data-action="toggle-shot"]');
      if (shotToggleBtn) {
        if (state.shot_running) {
          shotToggleBtn.classList.add("btn-active");
          shotToggleBtn.textContent = i18nForScoreboard("main_stop");
          shotToggleBtn.style.backgroundColor = '#ef4444'; // Red for Stop
          shotToggleBtn.style.color = '#FFFFFF';
        } else {
          shotToggleBtn.classList.remove("btn-active");
          shotToggleBtn.textContent = i18nForScoreboard("main_start");
          shotToggleBtn.style.backgroundColor = '#22C55E'; // Green for Start
          shotToggleBtn.style.color = '#FFFFFF';
        }
      }

      const enabled = isAnnouncementsEnabled();

      // 카드형 토글 버튼 (control 페이지)
      const voiceToggleBtn = scoreboardRoot.querySelector(".voice-toggle-btn");
      if (voiceToggleBtn) {
        const statusEl = voiceToggleBtn.querySelector("[data-voice-status]");
        const labelEl = voiceToggleBtn.querySelector("[data-voice-label]");
        const iconEl = voiceToggleBtn.querySelector("[data-voice-icon]");
        if (statusEl) {
          statusEl.textContent = enabled ? "ON" : "OFF";
          statusEl.classList.toggle("bg-blue-500", enabled);
          statusEl.classList.toggle("bg-gray-400", !enabled);
        }
        if (labelEl) {
          labelEl.classList.toggle("text-blue-700", enabled);
          labelEl.classList.toggle("text-gray-500", !enabled);
        }
        if (iconEl) {
          iconEl.classList.toggle("text-blue-500", enabled);
          iconEl.classList.toggle("text-gray-400", !enabled);
        }
        voiceToggleBtn.classList.toggle("border-blue-200", enabled);
        voiceToggleBtn.classList.toggle("bg-blue-50", enabled);
        voiceToggleBtn.classList.toggle("border-gray-200", !enabled);
        voiceToggleBtn.classList.toggle("bg-gray-50", !enabled);
      }

      // 텍스트형 토글 버튼 (기타 페이지)
      const announcementsToggleBtn = scoreboardRoot.querySelector('[data-action="toggle-announcements"]:not(.voice-toggle-btn)');
      if (announcementsToggleBtn) {
        announcementsToggleBtn.textContent = enabled ? i18nForScoreboard("announcements_on") : i18nForScoreboard("announcements_off");
        announcementsToggleBtn.classList.toggle("bg-green-50", enabled);
        announcementsToggleBtn.classList.toggle("text-green-700", enabled);
        announcementsToggleBtn.classList.toggle("border-green-200", enabled);
        announcementsToggleBtn.classList.toggle("bg-gray-100", !enabled);
        announcementsToggleBtn.classList.toggle("text-gray-500", !enabled);
        announcementsToggleBtn.classList.toggle("border-gray-300", !enabled);
      }

      renderPreview();

      // Allow page-specific scripts (e.g. display theme widgets) to react to latest scoreboard state
      document.dispatchEvent(new CustomEvent("scoreboard:updated", {
        detail: { matchId, role, state }
      }));
    };

    const stopMainTimer = () => {
      if (mainTimer) clearInterval(mainTimer);
      mainTimer = null;
      mainLastTickAtMs = null;
    };

    const stopShotTimer = () => {
      if (shotTimer) clearInterval(shotTimer);
      shotTimer = null;
      shotLastTickAtMs = null;
    };

    // HTML5 Audio 기반 버저 (Web Audio API 대신 사용 - 더 안정적)
    // Web Audio API 기반 부저
    let buzzerCtx = null;
    let buzzerCooldownUntil = 0;

    const initBuzzerAudio = () => {
      if (buzzerCtx) return;
      try {
        buzzerCtx = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[Buzzer] AudioContext created, state:', buzzerCtx.state);
      } catch (e) {
        console.error('[Buzzer] AudioContext not supported:', e);
      }
    };

    const resumeBuzzerCtx = () => {
      if (buzzerCtx && buzzerCtx.state === 'suspended') {
        buzzerCtx.resume().then(() => {
          console.log('[Buzzer] AudioContext resumed');
        }).catch(() => {});
      }
    };

    const playBuzzer = () => {
      const now = Date.now();
      console.log('[Buzzer] playBuzzer called, soundEnabled:', isSoundEnabled());

      if (!isSoundEnabled()) return;

      if (now < buzzerCooldownUntil) {
        console.log('[Buzzer] In cooldown, skipping');
        return;
      }
      buzzerCooldownUntil = now + 3000;

      // 진행 중인 TTS 음성 즉시 중단 — 부저와 음성이 겹쳐서 소리가 달라지는 문제 방지
      if (window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
        window.speechSynthesis.cancel();
      }
      lastSpokenCountdown = -1;

      if (!buzzerCtx) initBuzzerAudio();
      if (!buzzerCtx) {
        console.error('[Buzzer] No AudioContext');
        return;
      }

      // suspended 상태면 resume 후 재생 (지연 방지)
      if (buzzerCtx.state === 'suspended') {
        buzzerCtx.resume().then(() => {
          _playBuzzerSound();
        }).catch(() => {});
        return;
      }

      _playBuzzerSound();
    };

    const _playBuzzerSound = () => {
      try {
        // 440Hz 사각파 2초 + 페이드아웃 (경기장용 큰 소리)
        const osc = buzzerCtx.createOscillator();
        const gain = buzzerCtx.createGain();
        osc.connect(gain);
        gain.connect(buzzerCtx.destination);

        osc.type = 'square';
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(1.0, buzzerCtx.currentTime);
        gain.gain.setValueAtTime(1.0, buzzerCtx.currentTime + 1.5);
        gain.gain.exponentialRampToValueAtTime(0.01, buzzerCtx.currentTime + 2.0);

        osc.start(buzzerCtx.currentTime);
        osc.stop(buzzerCtx.currentTime + 2.0);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };

        console.log('[Buzzer] Playing via Web Audio API');
      } catch (e) {
        console.error('[Buzzer] Play error:', e);
      }
    };

    // Returns elapsed time in seconds (with decimals for precision)
    const consumeElapsedTime = (lastTickAtMs, usePrecision = false) => {
      const now = Date.now();
      if (!Number.isFinite(lastTickAtMs) || lastTickAtMs <= 0) {
        return { elapsedTime: 0, nextTickAtMs: now };
      }

      const elapsedMs = now - lastTickAtMs;
      if (usePrecision) {
        // Return precise elapsed time in seconds (with decimals)
        const elapsedTime = elapsedMs / 1000;
        if (elapsedTime < 0.01) {
          return { elapsedTime: 0, nextTickAtMs: lastTickAtMs };
        }
        return { elapsedTime, nextTickAtMs: now };
      } else {
        // Return whole seconds only (original behavior)
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        if (elapsedSeconds <= 0) {
          return { elapsedTime: 0, nextTickAtMs: lastTickAtMs };
        }
        return { elapsedTime: elapsedSeconds, nextTickAtMs: lastTickAtMs + (elapsedSeconds * 1000) };
      }
    };

    // Legacy function for backward compatibility
    const consumeElapsedSeconds = (lastTickAtMs) => {
      const now = Date.now();
      if (!Number.isFinite(lastTickAtMs) || lastTickAtMs <= 0) {
        return { elapsedSeconds: 0, nextTickAtMs: now };
      }

      const elapsedSeconds = Math.floor((now - lastTickAtMs) / 1000);
      if (elapsedSeconds <= 0) {
        return { elapsedSeconds: 0, nextTickAtMs: lastTickAtMs };
      }

      return {
        elapsedSeconds,
        nextTickAtMs: lastTickAtMs + (elapsedSeconds * 1000)
      };
    };

    const speakCountdownIfNeeded = (previousSeconds, nextSeconds) => {
      if (nextSeconds >= previousSeconds) return;
      if (previousSeconds <= 0) return;
      if (nextSeconds > 5) return; // 5초 구간 밖이면 안 읽음

      // 샷클락이 작동 중이면 메인 타이머 카운트다운 음성 건너뛰기
      // (샷클락 카운트다운과 겹쳐서 뒤죽박죽 되는 문제 방지)
      if (state.shot_running && state.shot_seconds > 0) return;

      // 화면에 보이던 숫자를 읽음: 5→4 전환 시 "5", 1→0 전환 시 "1"
      // 큰 수에서 한번에 5 이하로 점프 시에도 "5" 읽음
      const speakTarget = previousSeconds > 5 ? 5 : previousSeconds;
      if (speakTarget >= 1 && speakTarget <= 5) {
        speak(speakTarget);
      }
    };

    const startMainTimer = () => {
      if (mainTimer) return;
      // 타이머 시작 시 AudioContext 선제적 resume (5초 카운트다운/부저 지연 방지)
      if (buzzerCtx && buzzerCtx.state === 'suspended') buzzerCtx.resume().catch(() => {});
      if (ttsAudioCtx && ttsAudioCtx.state === 'suspended') ttsAudioCtx.resume().catch(() => {});
      mainLastTickAtMs = Date.now();
      mainTimer = setInterval(() => {
        const currentSeconds = Math.max(0, Number.parseFloat(state.period_seconds) || 0);
        const usePrecision = currentSeconds < 60; // Use precision timing under 1 minute

        const { elapsedTime, nextTickAtMs } = consumeElapsedTime(mainLastTickAtMs, usePrecision);
        mainLastTickAtMs = nextTickAtMs;
        if (elapsedTime <= 0) return;

        const previousSeconds = currentSeconds;
        const nextSeconds = Math.max(0, previousSeconds - elapsedTime);

        // Round to 2 decimal places for precision mode, otherwise keep as integer-ish
        state.period_seconds = usePrecision ? Math.round(nextSeconds * 100) / 100 : Math.floor(nextSeconds);

        // Speak countdown only on whole second boundaries
        const prevWholeSecond = Math.floor(previousSeconds);
        const nextWholeSecond = Math.floor(nextSeconds);
        if (prevWholeSecond !== nextWholeSecond) {
          speakCountdownIfNeeded(prevWholeSecond, nextWholeSecond);
        }

        if (nextSeconds <= 0) {
          state.period_seconds = 0;
          state.running = false;
          state.shot_running = false;
          stopMainTimer();
          stopShotTimer();
          playBuzzer();
        }

        // Update timer reference for display sync
        state.main_ref_at_ms = Date.now();
        state.main_ref_value = state.period_seconds;

        render();
        broadcast();
      }, 100); // 100ms interval for smooth centisecond display
    };

    const startShotTimer = () => {
      if (shotTimer) return; // Already running
      // Don't start if shot clock is expired or nearly expired
      if (state.shot_seconds < 0.1) {
        state.shot_running = false;
        return;
      }
      shotLastTickAtMs = Date.now();
      // Ensure reference values are set for display sync
      if (!state.shot_ref_at_ms || state.shot_ref_at_ms === 0) {
        state.shot_ref_at_ms = shotLastTickAtMs;
        state.shot_ref_value = state.shot_seconds;
      }
      let lastBroadcastSec = Math.floor(state.shot_seconds);
      shotTimer = setInterval(() => {
        const currentSeconds = Math.max(0, Number.parseFloat(state.shot_seconds) || 0);

        // Use same logic as main timer - consumeElapsedTime with precision mode
        const { elapsedTime, nextTickAtMs } = consumeElapsedTime(shotLastTickAtMs, true);
        shotLastTickAtMs = nextTickAtMs;
        if (elapsedTime <= 0) return;

        const previousSeconds = currentSeconds;
        const nextSeconds = Math.max(0, previousSeconds - elapsedTime);

        // Round to 2 decimal places for precision display
        state.shot_seconds = Math.round(nextSeconds * 100) / 100;

        // 음성 카운트다운: floor가 변경될 때 이전 숫자(보이던 숫자)를 읽음
        // 5→4 전환 시 "5", 1→0 전환 시 "1"
        const prevFloor = Math.floor(previousSeconds);
        const nextFloor = Math.floor(nextSeconds);

        if (prevFloor !== nextFloor && nextFloor <= 5) {
          const speakTarget = prevFloor > 5 ? 5 : prevFloor;
          if (speakTarget >= 1 && speakTarget <= 5) {
            speak(speakTarget);
          }
        }

        // 0.05초 미만이면 0으로 처리하고 버저 울림 (부동소수점 오차 방지)
        if (nextSeconds < 0.05) {
          state.shot_seconds = 0;
          state.shot_running = false;
          stopShotTimer();
          console.log('[ShotClock] Timer expired, playing buzzer');
          playBuzzer();

          // 경기 시간 < 14초이면 샷클락 비활성화 (14초 리셋도 불가능한 상황)
          if (state.period_seconds < 14) {
            state.shot_seconds = -1;
          }
        }

        // Update shot timer reference for display sync
        state.shot_ref_at_ms = Date.now();
        state.shot_ref_value = state.shot_seconds;

        render();
        // 5초 미만일 때는 100ms마다 브로드캐스트, 그 외에는 표시되는 정수 초 변경 시에만
        const nextFloorSec = Math.floor(nextSeconds);
        if (state.shot_seconds < 5 || lastBroadcastSec !== nextFloorSec) {
          lastBroadcastSec = nextFloorSec;
          broadcast();
        }
      }, 100); // 100ms interval for smooth decimal display
    };

    // Track last spoken countdown to avoid duplicates
    let lastSpokenCountdown = -1;

    // ── TTS Audio 플레이어 (AudioContext 기반 — 끊김 없는 연속 재생) ──
    const TTS_AUDIO_BASE = "/audio/tts";
    const ttsBufferCache = {}; // { "ko/5": AudioBuffer }
    let ttsAvailable = null;   // null=미확인, true/false
    let ttsAudioCtx = null;    // lazy init (브라우저 autoplay 정책 대응)

    const getTtsContext = () => {
      if (!ttsAudioCtx) {
        ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (ttsAudioCtx.state === "suspended") {
        // resume()이 완료될 때까지 기다리지 않지만, 캐시해두어 반복 호출 방지
        ttsAudioCtx.resume().catch(() => {});
      }
      return ttsAudioCtx;
    };

    // AudioContext resume을 확실히 완료한 뒤 반환 (점수 안내처럼 즉시 재생이 필요한 곳용)
    const ensureTtsContext = async () => {
      const ctx = getTtsContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      return ctx;
    };

    // mp3 파일 존재 여부 확인 (최초 1회, 한국어는 Web Speech API 사용)
    const checkTtsAvailability = () => {
      if (ttsAvailable !== null) return Promise.resolve(ttsAvailable);
      if (uiLocale === "ko") { ttsAvailable = false; return Promise.resolve(false); }
      const testUrl = `${TTS_AUDIO_BASE}/${uiLocale}/vs.mp3`;
      return fetch(testUrl, { method: "HEAD" })
        .then((r) => { ttsAvailable = r.ok; return ttsAvailable; })
        .catch(() => { ttsAvailable = false; return false; });
    };

    // AudioBuffer에서 앞뒤 무음 제거 (mp3 인코더 패딩 제거)
    const trimSilence = (buffer, threshold = 0.01) => {
      const ctx = getTtsContext();
      const data = buffer.getChannelData(0);
      const len = data.length;
      const margin = Math.floor(buffer.sampleRate * 0.005); // 5ms 여유

      let start = 0;
      for (let i = 0; i < len; i++) {
        if (Math.abs(data[i]) > threshold) { start = Math.max(0, i - margin); break; }
      }
      let end = len - 1;
      for (let i = len - 1; i >= start; i--) {
        if (Math.abs(data[i]) > threshold) { end = Math.min(len - 1, i + margin); break; }
      }

      const trimLen = end - start + 1;
      if (trimLen >= len * 0.9) return buffer; // 거의 안 잘리면 원본 반환

      const trimmed = ctx.createBuffer(buffer.numberOfChannels, trimLen, buffer.sampleRate);
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        trimmed.getChannelData(ch).set(buffer.getChannelData(ch).subarray(start, end + 1));
      }
      return trimmed;
    };

    // mp3 → AudioBuffer 로드, 무음 제거, 캐싱
    const loadTtsBuffer = async (locale, filename) => {
      const key = `${locale}/${filename}`;
      if (ttsBufferCache[key]) return ttsBufferCache[key];
      const url = `${TTS_AUDIO_BASE}/${key}.mp3`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`TTS fetch failed: ${url}`);
      const arrayBuf = await response.arrayBuffer();
      const raw = await getTtsContext().decodeAudioData(arrayBuf);
      const audioBuffer = trimSilence(raw);
      ttsBufferCache[key] = audioBuffer;
      return audioBuffer;
    };

    // AudioBuffer 단일 재생 (Promise)
    const playTtsBuffer = (buffer) => {
      return new Promise((resolve, reject) => {
        try {
          const ctx = getTtsContext();
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.onended = resolve;
          source.start();
        } catch (e) { reject(e); }
      });
    };

    // 여러 AudioBuffer를 끊김 없이 연속 재생
    const playTtsBuffersSeamless = (buffers) => {
      return new Promise((resolve, reject) => {
        try {
          const ctx = getTtsContext();
          let startTime = ctx.currentTime;
          buffers.forEach((buf, i) => {
            const source = ctx.createBufferSource();
            source.buffer = buf;
            source.connect(ctx.destination);
            if (i === buffers.length - 1) source.onended = resolve;
            source.start(startTime);
            startTime += buf.duration;
          });
        } catch (e) { reject(e); }
      });
    };

    // 점수 안내: [home] + [vs] + [away] 끊김 없는 연속 재생
    const playScoreAnnouncement = async (homeScore, awayScore) => {
      await ensureTtsContext(); // suspended 상태 해제 대기
      const locale = uiLocale;
      const home = Math.min(Math.max(0, homeScore), 50);
      const away = Math.min(Math.max(0, awayScore), 50);
      const buffers = await Promise.all([
        loadTtsBuffer(locale, String(home)),
        loadTtsBuffer(locale, "vs"),
        loadTtsBuffer(locale, String(away))
      ]);
      await playTtsBuffersSeamless(buffers);
    };

    // 카운트다운 mp3 재생
    const playCountdownAudio = async (count) => {
      await ensureTtsContext(); // suspended 상태 해제 대기
      const buffer = await loadTtsBuffer(uiLocale, `countdown_${count}`);
      await playTtsBuffer(buffer);
    };

    // TTS 가용성 확인 + 프리로드
    checkTtsAvailability().then((available) => {
      console.log("🔊 TTS Audio available:", available);
      if (available) {
        // 자주 쓰는 파일 미리 디코딩
        [1, 2, 3, 4, 5].forEach((n) => loadTtsBuffer(uiLocale, `countdown_${n}`).catch(() => {}));
        loadTtsBuffer(uiLocale, "vs").catch(() => {});
      }
    });
    // ── TTS Audio 플레이어 끝 ──────────────────────────────

    // 플랫폼 감지
    const isMac = /Macintosh|MacIntel|MacPPC|Mac68K/i.test(navigator.userAgent);
    const isWindows = /Win/i.test(navigator.userAgent);
    const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edge|Edg/i.test(navigator.userAgent);
    const platform = isMac ? "mac" : isWindows ? "win" : "other";
    console.log("🔊 Voice platform:", platform, isChrome ? "(Chrome)" : "(non-Chrome)");

    const safeSpeak = (utterance) => {
      if (!window.speechSynthesis) return;

      if (platform === "mac" && isChrome) {
        // Mac Chrome: cancel() 후 즉시 speak() 하면 무시되는 버그 우회
        // cancel 후 짧은 딜레이를 줘야 음성이 재생됨
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
          setTimeout(() => window.speechSynthesis.speak(utterance), 50);
        } else {
          window.speechSynthesis.speak(utterance);
        }
      } else {
        // Windows/기타: 기존 로직
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
        window.speechSynthesis.speak(utterance);
      }
    };

    // 음성 선택: 품질 점수 기반 (Premium > Google > 일반 순)
    let cachedBestVoice = null;
    let cachedVoiceLang = null;

    const scoreVoice = (v) => {
      const name = (v.name || "").toLowerCase();
      let score = 0;
      // Premium/Enhanced/Natural 키워드 = 최고 품질 (macOS 다운로드 음성)
      if (/premium|enhanced|natural/.test(name)) score += 100;
      // Google 음성 = 자연스러운 품질 (인터넷 필요)
      if (/^google/.test(name)) score += 80;
      // 원격 음성 = 일반적으로 로컬보다 고품질
      if (v.localService === false) score += 30;
      // Compact 음성 = 저품질
      if (/compact/.test(name)) score -= 50;
      return score;
    };

    const selectBestVoice = (langPrefix) => {
      if (cachedBestVoice && cachedVoiceLang === langPrefix) return cachedBestVoice;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return null;

      const matching = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith(langPrefix));
      if (matching.length === 0) return null;

      // 품질 점수 내림차순 정렬 후 최고 품질 선택
      const sorted = [...matching].sort((a, b) => scoreVoice(b) - scoreVoice(a));
      const selected = sorted[0];

      if (selected) {
        cachedBestVoice = selected;
        cachedVoiceLang = langPrefix;
        console.log("🔊 Selected voice:", selected.name, selected.lang, "score:", scoreVoice(selected), "(platform:", platform + ")");
      }

      return selected;
    };

    // 음성 목록이 변경되면 캐시 초기화
    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener("voiceschanged", () => {
        cachedBestVoice = null;
        cachedVoiceLang = null;
      });
    }

    const speak = (text) => {
      if (!isVoiceEnabled()) return;

      // Avoid speaking the same number twice in a row
      const numText = Number(text);
      if (numText === lastSpokenCountdown) return;
      lastSpokenCountdown = numText;

      // Reset tracker when countdown resets
      setTimeout(() => {
        if (lastSpokenCountdown === numText) {
          lastSpokenCountdown = -1;
        }
      }, 2000);

      // 1순위: TTS Audio (mp3) — 한국어는 Web Speech API가 더 자연스러움
      if (ttsAvailable && uiLocale !== "ko" && numText >= 1 && numText <= 5) {
        playCountdownAudio(numText).catch(() => {
          speakWithWebSpeechAPI(text);
        });
        return;
      }

      // 2순위: Web Speech API
      speakWithWebSpeechAPI(text);
    };

    // Web Speech API 카운트다운 (폴백)
    const speakWithWebSpeechAPI = (text) => {
      if (!("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(i18nForScoreboard("voice_countdown_pattern", { count: text }));
      utterance.lang = scoreboardVoiceLang;
      utterance.rate = currentVoiceRate();
      utterance.volume = 1.0;

      const langPrefix = String(scoreboardVoiceLang || "").toLowerCase().split("-")[0];
      const bestVoice = selectBestVoice(langPrefix);
      if (bestVoice) utterance.voice = bestVoice;

      safeSpeak(utterance);
    };


    const syncTimers = () => {
      if (role !== "control") return;

      // Main timer: always ensure correct state
      if (state.running) {
        startMainTimer();
      } else {
        stopMainTimer(); // Always call stop when not running (safe if already stopped)
      }

      // Shot timer: always ensure correct state
      // Note: startShotTimer() has its own check for nearly-expired values
      if (state.shot_running) {
        startShotTimer();
      } else {
        stopShotTimer(); // Always call stop when not running (safe if already stopped)
      }
    };

    // Display-only: smooth timer interpolation using reference timestamps
    const startDisplayTimerSync = () => {
      if (role !== "display") return;
      if (displayAnimFrame) return;

      let prevMainValue = -1;
      let prevShotValue = -1;

      const updateDisplayTimers = () => {
        if (!state) {
          displayAnimFrame = requestAnimationFrame(updateDisplayTimers);
          return;
        }

        const now = Date.now();

        // Interpolate main timer (모든 반응형 타이머 요소 업데이트)
        const timerEls = scoreboardRoot.querySelectorAll("[data-scoreboard-timer]");
        if (timerEls.length > 0) {
          let timerText;
          let currentMainValue;
          if (state.running && state.main_ref_at_ms > 0) {
            const elapsed = (now - state.main_ref_at_ms) / 1000;
            currentMainValue = Math.max(0, state.main_ref_value - elapsed);
            timerText = formatTime(currentMainValue);
          } else {
            currentMainValue = state.period_seconds;
            timerText = formatTime(currentMainValue);
          }
          timerEls.forEach(el => { el.textContent = timerText; });

          // 경기 타이머가 0에 도달하면 부저
          if (prevMainValue > 0 && currentMainValue <= 0) {
            playBuzzer();
          }
          prevMainValue = currentMainValue;
        }

        // Interpolate shot timer (모든 반응형 샷클락 요소 업데이트)
        const shotEls = scoreboardRoot.querySelectorAll("[data-scoreboard-shot]");
        if (shotEls.length > 0) {
          let shotText;
          let currentShotValue;
          if (state.shot_running && state.shot_ref_at_ms > 0 && state.shot_seconds > 0) {
            const elapsed = (now - state.shot_ref_at_ms) / 1000;
            currentShotValue = Math.max(0, state.shot_ref_value - elapsed);
            if (currentShotValue < 5 && currentShotValue > 0) {
              shotText = currentShotValue.toFixed(1);
            } else {
              shotText = Math.floor(currentShotValue);
            }
          } else {
            currentShotValue = state.shot_seconds;
            if (currentShotValue < 0) {
              shotText = "--";
            } else if (currentShotValue < 5 && currentShotValue > 0) {
              shotText = Number(currentShotValue).toFixed(1);
            } else {
              shotText = Math.floor(currentShotValue);
            }
          }
          shotEls.forEach(el => { el.textContent = shotText; });

          // 샷클락이 0에 도달하면 부저
          if (prevShotValue > 0.05 && currentShotValue <= 0.05 && currentShotValue >= 0) {
            playBuzzer();
          }
          prevShotValue = currentShotValue;
        }

        displayAnimFrame = requestAnimationFrame(updateDisplayTimers);
      };

      displayAnimFrame = requestAnimationFrame(updateDisplayTimers);
    };

    const refreshLocalStateVersion = (sourceState = state) => {
      localStateVersion = Math.max(localStateVersion, parseStateVersion(sourceState?.state_version, 0));
    };

    const stampStateForBroadcast = () => {
      if (!state || typeof state !== "object") return;
      localStateVersion = Math.max(localStateVersion, parseStateVersion(state.state_version, 0)) + 1;
      state.state_version = localStateVersion;
      state.updated_at_ms = Date.now();
      state.source_client_id = localClientId;
    };

    const shouldApplyIncomingState = (incomingState) => {
      if (!state) return true;

      // 자기 자신이 보낸 state 에코는 무시 (타이머 롤백 방지)
      if (role === "control" && incomingState?.source_client_id === localClientId) {
        return false;
      }

      const currentVersion = parseStateVersion(state.state_version, 0);
      const incomingVersion = parseStateVersion(incomingState?.state_version, 0);
      if (incomingVersion > currentVersion) return true;
      if (incomingVersion < currentVersion) return false;

      const currentUpdatedAt = parseUpdatedAtMs(state.updated_at_ms, 0);
      const incomingUpdatedAt = parseUpdatedAtMs(incomingState?.updated_at_ms, 0);
      if (incomingUpdatedAt > currentUpdatedAt) return true;
      if (incomingUpdatedAt < currentUpdatedAt) return false;

      return true;
    };

    const broadcast = () => {
      if (role !== "control") return;
      stampStateForBroadcast();
      // WebSocket이 연결되어 있으면 서버 경유 동기화
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify({ action: "update", payload: state });
        socket.send(JSON.stringify({ command: "message", identifier, data: payload }));
      }
      // BroadcastChannel로 같은 기기 내 탭 간 직접 동기화 (오프라인에서도 동작)
      if (bcChannel) {
        try { bcChannel.postMessage({ type: "state", payload: state }); } catch (e) { /* ignore */ }
      }
    };

    // Voice initialization flag to bypass browser autoplay policy
    let voiceInitialized = false;

    const initializeVoice = () => {
      if (!isVoiceEnabled() || !("speechSynthesis" in window)) return;
      if (voiceInitialized) return;

      if (platform === "mac" && isChrome) {
        // Mac Chrome: 무음 재생 + 음성 목록 미리 로드
        const silent = new SpeechSynthesisUtterance("");
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
        // Mac Chrome은 음성 목록 로딩이 늦을 수 있으므로 미리 트리거
        window.speechSynthesis.getVoices();
        console.log("🔊 Voice initialized (Mac Chrome mode)");
      } else {
        // Windows/기타: 기존 무음 초기화
        const silent = new SpeechSynthesisUtterance("");
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
      }
      voiceInitialized = true;
    };

    const toSinoKoreanNumber = (value) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return "영";

      const number = Math.max(0, Math.min(parsed, 999));
      if (number === 0) return "영";

      const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
      const hundreds = Math.floor(number / 100);
      const tens = Math.floor((number % 100) / 10);
      const ones = number % 10;
      let result = "";

      if (hundreds > 0) {
        result += hundreds === 1 ? "백" : `${digits[hundreds]}백`;
      }

      if (tens > 0) {
        result += tens === 1 ? "십" : `${digits[tens]}십`;
      }

      if (ones > 0) {
        result += digits[ones];
      }

      return result;
    };

    const spokenNumber = (value) => {
      if (uiLocale === "ko") return toSinoKoreanNumber(value);
      return String(Math.max(0, Number.parseInt(value, 10) || 0));
    };

    // Debounce for score announcements to prevent rapid-fire cancellations
    let speakScoreTimeout = null;

    const speakScore = () => {
      if (!isVoiceEnabled()) {
        return;
      }

      // TTS Audio도 Web Speech API도 없으면 종료
      if (!ttsAvailable && !window.speechSynthesis) {
        return;
      }

      if (role !== "control") {
        console.log("🔇 Not control role:", role);
        return;
      }

      // Debounce: if called multiple times quickly, only speak the latest score
      if (speakScoreTimeout) {
        clearTimeout(speakScoreTimeout);
      }

      speakScoreTimeout = setTimeout(() => {
        speakScoreTimeout = null;
        doSpeakScore();
      }, 50); // 50ms debounce
    };

    const doSpeakScore = () => {
      const [visualHome, visualAway] = currentMatchup();
      const homeScore = visualHome.score;
      const awayScore = visualAway.score;

      // 진행 중인 카운트다운 음성 즉시 취소 — 점수 안내가 우선
      if (window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
        window.speechSynthesis.cancel();
      }
      lastSpokenCountdown = -1;

      // 1순위: TTS Audio (mp3 연결 재생) — 한국어는 Web Speech API 사용
      if (ttsAvailable && uiLocale !== "ko" && homeScore <= 50 && awayScore <= 50) {
        console.log("🔊 TTS Audio score:", homeScore, "vs", awayScore);
        playScoreAnnouncement(homeScore, awayScore).catch(() => {
          console.warn("🔊 TTS Audio failed, falling back to Web Speech API");
          doSpeakScoreWithWebSpeechAPI(homeScore, awayScore);
        });
        return;
      }

      // 2순위: Web Speech API
      doSpeakScoreWithWebSpeechAPI(homeScore, awayScore);
    };

    // Web Speech API 점수 안내 (폴백)
    const doSpeakScoreWithWebSpeechAPI = (homeScore, awayScore) => {
      initializeVoice();

      const homeScoreText = spokenNumber(homeScore);
      const awayScoreText = spokenNumber(awayScore);
      const text = i18nForScoreboard("voice_score_pattern", { home: homeScoreText, away: awayScoreText });

      console.log("🔊 Web Speech API score:", text);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = scoreboardVoiceLang;
      utterance.rate = currentVoiceRate();
      utterance.volume = 1.0;
      utterance.pitch = 1.0;

      const speakWithVoice = () => {
        const langPrefix = String(scoreboardVoiceLang || "").toLowerCase().split("-")[0];
        const bestVoice = selectBestVoice(langPrefix);
        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        utterance.onerror = (event) => {
          if (event.error !== "canceled") {
            console.error("❌ Speech error:", event.error, event);
          }
        };

        safeSpeak(utterance);
      };

      // 음성 목록이 이미 로드되었거나 없어도 바로 재생 시도 (지연 방지)
      speakWithVoice();
    };

    const normalizeScoreValue = (rawValue) => {
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed < 0) return 0;
      return Math.min(parsed, 999);
    };

    const setScoreByVisualSide = (side, rawValue) => {
      const [visualHome, visualAway] = currentMatchup();
      const homeIdx = state.teams.findIndex((team) => team.id === visualHome.id);
      const awayIdx = state.teams.findIndex((team) => team.id === visualAway.id);
      if (homeIdx < 0 || awayIdx < 0) return false;

      const nextScore = normalizeScoreValue(rawValue);
      if (side === "home") {
        state.teams[homeIdx].score = nextScore;
      } else {
        state.teams[awayIdx].score = nextScore;
      }

      return true;
    };

    const appendMatchupSlotForGame = (gameData) => {
      const sourceTeams = Array.isArray(state?.teams) && state.teams.length >= 2 ? state.teams : defaultTeams();
      const nextGameId = gameData?.id ?? null;
      const team1Idx = sourceTeams.findIndex((team) => String(team?.id) === String(gameData?.home_team_id));
      const team2Idx = sourceTeams.findIndex((team) => String(team?.id) === String(gameData?.away_team_id));
      if (team1Idx < 0 || team2Idx < 0) return false;

      const currentSlots = matchupSlots();
      if (currentSlots.some((slot) => String(slot.gameId) === String(nextGameId))) return false;

      const nextSlots = [
        ...currentSlots,
        { id: currentSlots.length, gameId: nextGameId, team1Idx, team2Idx }
      ];

      state.matchup_slots = serializeMatchupSlots(nextSlots);
      state.matchup_scores = nextSlots.map((_, index) => {
        const row = state.matchup_scores?.[index];
        return {
          team1: Number.isFinite(Number(row?.team1)) ? Number(row.team1) : 0,
          team2: Number.isFinite(Number(row?.team2)) ? Number(row.team2) : 0
        };
      });
      state.matchup_order = normalizeMatchupOrder(state.matchup_order, defaultMatchupOrder(nextSlots));
      return true;
    };

    const handleTeamAction = (action) => {
      // "Home" action targets the Visually Left team
      // "Away" action targets the Visually Right team
      const [visualHome, visualAway] = currentMatchup();

      // We need to find the real index of these teams in state.teams
      // visualHome might be Team A (index 0) or Team B (index 1) depending on swap
      const homeIdx = state.teams.findIndex(t => t.id === visualHome.id);
      const awayIdx = state.teams.findIndex(t => t.id === visualAway.id);
      if (homeIdx < 0 || awayIdx < 0) return;

      const isScoreAddAction = ["add-home", "add-home-1", "add-home-2", "add-home-3",
                                "add-away", "add-away-1", "add-away-2", "add-away-3"].includes(action);

      // 득점 시 AudioContext를 선제적으로 resume (음성 안내 지연 방지)
      if (isScoreAddAction && ttsAudioCtx && ttsAudioCtx.state === "suspended") {
        ttsAudioCtx.resume().catch(() => {});
      }

      if (action === "add-home") state.teams[homeIdx].score += 1;
      else if (action === "sub-home") state.teams[homeIdx].score = Math.max(0, state.teams[homeIdx].score - 1);
      else if (action === "add-home-1") state.teams[homeIdx].score += 1;
      else if (action === "add-home-2") state.teams[homeIdx].score += 2;
      else if (action === "add-home-3") state.teams[homeIdx].score += 3;
      else if (action === "reset-home-score") { if (!confirm(i18nForScoreboard("confirm_reset_score"))) return; state.teams[homeIdx].score = 0; }
      else if (action === "add-away") state.teams[awayIdx].score += 1;
      else if (action === "sub-away") state.teams[awayIdx].score = Math.max(0, state.teams[awayIdx].score - 1);
      else if (action === "add-away-1") state.teams[awayIdx].score += 1;
      else if (action === "add-away-2") state.teams[awayIdx].score += 2;
      else if (action === "add-away-3") state.teams[awayIdx].score += 3;
      else if (action === "reset-away-score") { if (!confirm(i18nForScoreboard("confirm_reset_score"))) return; state.teams[awayIdx].score = 0; }

      // 득점 시 샷클락 리셋
      if (isScoreAddAction) {
        if (state.period_seconds >= 24) {
          state.shot_seconds = SHOT_CLOCK_24;
        } else {
          state.shot_seconds = -1;
        }
        state.shot_running = false;
      }
    };

    const attachControlHandlers = () => {
      if (role !== "control") return;

      const bindDirectScoreInput = (selector, side) => {
        const input = scoreboardRoot.querySelector(selector);
        if (!input || input.dataset.scoreInputBound === "true") return;
        input.dataset.scoreInputBound = "true";

        const commit = (announce) => {
          if (!setScoreByVisualSide(side, input.value)) return;
          render();
          broadcast();
          if (announce) {
            speakScore();
          }
        };

        input.addEventListener("change", () => {
          commit(true);
        });

        input.addEventListener("blur", () => {
          if (input.value === "") {
            input.value = "0";
            commit(false);
          }
        });

        input.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          input.blur();
        });
      };

      bindDirectScoreInput("[data-home-score-input]", "home");
      bindDirectScoreInput("[data-away-score-input]", "away");

      scoreboardRoot.querySelectorAll("[data-action]").forEach((btn) => {
        // 이미 핸들러가 등록된 버튼은 건너뛰기 (중복 등록 방지)
        if (btn.dataset.handlerAttached === "true") return;
        btn.dataset.handlerAttached = "true";

        btn.addEventListener("click", () => {
          // Initialize and resume buzzer audio on first user interaction
          initBuzzerAudio();
          resumeBuzzerCtx();

          const action = btn.dataset.action;
          if (["add-home", "add-home-1", "add-home-2", "add-home-3",
            "sub-home", "reset-home-score",
            "add-away", "add-away-1", "add-away-2", "add-away-3",
            "sub-away", "reset-away-score"].includes(action)) {
            handleTeamAction(action);
            render();
            broadcast();
            // Speak after render to ensure scores are updated
            speakScore();
          } else {
            switch (action) {
              case "toggle-main": {
                const now = Date.now();
                state.running = !state.running;
                if (state.running) {
                  // Update timer references for sync
                  state.main_ref_at_ms = now;
                  state.main_ref_value = state.period_seconds;
                  // Start shot clock together if it has a valid value (> 0.1 to handle floating point)
                  if (state.shot_seconds >= 0.1) {
                    state.shot_running = true;
                    state.shot_ref_at_ms = now;
                    state.shot_ref_value = state.shot_seconds;
                  } else {
                    // Shot clock expired or disabled - ensure it stays stopped
                    state.shot_running = false;
                  }
                } else {
                  // Stopping main timer - always stop shot clock too
                  state.shot_running = false;
                  // Preserve shot clock reference for when we resume
                  if (state.shot_seconds > 0) {
                    state.shot_ref_value = state.shot_seconds;
                  }
                }
                break;
              }
              case "pause-main":
                state.running = false;
                state.shot_running = false;
                break;
              case "reset-main":
                if (!confirm(i18nForScoreboard("confirm_reset_timer"))) return;
                state.period_seconds = defaultPeriodSeconds;
                state.main_ref_value = defaultPeriodSeconds;
                state.running = false;
                state.shot_running = false;
                break;
              case "reset-all":
                if (confirm(i18nForScoreboard("confirm_reset_all"))) {
                  state.period_seconds = defaultPeriodSeconds;
                  state.shot_seconds = SHOT_CLOCK_24;
                  state.main_ref_value = defaultPeriodSeconds;
                  state.shot_ref_value = SHOT_CLOCK_24;
                  state.running = false;
                  state.shot_running = false;
                  state.home_fouls = 0;
                  state.away_fouls = 0;
                  state.home_timeouts = 0;
                  state.away_timeouts = 0;
                  state.teams.forEach(t => t.score = 0);
                }
                break;
              case "exit-scoreboard": {
                const confirmMsg = btn.dataset.confirmMessage;
                const backUrl = btn.dataset.backUrl;
                if (!confirm(confirmMsg)) return;
                // 타이머 정지 + 상태 리셋 + 브로드캐스트
                state.running = false;
                state.shot_running = false;
                Object.assign(state, defaultState());
                render();
                broadcast();
                window.location.href = backUrl;
                return;
              }
              // ... existing cases ...
              case "minus-minute":
                state.period_seconds = Math.max(0, state.period_seconds - 60);
                break;
              case "plus-minute":
                state.period_seconds += 60;
                break;
              case "minus-second":
                state.period_seconds = Math.max(0, state.period_seconds - 1);
                break;
              case "plus-second":
                state.period_seconds += 1;
                break;
              case "toggle-shot":
                // Don't start shot clock if:
                // - game clock is not running
                // - shot clock is disabled (-1) or 0
                if (!state.shot_running && (!state.running || state.shot_seconds < 0.1)) {
                  break;
                }
                state.shot_running = !state.shot_running;
                if (state.shot_running) {
                  state.shot_ref_at_ms = Date.now();
                  state.shot_ref_value = state.shot_seconds;
                }
                break;
              case "reset-shot-24":
                // 경기 시간에 따라 적절한 샷클락 값 설정
                if (state.period_seconds >= 24) {
                  state.shot_seconds = SHOT_CLOCK_24;
                  state.shot_ref_value = SHOT_CLOCK_24;
                } else {
                  // 경기 시간 < 24초: 샷클락 비활성화
                  state.shot_seconds = -1;
                }
                // Shot clock stops on reset - user must manually start
                state.shot_running = false;
                break;
              case "reset-shot-14":
                // If game time < 14 seconds, disable shot clock instead of resetting
                if (state.period_seconds < 14) {
                  state.shot_seconds = -1;
                } else {
                  state.shot_seconds = SHOT_CLOCK_14;
                  state.shot_ref_value = SHOT_CLOCK_14;
                }
                // Shot clock stops on reset - user must manually start
                state.shot_running = false;
                break;
              case "add-game": {
                if (teamsCount !== 2) break;
                if (String(matchId).startsWith("standalone_")) break;

                const previousQuarterNumber = currentQuarter();
                const previousSlotIndex = currentMatchupIndex();

                const clubMatch = window.location.pathname.match(/\/clubs\/(\d+)/);
                const clubId = clubMatch ? clubMatch[1] : null;
                if (!clubId) {
                  alert(i18nForScoreboard("alert_club_not_found"));
                  return;
                }

                const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
                const triggerButton = btn;
                if (triggerButton) triggerButton.disabled = true;

                const addGameRequest = async () => {
                  try {
                    const response = await fetch(`/clubs/${clubId}/matches/${matchId}/add_game`, {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": csrfToken
                      }
                    });
                    const data = await response.json();

                    if (!response.ok || !data.success) {
                      alert(data.error || i18nForScoreboard("alert_add_game_failed"));
                      return;
                    }

                    if (data.game) {
                      games.push(data.game);
                      appendMatchupSlotForGame(data.game);
                      state = normalizeState(state);
                      const newRounds = roundsPerQuarter();
                      state.rotation_step = Math.min(
                        maxRotationStep(),
                        Math.max(0, rotationStepForPosition(previousQuarterNumber, previousSlotIndex, newRounds, totalRegularQuarters(), isSequentialProgression()))
                      );
                      state.quarter = currentQuarter();
                      applyQuarterPossession(state.quarter);
                      syncScoresForActiveMatchup();
                      render();
                      syncTimers();
                      broadcast();
                    }
                  } catch (error) {
                    console.error("경기 추가 중 오류:", error);
                    alert(i18nForScoreboard("alert_add_game_error"));
                  } finally {
                    render();
                  }
                };

                addGameRequest();
                return;
              }
              case "next-quarter": {
                const finishedPairIdx = currentMatchupId();
                const [p1, p2] = matchupPairById(finishedPairIdx);
                if (p1 === undefined || p2 === undefined || !state.teams[p1] || !state.teams[p2]) break;
                const finishedGameId = matchupGameIdById(finishedPairIdx);
                const finishedQuarter = currentQuarter();
                const finishedTotals = buildQuarterTotalsForStorage(
                  finishedPairIdx,
                  finishedQuarter,
                  state.teams[p1].score,
                  state.teams[p2].score
                );

                state.matchup_scores[finishedPairIdx] = {
                  team1: finishedTotals.team1,
                  team2: finishedTotals.team2
                };
                // 경기 완료 시 파울도 저장
                if (!state.matchup_fouls) state.matchup_fouls = [];
                state.matchup_fouls[finishedPairIdx] = {
                  team1: state.home_fouls || 0,
                  team2: state.away_fouls || 0
                };

                if (!state.quarter_history[finishedPairIdx]) {
                  state.quarter_history[finishedPairIdx] = {};
                }
                state.quarter_history[finishedPairIdx][finishedQuarter] = {
                  team1: finishedTotals.team1,
                  team2: finishedTotals.team2
                };

                const saveQuarterScore = async () => {
                  const matchId = scoreboardRoot.dataset.matchId;
                  const clubMatch = window.location.pathname.match(/\/clubs\/(\d+)/);
                  const clubId = clubMatch ? clubMatch[1] : null;
                  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
                  if (!clubId) return;

                  try {
                    await fetch(`/clubs/${clubId}/matches/${matchId}/save_quarter_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
                        game_id: finishedGameId,
                        home_team_id: state.teams[p1].id,
                        away_team_id: state.teams[p2].id,
                        quarter: finishedQuarter,
                        home_score: finishedTotals.team1,
                        away_score: finishedTotals.team2,
                        skip_result: true  // 쿼터 넘길 때는 결과 확정 안함 (경기 완료 시에만 확정)
                      })
                    });
                  } catch (error) {
                    console.error('쿼터 점수 저장 중 오류:', error);
                  }
                };

                saveQuarterScore();

                if (state.rotation_step === maxRotationStep()) {
                  const nextQuarterBtn = scoreboardRoot.querySelector('[data-action="next-quarter"]');
                  if (nextQuarterBtn) {
                    nextQuarterBtn.textContent = i18nForScoreboard("saved_complete");
                    nextQuarterBtn.disabled = true;
                    // 다른 경기 종료 버튼과 동일한 스타일 적용 (흰색 배경 + 녹색 텍스트)
                    nextQuarterBtn.classList.remove("text-[#FF6B35]", "hover:bg-orange-50", "bg-emerald-600", "bg-green-600", "hover:bg-emerald-700");
                    nextQuarterBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-white", "text-emerald-600", "hover:bg-emerald-50");
                  }
                  // 마지막 경기 종료 시에도 UI 업데이트 (matchup 테이블 반영)
                  render();
                  syncTimers();
                  broadcast();

                  // 마지막 경기 종료 후 결과 화면으로 이동
                  const matchId = scoreboardRoot.dataset.matchId;
                  const clubMatch = window.location.pathname.match(/\/clubs\/(\d+)/);
                  const clubId = clubMatch ? clubMatch[1] : null;
                  if (clubId && !matchId.toString().startsWith('standalone_')) {
                    // 모든 게임 점수 저장 후 결과 화면으로 이동
                    const saveAllAndRedirect = async () => {
                      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

                      // 모든 매치업의 게임 점수 저장
                      for (let pairIdx = 0; pairIdx < roundsPerQuarter(); pairIdx++) {
                        const [t1, t2] = matchupPairById(pairIdx);
                        if (t1 === undefined || t2 === undefined) continue;

                        const team1 = state.teams[t1];
                        const team2 = state.teams[t2];
                        if (!team1 || !team2) continue;

                        const gameId = matchupGameIdById(pairIdx);
                        const scores = state.matchup_scores[pairIdx] || { team1: 0, team2: 0 };

                        try {
                          await fetch(`/clubs/${clubId}/matches/${matchId}/save_game_scores`, {
                            method: 'PATCH',
                            headers: {
                              'Content-Type': 'application/json',
                              'X-CSRF-Token': csrfToken
                            },
                            body: JSON.stringify({
                              game_id: gameId,
                              home_team_id: team1.id,
                              away_team_id: team2.id,
                              home_score: scores.team1,
                              away_score: scores.team2,
                              skip_result: true  // 결과 확정은 결과 화면에서
                            })
                          });
                        } catch (error) {
                          console.error('게임 점수 저장 중 오류:', error);
                        }
                      }

                      // 결과 화면으로 이동
                      window.location.href = `/clubs/${clubId}/matches/${matchId}`;
                    };

                    saveAllAndRedirect();
                  }
                  return;
                }

                state.rotation_step += 1;

                const nextPairIdx = currentMatchupId();
                const [n1, n2] = matchupPairById(nextPairIdx);
                if (n1 === undefined || n2 === undefined || !state.teams[n1] || !state.teams[n2]) break;

                if (isQuarterScoreResetEnabled()) {
                  state.teams[n1].score = 0;
                  state.teams[n2].score = 0;
                } else {
                  const nextScores = state.matchup_scores[nextPairIdx] || { team1: 0, team2: 0 };
                  state.teams[n1].score = nextScores.team1;
                  state.teams[n2].score = nextScores.team2;
                }

                if (teamsCount === 3) {
                  const allIdx = [0, 1, 2];
                  const thirdIdx = allIdx.find(i => i !== n1 && i !== n2);
                  if (thirdIdx !== undefined && state.teams[thirdIdx]) {
                    state.teams[thirdIdx].score = 0;
                  }
                }

                state.quarter = currentQuarter();
                state.period_seconds = defaultPeriodSeconds;
                state.shot_seconds = SHOT_CLOCK_24;
                state.home_fouls = 0;
                state.away_fouls = 0;
                applyQuarterPossession(state.quarter);
                state.running = false;
                state.shot_running = false;
                break;
              }
              case "prev-quarter": {
                if (state.rotation_step <= 0) break;

                // 현재 경기의 점수/파울 저장
                const curPairIdx = currentMatchupId();
                const [c1, c2] = matchupPairById(curPairIdx);
                if (c1 !== undefined && c2 !== undefined && state.teams[c1] && state.teams[c2]) {
                  state.matchup_scores[curPairIdx] = { team1: state.teams[c1].score, team2: state.teams[c2].score };
                  if (!state.matchup_fouls) state.matchup_fouls = [];
                  state.matchup_fouls[curPairIdx] = { team1: state.home_fouls || 0, team2: state.away_fouls || 0 };
                }

                // 현재 쿼터의 히스토리 삭제 (되돌리기이므로)
                const curQuarter = currentQuarter();
                if (state.quarter_history[curPairIdx]) {
                  delete state.quarter_history[curPairIdx][curQuarter];
                }

                state.rotation_step -= 1;

                // 이전 경기의 점수/파울 복원
                const prevPairIdx = currentMatchupId();
                const [pr1, pr2] = matchupPairById(prevPairIdx);
                if (pr1 !== undefined && pr2 !== undefined && state.teams[pr1] && state.teams[pr2]) {
                  const prevScores = state.matchup_scores[prevPairIdx] || { team1: 0, team2: 0 };
                  state.teams[pr1].score = prevScores.team1;
                  state.teams[pr2].score = prevScores.team2;
                  const prevFouls = state.matchup_fouls?.[prevPairIdx] || { team1: 0, team2: 0 };
                  state.home_fouls = prevFouls.team1;
                  state.away_fouls = prevFouls.team2;
                }

                state.quarter = currentQuarter();
                state.period_seconds = defaultPeriodSeconds;
                state.shot_seconds = SHOT_CLOCK_24;
                state.running = false;
                state.shot_running = false;
                applyQuarterPossession(state.quarter);
                break;
              }
              case "next-matchup":
                state.matchup_index += 1;
                break;
              case "prev-matchup":
                state.matchup_index = Math.max(0, state.matchup_index - 1);
                break;
              case "set-quarter-view-cumulative":
                setQuarterScoreViewMode("cumulative");
                break;
              case "set-quarter-view-per-quarter":
                setQuarterScoreViewMode("per_quarter");
                break;
              case "toggle-quarter-score-reset":
                state.quarter_score_reset_enabled = !isQuarterScoreResetEnabled();
                break;
              case "toggle-progression-mode": {
                // 경기 진행 중(rotation_step > 0)이면 모드 전환 불가
                if (state.rotation_step > 0) break;
                state.progression_mode = isSequentialProgression() ? "by_quarter" : "by_game";
                break;
              }
              case "toggle-announcements":
              case "toggle-sound":
              case "toggle-voice": {
                // 토글은 음성 안내(voice_enabled)만 제어 — 부저(sound_enabled)는 항상 ON
                state.voice_enabled = !isVoiceEnabled();
                voiceToggledLocally = true;
                break;
              }
              case "increment-home-fouls":
                state.home_fouls = (state.home_fouls || 0) + 1;
                break;
              case "decrement-home-fouls":
                state.home_fouls = Math.max(0, (state.home_fouls || 0) - 1);
                break;
              case "reset-home-fouls":
                state.home_fouls = 0;
                break;
              case "increment-away-fouls":
                state.away_fouls = (state.away_fouls || 0) + 1;
                break;
              case "decrement-away-fouls":
                state.away_fouls = Math.max(0, (state.away_fouls || 0) - 1);
                break;
              case "reset-away-fouls":
                state.away_fouls = 0;
                break;
              case "home-timeout":
                state.home_timeouts = Math.min((state.home_timeouts || 0) + 1, 2);
                break;
              case "away-timeout":
                state.away_timeouts = Math.min((state.away_timeouts || 0) + 1, 2);
                break;
              case "reset-home-timeouts":
                state.home_timeouts = 0;
                break;
              case "reset-away-timeouts":
                state.away_timeouts = 0;
                break;
              case "buzzer":
                console.log('[Buzzer] Button clicked, calling playBuzzer');
                playBuzzer();
                // BroadcastChannel로 display 탭에 부저 전달
                if (bcChannel) {
                  try { bcChannel.postMessage({ type: "buzzer" }); } catch (e) { /* ignore */ }
                }
                return;
              case "possession-home":
                state.base_possession = basePossessionForSelectedQuarterDirection(
                  currentQuarter(),
                  "home",
                  state.possession_switch_pattern
                );
                state.possession = "home";
                break;
              case "possession-away":
                state.base_possession = basePossessionForSelectedQuarterDirection(
                  currentQuarter(),
                  "away",
                  state.possession_switch_pattern
                );
                state.possession = "away";
                break;
              case "toggle-possession": {
                const currentPossession = normalizePossession(state.possession, "away");
                const nextPossession = currentPossession === "home" ? "away" : "home";
                state.base_possession = basePossessionForSelectedQuarterDirection(
                  currentQuarter(),
                  nextPossession,
                  state.possession_switch_pattern
                );
                state.possession = nextPossession;
                break;
              }
              case "finish-game":
              {
                const finishCurrentGame = async () => {
                  const activePairIdx = currentMatchupId();
                  const [team1Idx, team2Idx] = matchupPairById(activePairIdx);
                  if (team1Idx === undefined || team2Idx === undefined) return;

                  const team1 = state.teams[team1Idx];
                  const team2 = state.teams[team2Idx];
                  if (!team1 || !team2) return;

                  const activeGameId = matchupGameIdById(activePairIdx);
                  const matchId = scoreboardRoot.dataset.matchId;
                  const clubMatch = window.location.pathname.match(/\/clubs\/(\d+)/);
                  const clubId = clubMatch ? clubMatch[1] : null;
                  if (!clubId) {
                    alert(i18nForScoreboard("alert_club_not_found"));
                    return;
                  }

                  const currentQuarterNumber = currentQuarter();
                  const finishedTotals = buildQuarterTotalsForStorage(
                    activePairIdx,
                    currentQuarterNumber,
                    team1.score,
                    team2.score
                  );
                  state.matchup_scores[activePairIdx] = {
                    team1: finishedTotals.team1,
                    team2: finishedTotals.team2
                  };
                  // 저장하고 중단하기 시 파울도 저장
                  if (!state.matchup_fouls) state.matchup_fouls = [];
                  state.matchup_fouls[activePairIdx] = {
                    team1: state.home_fouls || 0,
                    team2: state.away_fouls || 0
                  };
                  if (!state.quarter_history[activePairIdx]) {
                    state.quarter_history[activePairIdx] = {};
                  }
                  state.quarter_history[activePairIdx][currentQuarterNumber] = {
                    team1: finishedTotals.team1,
                    team2: finishedTotals.team2
                  };

                  render();
                  broadcast();

                  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

                  try {
                    await fetch(`/clubs/${clubId}/matches/${matchId}/save_quarter_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
                        game_id: activeGameId,
                        home_team_id: team1.id,
                        away_team_id: team2.id,
                        quarter: currentQuarterNumber,
                        home_score: finishedTotals.team1,
                        away_score: finishedTotals.team2
                      })
                    });
                  } catch (error) {
                    console.error('쿼터 점수 저장 중 오류:', error);
                  }

                  try {
                    const response = await fetch(`/clubs/${clubId}/matches/${matchId}/save_game_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
                        game_id: activeGameId,
                        home_team_id: team1.id,
                        away_team_id: team2.id,
                        home_score: finishedTotals.team1,
                        away_score: finishedTotals.team2
                      })
                    });

                    const data = await response.json();
                    if (!data.success) {
                      alert(i18nForScoreboard("alert_score_save_failed", { error: data.error || i18nForScoreboard("alert_unknown_error") }));
                      return;
                    }

                    const slotIndex = currentMatchupIndex();
                    const rounds = roundsPerQuarter();
                    const hasNextGame = isSequentialProgression() && slotIndex < (rounds - 1);

                    if (hasNextGame) {
                      const nextStep = rotationStepForPosition(1, slotIndex + 1, rounds, totalRegularQuarters(), isSequentialProgression());
                      state.rotation_step = Math.max(0, Math.min(nextStep, maxRotationStep()));

                      const nextPairIdx = currentMatchupId();
                      const [nextTeam1Idx, nextTeam2Idx] = matchupPairById(nextPairIdx);
                      if (nextTeam1Idx !== undefined && nextTeam2Idx !== undefined && state.teams[nextTeam1Idx] && state.teams[nextTeam2Idx]) {
                        if (isQuarterScoreResetEnabled()) {
                          state.teams[nextTeam1Idx].score = 0;
                          state.teams[nextTeam2Idx].score = 0;
                        } else {
                          const nextScores = state.matchup_scores[nextPairIdx] || { team1: 0, team2: 0 };
                          state.teams[nextTeam1Idx].score = nextScores.team1;
                          state.teams[nextTeam2Idx].score = nextScores.team2;
                        }
                      }

                      if (teamsCount === 3) {
                        const allIdx = [0, 1, 2];
                        const thirdIdx = allIdx.find(i => i !== nextTeam1Idx && i !== nextTeam2Idx);
                        if (thirdIdx !== undefined && state.teams[thirdIdx]) {
                          state.teams[thirdIdx].score = 0;
                        }
                      }

                      state.quarter = currentQuarter();
                      state.period_seconds = defaultPeriodSeconds;
                      state.shot_seconds = SHOT_CLOCK_24;
                      state.home_fouls = 0;
                      state.away_fouls = 0;
                      applyQuarterPossession(state.quarter);
                      state.running = false;
                      state.shot_running = false;

                      render();
                      syncTimers();
                      broadcast();
                      alert(i18nForScoreboard("alert_finish_current_game", {
                        team1: team1.label,
                        score1: finishedTotals.team1,
                        score2: finishedTotals.team2,
                        team2: team2.label
                      }));
                      return;
                    }

                    alert(i18nForScoreboard("alert_finish_match", {
                      team1: team1.label,
                      score1: finishedTotals.team1,
                      score2: finishedTotals.team2,
                      team2: team2.label,
                      result: data.result
                    }));
                    window.location.href = `/clubs/${clubId}/matches/${matchId}`;
                  } catch (error) {
                    console.error('점수 저장 중 오류:', error);
                    alert(i18nForScoreboard("alert_score_save_error"));
                  }
                };

                const hasRemainingGames = isSequentialProgression() && currentMatchupIndex() < (roundsPerQuarter() - 1);
                const message = hasRemainingGames
                  ? i18nForScoreboard("confirm_finish_current_game")
                  : i18nForScoreboard("confirm_finish_match");

                if (confirm(message)) {
                  finishCurrentGame();
                }
                break;
              }
              case "save-and-pause":
              {
                const saveAndPause = async () => {
                  const activePairIdx = currentMatchupId();
                  const [team1Idx, team2Idx] = matchupPairById(activePairIdx);
                  if (team1Idx === undefined || team2Idx === undefined) return;

                  const team1 = state.teams[team1Idx];
                  const team2 = state.teams[team2Idx];
                  if (!team1 || !team2) return;

                  const activeGameId = matchupGameIdById(activePairIdx);
                  const matchId = scoreboardRoot.dataset.matchId;
                  const clubMatch = window.location.pathname.match(/\/clubs\/(\d+)/);
                  const clubId = clubMatch ? clubMatch[1] : null;
                  if (!clubId) {
                    alert(i18nForScoreboard("alert_club_not_found"));
                    return;
                  }

                  // 타이머 멈춤
                  state.running = false;
                  state.shot_running = false;

                  const currentQuarterNumber = currentQuarter();
                  const currentTotals = buildQuarterTotalsForStorage(
                    activePairIdx,
                    currentQuarterNumber,
                    team1.score,
                    team2.score
                  );

                  // 상태 업데이트
                  state.matchup_scores[activePairIdx] = {
                    team1: currentTotals.team1,
                    team2: currentTotals.team2
                  };
                  // 경기 완료 시 파울도 저장
                  if (!state.matchup_fouls) state.matchup_fouls = [];
                  state.matchup_fouls[activePairIdx] = {
                    team1: state.home_fouls || 0,
                    team2: state.away_fouls || 0
                  };
                  if (!state.quarter_history[activePairIdx]) {
                    state.quarter_history[activePairIdx] = {};
                  }
                  state.quarter_history[activePairIdx][currentQuarterNumber] = {
                    team1: currentTotals.team1,
                    team2: currentTotals.team2
                  };

                  render();
                  broadcast();

                  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

                  try {
                    // 쿼터 점수 저장 (결과 확정 없이 점수만)
                    const quarterRes = await fetch(`/clubs/${clubId}/matches/${matchId}/save_quarter_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
                        game_id: activeGameId,
                        home_team_id: team1.id,
                        away_team_id: team2.id,
                        quarter: currentQuarterNumber,
                        home_score: currentTotals.team1,
                        away_score: currentTotals.team2,
                        skip_result: true  // 결과 확정 안함
                      })
                    });
                    const quarterData = await quarterRes.json();
                    console.log('[save-and-pause] save_quarter_scores response:', quarterRes.status, quarterData);

                    // 게임 점수 저장 (결과 확정 없이 점수만)
                    const gameRes = await fetch(`/clubs/${clubId}/matches/${matchId}/save_game_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
                        game_id: activeGameId,
                        home_team_id: team1.id,
                        away_team_id: team2.id,
                        home_score: currentTotals.team1,
                        away_score: currentTotals.team2,
                        skip_result: true  // 결과 확정 안함
                      })
                    });
                    const gameData = await gameRes.json();
                    console.log('[save-and-pause] save_game_scores response:', gameRes.status, gameData);

                    // 결과가 pending이 아니면 경고
                    if (gameData.result && gameData.result !== 'pending') {
                      console.warn('[save-and-pause] WARNING: game result is not pending:', gameData.result);
                    }

                    alert(i18nForScoreboard("alert_save_and_pause_success") || "경기 상황이 저장되었습니다. 언제든 다시 시작할 수 있습니다.");
                    // 저장 후 경기 결과 화면으로 이동
                    window.location.href = `/clubs/${clubId}/matches/${matchId}`;
                  } catch (error) {
                    console.error('저장 중 오류:', error);
                    alert(i18nForScoreboard("alert_save_and_pause_error") || "저장 중 오류가 발생했습니다.");
                  }
                };

                if (confirm(i18nForScoreboard("confirm_save_and_pause") || "현재 경기 상황을 저장하고 중단하시겠습니까?")) {
                  saveAndPause();
                }
                break;
              }
              case "toggle-shortcuts":
                // control.html.erb의 별도 이벤트 핸들러에서 처리됨
                break;
              case "swap-sides":
                state.manual_swap = !state.manual_swap;
                // 파울 수도 함께 스왑
                const tempFouls = state.home_fouls;
                state.home_fouls = state.away_fouls;
                state.away_fouls = tempFouls;
                break;
              case "new-game":
                if (confirm(i18nForScoreboard("confirm_new_game_reset"))) {
                  // SAVE CURRENT QUARTER BEFORE RESET
                  const currentPairIdx = currentMatchupId();
                  const [p1, p2] = matchupPairById(currentPairIdx);
                  const currentQuarterNum = currentQuarter();

                  if (p1 !== undefined && p2 !== undefined && state.teams[p1] && state.teams[p2]) {
                    if (!state.quarter_history[currentPairIdx]) {
                      state.quarter_history[currentPairIdx] = {};
                    }
                    state.quarter_history[currentPairIdx][currentQuarterNum] = {
                      team1: state.teams[p1].score,
                      team2: state.teams[p2].score
                    };
                  }

                  // IMPORTANT: Call render() to update the table with saved scores
                  render();
                  broadcast();

                  // Wait a moment for user to see final scores, then reset
                  setTimeout(() => {
                    state = defaultState();
                    render();
                    broadcast();
                  }, 1500);
                }
                break;
              case "overtime":
                state.quarter = 5;
                state.period_seconds = 300;
                applyQuarterPossession(state.quarter);
                break;
              default:
                break;
            }
          }
          render();
          syncTimers();
          broadcast();
        });
      });

      // Keyboard Shortcuts
      document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // 키보드 반복 무시 (키를 누르고 있을 때 자동 반복 방지)
        if (e.repeat) return;

        // Helper to click button by action
        const clickAction = (action) => {
          const btn = scoreboardRoot.querySelector(`[data-action="${action}"]`);
          if (btn) {
            btn.click();

            // Add visual feedback
            btn.classList.add('active:scale-95', 'transform', 'transition-all');
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => {
              btn.style.transform = '';
            }, 100);
          }
        };

        switch (e.code) {
          case "Space":
            e.preventDefault();
            clickAction("toggle-main");
            break;
          case "Digit1":
          case "Numpad1":
            clickAction("add-home-1");
            break;
          case "Digit2":
          case "Numpad2":
            clickAction("add-home-2");
            break;
          case "Digit3":
          case "Numpad3":
            clickAction("add-home-3");
            break;
          case "Digit5":
          case "Numpad5":
            clickAction("sub-home");
            break;
          case "Digit6":
          case "Numpad6":
            clickAction("sub-away");
            break;
          case "Digit8":
          case "Numpad8":
            clickAction("add-away-1");
            break;
          case "Digit9":
          case "Numpad9":
            clickAction("add-away-2");
            break;
          case "Digit0":
          case "Numpad0":
            clickAction("add-away-3");
            break;
          case "KeyZ":
            clickAction("reset-shot-14");
            break;
          case "KeyX":
            clickAction("reset-shot-24");
            break;
          case "KeyC":
            clickAction("toggle-shot");
            break;
          case "KeyB":
            if (!isAnnouncementsEnabled()) {
              clickAction("toggle-announcements");
            }
            break;
          case "KeyV":
            if (isAnnouncementsEnabled()) {
              clickAction("toggle-announcements");
            }
            break;
          case "KeyD":
            console.log('[Buzzer] Keyboard D pressed, calling playBuzzer directly');
            playBuzzer();
            break;
          case "KeyA":
            clickAction("decrement-home-fouls");
            break;
          case "KeyS":
            clickAction("increment-home-fouls");
            break;
          case "KeyK":
            clickAction("decrement-away-fouls");
            break;
          case "KeyL":
            clickAction("increment-away-fouls");
            break;
          case "KeyN":
            clickAction("next-quarter");
            break;
        }
      });
    };

    const initDetailPanelSort = () => {
      if (role !== "control" || typeof Sortable === "undefined") return;

      try {
        const panel = scoreboardRoot.querySelector("[data-detail-sort-container]");
        if (!panel || panel.dataset.sortableInitialized === "true") return;

        const cards = Array.from(panel.querySelectorAll("[data-detail-sort-item]"));
        if (cards.length < 2) return;

        const storageKey = `scoreboard:detail-order:${matchId}`;
        const readSavedOrder = () => {
          try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch (error) {
            console.warn("상세 패널 순서 복원 실패:", error);
            return [];
          }
        };

        const saveCurrentOrder = () => {
          try {
            const order = Array.from(panel.querySelectorAll("[data-detail-sort-item]"))
              .map((item) => item.dataset.detailSortKey)
              .filter(Boolean);
            window.localStorage.setItem(storageKey, JSON.stringify(order));
          } catch (error) {
            console.warn("상세 패널 순서 저장 실패:", error);
          }
        };

        const savedOrder = readSavedOrder();
        if (savedOrder.length > 0) {
          const cardMap = new Map(cards.map((card) => [card.dataset.detailSortKey, card]));
          savedOrder.forEach((key) => {
            const card = cardMap.get(key);
            if (card) panel.appendChild(card);
          });
        }

        new Sortable(panel, {
          animation: 180,
          draggable: "[data-detail-sort-item]",
          handle: "[data-detail-drag-handle]",
          ghostClass: "opacity-60",
          chosenClass: "ring-2",
          dragClass: "cursor-grabbing",
          onEnd: saveCurrentOrder
        });

        panel.dataset.sortableInitialized = "true";
      } catch (error) {
        console.warn("상세 패널 드래그 초기화 실패:", error);
      }
    };


    const ensureState = () => {
      if (!state) {
        state = defaultState();
      } else {
        state = normalizeState(state);
      }
      refreshLocalStateVersion(state);
      render();
      syncTimers();
    };

    ensureState();
    attachControlHandlers();

    // WebSocket 메시지 처리 함수 (재연결 시 재사용)
    const handleSocketData = (data) => {
      if (data.type === "ping" || data.type === "welcome") return;
      if (data.type === "confirm_subscription") {
        if (role === "control") {
          state = normalizeState(state || defaultState());
          refreshLocalStateVersion(state);
          render();
          broadcast();
        } else if (role === "display") {
          startDisplayTimerSync();
        }
        return;
      }
      if (data.message?.type === "state") {
        const incomingState = normalizeState(data.message.payload);
        if (!shouldApplyIncomingState(incomingState)) return;

        if (role === "control" && Array.isArray(games) && games.length > 0) {
          const gamesHaveScores = games.some(g => (Number(g.home_score) || 0) > 0 || (Number(g.away_score) || 0) > 0);
          const stateHasNoScores = !incomingState.matchup_scores ||
            incomingState.matchup_scores.every(s => (s?.team1 || 0) === 0 && (s?.team2 || 0) === 0);

          if (gamesHaveScores && stateHasNoScores) {
            console.log('[WebSocket] 캐시에 점수 없음, DB 점수로 복원');
            const seededSlots = initialMatchupSlots(incomingState.teams || []);
            incomingState.matchup_scores = getInitialMatchupScoresFromGames(seededSlots);

            if (incomingState.matchup_scores[0] && incomingState.teams?.length >= 2) {
              const firstMatchupScores = incomingState.matchup_scores[0];
              if (seededSlots[0]) {
                const [t1Idx, t2Idx] = seededSlots[0];
                if (incomingState.teams[t1Idx]) incomingState.teams[t1Idx].score = firstMatchupScores.team1;
                if (incomingState.teams[t2Idx]) incomingState.teams[t2Idx].score = firstMatchupScores.team2;
              }
            }
          }
        }

        state = incomingState;
        refreshLocalStateVersion(state);
        render();
        syncTimers();
        if (role === "display") {
          startDisplayTimerSync();
        }
      }
    };

    // WebSocket 재연결 함수
    const reconnectWebSocket = () => {
      setTimeout(() => {
        try {
          const ws = new WebSocket(cableUrl);
          ws.addEventListener("open", () => {
            socket = ws;
            wsReconnectDelay = 1000;
            ws.send(JSON.stringify({ command: "subscribe", identifier }));
            document.dispatchEvent(new CustomEvent('scoreboard:connected'));
          });
          ws.addEventListener("message", (ev) => {
            handleSocketData(JSON.parse(ev.data));
          });
          ws.addEventListener("close", () => {
            ensureState();
            document.dispatchEvent(new CustomEvent('scoreboard:disconnected'));
            wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
            reconnectWebSocket();
          });
          ws.addEventListener("error", () => {});
        } catch (e) {
          wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
          reconnectWebSocket();
        }
      }, wsReconnectDelay);
    };

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ command: "subscribe", identifier }));
      document.dispatchEvent(new CustomEvent('scoreboard:connected'));
    });

    socket.addEventListener("message", (event) => {
      handleSocketData(JSON.parse(event.data));
    });

    socket.addEventListener("close", () => {
      ensureState();
      document.dispatchEvent(new CustomEvent('scoreboard:disconnected'));
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
      reconnectWebSocket();
    });

    // BroadcastChannel 수신 (같은 기기의 control ↔ display 탭 간 오프라인 동기화)
    if (bcChannel) {
      bcChannel.onmessage = (event) => {
        const msg = event.data;
        if (msg?.type === "state") {
          const incomingState = normalizeState(msg.payload);
          if (!shouldApplyIncomingState(incomingState)) return;
          state = incomingState;
          refreshLocalStateVersion(state);
          render();
          syncTimers();
          if (role === "display") startDisplayTimerSync();
        } else if (msg?.type === "buzzer") {
          playBuzzer();
        }
      };
    }
    const fullscreenBtn = document.getElementById("fullscreen-btn");
    if (fullscreenBtn) {
      const fullscreenLabel = fullscreenBtn.querySelector("[data-ui-key='fullscreen']");

      const updateFullscreenLabel = () => {
        if (fullscreenLabel) {
          fullscreenLabel.textContent = document.fullscreenElement ? i18nForScoreboard("exit_fullscreen") : i18nForScoreboard("fullscreen");
        }
      };

      fullscreenBtn.addEventListener("click", () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((e) => {
            console.error(`Error attempting to enable fullscreen mode: ${e.message} (${e.name})`);
          });
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
        }
      });

      document.addEventListener("fullscreenchange", updateFullscreenLabel);
    }

    // 상세 패널 정렬 기능은 실패해도 점수판 실시간 동기화에 영향 주지 않도록 마지막에 초기화
    initDetailPanelSort();

    // 버저 오디오 미리 초기화 (첫 사용 시 블로킹 방지)
    setTimeout(() => {
      initBuzzerAudio();
      console.log('[Buzzer] Pre-initialized on page load');
    }, 100);

    // 첫 사용자 상호작용 시 AudioContext resume (브라우저 autoplay 정책 대응)
    const unlockBuzzer = () => {
      initBuzzerAudio();
      resumeBuzzerCtx();
      document.removeEventListener("click", unlockBuzzer);
      document.removeEventListener("touchstart", unlockBuzzer);
      console.log('[Buzzer] AudioContext unlocked via user interaction');
    };
    document.addEventListener("click", unlockBuzzer, { once: true });
    document.addEventListener("touchstart", unlockBuzzer, { once: true });
  }
});
