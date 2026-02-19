# 경기 점수 관련 액션 (저장, 수정, 리셋, 경기 종료)
module MatchScoring
  extend ActiveSupport::Concern

  def save_game_scores
    home_score = params[:home_score].to_i
    away_score = params[:away_score].to_i
    skip_result = params[:skip_result] == true || params[:skip_result] == "true"

    game = find_game_from_params
    unless game
      return render json: { success: false, error: "Game not found" }, status: :not_found
    end

    actual_home_score, actual_away_score = resolve_scores(game, home_score, away_score)

    if game.update_scores(actual_home_score, actual_away_score, skip_result: skip_result)
      expire_member_stats_cache unless skip_result
      render json: { success: true, result: game.result, game_id: game.id }
    else
      render json: { success: false, errors: game.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def save_quarter_scores
    quarter = params[:quarter].to_i
    quarter_home_score = params[:home_score].to_i
    quarter_away_score = params[:away_score].to_i
    skip_result = params[:skip_result] == true || params[:skip_result] == "true"

    game = find_game_from_params
    unless game
      return render json: { success: false, error: "Game not found" }, status: :not_found
    end

    actual_home_score, actual_away_score = resolve_scores(game, quarter_home_score, quarter_away_score)

    quarter_scores = game.quarter_scores || {}
    quarter_scores[quarter.to_s] = { "home" => actual_home_score, "away" => actual_away_score }

    # 누적 방식: 마지막 쿼터 점수를 총점으로 사용
    latest_q = quarter_scores.keys.map(&:to_i).max.to_s
    total_home = quarter_scores[latest_q]["home"].to_i
    total_away = quarter_scores[latest_q]["away"].to_i

    game.assign_attributes(
      quarter_scores: quarter_scores,
      home_score: total_home,
      away_score: total_away
    )
    game.update_result_from_scores unless skip_result

    if game.save
      expire_member_stats_cache unless skip_result
      render json: { success: true, game_id: game.id }
    else
      render json: { success: false, errors: game.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update_scores
    # extract_scores_from_params로 통일: game_id 형식, 쿼터 범위, 정수 변환을 검증한다
    scores_data = extract_scores_from_params

    if scores_data.present?
      input_mode = params[:input_mode] || "cumulative"

      ActiveRecord::Base.transaction do
        scores_data.each do |game_id, score_params|
          game = @match.games.find_by(id: game_id)
          next unless game

          apply_game_scores(game, score_params, input_mode)
        end
      end

      expire_member_stats_cache
      redirect_to club_match_path(@club, @match), notice: "경기 점수가 수정되었습니다."
    else
      redirect_to club_match_path(@club, @match), alert: "수정할 점수 데이터가 없습니다."
    end
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.error("점수 수정 실패: #{e.class} - #{e.message}")
    redirect_to club_match_path(@club, @match), alert: "점수 수정에 실패했습니다. 입력 값을 확인해주세요."
  end

  def reset_all_scores
    unless @match.paused?
      return redirect_to club_match_path(@club, @match), alert: "중단된 경기만 점수를 리셋할 수 있습니다."
    end

    games = @match.games.to_a
    ActiveRecord::Base.transaction do
      games.each do |game|
        game.update!(
          home_score: 0,
          away_score: 0,
          quarter_scores: {},
          result: "pending"
        )
      end
    end

    Rails.cache.delete("scoreboard_state_#{@match.id}")
    expire_member_stats_cache

    redirect_to club_match_path(@club, @match), notice: "모든 점수가 초기화되었습니다."
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotSaved => e
    Rails.logger.error("점수 리셋 실패: #{e.class} - #{e.message}")
    redirect_to club_match_path(@club, @match), alert: "점수 리셋에 실패했습니다."
  end

  def finish_match
    if @match.finished?
      return redirect_to club_match_path(@club, @match), alert: "이미 종료된 경기입니다."
    end

    games = @match.games.to_a
    unless games.any? { |g| g.home_score.to_i > 0 || g.away_score.to_i > 0 }
      return redirect_to club_match_path(@club, @match), alert: "점수가 기록된 게임이 없습니다."
    end

    ActiveRecord::Base.transaction do
      games.each do |game|
        game.update_result_from_scores
        game.save!
      end
    end

    Rails.cache.delete("scoreboard_state_#{@match.id}")
    expire_member_stats_cache

    redirect_to club_match_path(@club, @match), notice: "경기가 종료되었습니다. 결과가 확정되었습니다."
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotSaved => e
    Rails.logger.error("경기 종료 실패: #{e.class} - #{e.message}")
    redirect_to club_match_path(@club, @match), alert: "경기 종료에 실패했습니다."
  end

  private

  # 게임별 쿼터 점수를 계산하여 저장한다
  def apply_game_scores(game, score_params, input_mode)
    quarters_params = score_params["quarters"] || score_params[:quarters] || {}
    current_quarter_scores = game.quarter_scores || {}
    regular_quarters = @match.regular_quarters_count

    temp_scores = calculate_quarter_totals(quarters_params, current_quarter_scores, regular_quarters, input_mode)

    if input_mode == "cumulative" || input_mode == "delta"
      latest_quarter_key = regular_quarters.to_s
      game.home_score = temp_scores.dig(latest_quarter_key, "home").to_i
      game.away_score = temp_scores.dig(latest_quarter_key, "away").to_i
    else
      game.home_score = temp_scores.values.sum { |v| v["home"].to_i }
      game.away_score = temp_scores.values.sum { |v| v["away"].to_i }
    end

    game.quarter_scores = temp_scores
    game.update_result_from_scores
    game.save!
  end

  # 쿼터별 점수를 input_mode(cumulative/delta)에 따라 계산한다
  def calculate_quarter_totals(quarters_params, current_quarter_scores, regular_quarters, input_mode)
    temp_scores = {}
    cum_home = 0
    cum_away = 0

    (1..regular_quarters).each do |q|
      q_s = q.to_s

      if quarters_params[q_s].present?
        h_val = quarters_params[q_s]["home"].to_i
        a_val = quarters_params[q_s]["away"].to_i
      else
        existing = current_quarter_scores[q_s] || { "home" => 0, "away" => 0 }
        h_val = input_mode == "delta" ? 0 : existing["home"].to_i
        a_val = input_mode == "delta" ? 0 : existing["away"].to_i
      end

      if input_mode == "delta"
        cum_home += h_val
        cum_away += a_val
      else
        cum_home = h_val
        cum_away = a_val
      end

      temp_scores[q_s] = { "home" => cum_home, "away" => cum_away }
    end

    temp_scores
  end

  # 파라미터에서 게임 조회 (game_id 또는 home/away_team_id로 탐색)
  def find_game_from_params
    game_id = params[:game_id]
    home_team_id = params[:home_team_id]
    away_team_id = params[:away_team_id]

    if game_id.present?
      @match.games.find_by(id: game_id)
    elsif home_team_id.present? && away_team_id.present?
      @match.games.find_by(home_team_id: home_team_id, away_team_id: away_team_id) ||
      @match.games.find_by(home_team_id: away_team_id, away_team_id: home_team_id)
    elsif @match.games.size == 1
      @match.games.first
    end
  end

  # 클라이언트의 home_team_id와 실제 게임의 home_team_id가 다르면 점수를 스왑
  def resolve_scores(game, home_score, away_score)
    home_team_id = params[:home_team_id]
    if home_team_id.present? && game.home_team_id.to_s != home_team_id.to_s
      [ away_score, home_score ]
    else
      [ home_score, away_score ]
    end
  end
end
