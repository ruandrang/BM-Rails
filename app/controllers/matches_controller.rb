class MatchesController < ApplicationController
  skip_before_action :require_login, only: [ :share ]
  before_action :set_club, except: [ :share ]
  before_action :set_match, only: [ :show, :edit, :update, :destroy, :record_results, :save_game_scores, :save_quarter_scores, :move_member, :add_member, :remove_member, :add_game, :remove_game, :shuffle_teams, :update_scores ]
  before_action :set_public_club_and_match, only: [ :share ]

  def index
    @matches = @club.matches.order(played_on: :desc, created_at: :desc)
  end

  def new
    default_date = Date.current

    if @club.meeting_days.present? && @club.meeting_days.is_a?(Array)
      # 저장된 한글 요일을 영어 요일 인덱스로 변환 (월:1 ~ 일:0/7)
      target_wdays = @club.meeting_days.map { |d| Club::DAY_MAPPING[d] }.compact.map { |en| Date::DAYNAMES.index(en) }

      if target_wdays.any?
        today_wday = default_date.wday

        # 각 요일별로 오늘로부터 며칠 뒤인지 계산 (0이면 오늘)
        # (target - current) % 7
        days_ahead_list = target_wdays.map do |target|
          (target - today_wday) % 7
        end

        # 가장 가까운 날짜(최소값) 선택
        min_days = days_ahead_list.min
        default_date += min_days.days
      end
    end

    @match = @club.matches.new(played_on: default_date, teams_count: 3, games_per_match: 1)
    @members = @club.members.order(:sort_order, :id)

    # 승률 계산 (뷰에서 정렬용)
    raw_stats = cached_member_stats
    @member_stats = raw_stats.index_by { |s| s[:member].id }
  end

  def create
    @match = @club.matches.new(match_params)
    @members = @club.members.order(:sort_order, :id)
    selected_ids = Array(params[:member_ids]).map(&:to_i)
    teams_count = @match.teams_count

    selected_members = @club.members.where(id: selected_ids)
    min_required = teams_count * 2
    max_allowed = teams_count * 6
    games_per_match = @match.games_per_match.to_i
    games_per_match = 1 if games_per_match <= 0
    games_per_match = [ games_per_match, 3 ].min

    if selected_members.size != selected_ids.size
      flash.now[:alert] = "선택한 멤버를 찾을 수 없습니다."
      render :new, status: :unprocessable_entity
      return
    end

    if selected_members.size < min_required
      flash.now[:alert] = "최소 #{min_required}명을 선택해주세요."
      render :new, status: :unprocessable_entity
      return
    end

    if selected_members.size > max_allowed
      flash.now[:alert] = "최대 #{max_allowed}명까지 선택할 수 있습니다."
      render :new, status: :unprocessable_entity
      return
    end

    team_colors = normalize_team_colors(params[:team_colors], teams_count)
    team_names = params[:team_names] || %w[A B C]

    member_stats = cached_member_stats
    assignments = TeamBalancer.new(selected_members, teams_count, stats: member_stats).call

    ActiveRecord::Base.transaction do
      @match.save!

      teams = teams_count.times.map do |index|
        name = team_names[index].presence || (index < 3 ? %w[A B C][index] : "T#{index + 1}")
        @match.teams.create!(label: name, color: team_colors[index])
      end

      teams.each_with_index do |team, index|
        assignments[index].each do |member|
          team.team_members.create!(member: member)
        end
      end

      if teams_count == 3
        matchups = [
          [ teams[0], teams[1] ],
          [ teams[1], teams[2] ],
          [ teams[2], teams[0] ]
        ]
        matchups.each do |home, away|
          @match.games.create!(home_team: home, away_team: away, result: "pending")
        end
      else
        games_per_match.times do
          @match.games.create!(home_team: teams[0], away_team: teams[1], result: "pending")
        end
      end
    end

    redirect_to club_match_path(@club, @match), notice: "팀이 생성되었습니다."
  rescue StandardError => e
    Rails.logger.error("팀 생성 실패: #{e.class} - #{e.message}")
    flash.now[:alert] = "팀 생성에 실패했습니다. 입력 값을 확인해주세요."
    render :new, status: :unprocessable_entity
  end

  def show
    @teams = @match.teams.includes(:members).order(:label)
    @games = ordered_games_for_display(@match.games.includes(:home_team, :away_team).to_a)
    assigned_member_ids = TeamMember.joins(:team).where(teams: { match_id: @match.id }).distinct.pluck(:member_id)
    @available_members_for_match = @club.members.where.not(id: assigned_member_ids).order(:sort_order, :id)
  end

  def share
    @teams = @match.teams.includes(:members).order(:label)
    @games = ordered_games_for_display(@match.games.includes(:home_team, :away_team).to_a)
    render template: "matches/share", layout: "share"
  end

  def edit
  end

  def update
    if @match.update(match_update_params)
      redirect_to club_match_path(@club, @match), notice: "경기 정보가 수정되었습니다."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    if @match.destroy
      expire_member_stats_cache
      redirect_to club_matches_path(@club), notice: "경기가 삭제되었습니다."
    else
      redirect_to club_matches_path(@club), alert: "경기 삭제에 실패했습니다."
    end
  end

  def record_results
    results = params[:games] || {}

    ActiveRecord::Base.transaction do
      game_ids = @match.games.pluck(:id).map(&:to_s)
      results.each do |game_id, result|
        next unless game_ids.include?(game_id.to_s)
        next unless Game::RESULTS.include?(result)

        game = @match.games.find(game_id)
        game.update!(result: result)
      end
    end

    expire_member_stats_cache
    redirect_to club_match_path(@club, @match), notice: "경기 결과가 저장되었습니다."
  end

  def save_game_scores
    game_id = params[:game_id]
    home_team_id = params[:home_team_id]
    away_team_id = params[:away_team_id]
    home_score = params[:home_score].to_i
    away_score = params[:away_score].to_i

    game = if game_id.present?
      @match.games.find(game_id)
    elsif home_team_id.present? && away_team_id.present?
      @match.games.find_by(home_team_id: home_team_id, away_team_id: away_team_id) ||
      @match.games.find_by(home_team_id: away_team_id, away_team_id: home_team_id)
    elsif @match.games.size == 1
      @match.games.first
    else
      nil
    end

    if game
      # 클라이언트에서 보낸 home_team_id가 실제 게임의 away_team_id라면 점수를 스왑해야 함
      if home_team_id.present? && game.home_team_id.to_s != home_team_id.to_s
        actual_home_score = away_score
        actual_away_score = home_score
      else
        actual_home_score = home_score
        actual_away_score = away_score
      end

      if game.update_scores(actual_home_score, actual_away_score)
        expire_member_stats_cache
        render json: { success: true, result: game.result, game_id: game.id }
      else
        render json: { success: false, errors: game&.errors&.full_messages || [ "Game not found" ] }, status: :unprocessable_entity
      end
    else
      render json: { success: false, error: "Game not found" }, status: :not_found
    end
  rescue ActiveRecord::RecordNotFound
    render json: { success: false, error: "Game not found" }, status: :not_found
  end

  def save_quarter_scores
    game_id = params[:game_id]
    home_team_id = params[:home_team_id]
    away_team_id = params[:away_team_id]
    quarter = params[:quarter].to_i
    quarter_home_score = params[:home_score].to_i
    quarter_away_score = params[:away_score].to_i

    game = if game_id.present?
      @match.games.find(game_id)
    elsif home_team_id.present? && away_team_id.present?
      @match.games.find_by(home_team_id: home_team_id, away_team_id: away_team_id) ||
      @match.games.find_by(home_team_id: away_team_id, away_team_id: home_team_id)
    else
      nil
    end

    if game
      # 클라이언트에서 보낸 home_team_id가 실제 게임의 away_team_id라면 점수를 스왑해야 함
      if home_team_id.present? && game.home_team_id.to_s != home_team_id.to_s
        actual_home_score = quarter_away_score
        actual_away_score = quarter_home_score
      else
        actual_home_score = quarter_home_score
        actual_away_score = quarter_away_score
      end

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
      game.update_result_from_scores

      if game.save
        expire_member_stats_cache
        render json: { success: true, game_id: game.id }
      else
        render json: { success: false, errors: game.errors.full_messages }, status: :unprocessable_entity
      end
    else
      render json: { success: false, error: "Game not found" }, status: :not_found
    end
  rescue ActiveRecord::RecordNotFound
    render json: { success: false, error: "Game not found" }, status: :not_found
  end

  def update_scores
    scores_data = params.permit(scores: {}).to_h[:scores] || extract_scores_from_params

    if scores_data.present?
      input_mode = params[:input_mode] || "cumulative"

      ActiveRecord::Base.transaction do
        scores_data.each do |game_id, score_params|
          game = @match.games.find(game_id)

          quarters_params = score_params["quarters"] || score_params[:quarters] || {}
          current_quarter_scores = game.quarter_scores || {}

          temp_scores = {}
          cum_home = 0
          cum_away = 0

          (1..4).each do |q|
            q_s = q.to_s
            h_val = 0
            a_val = 0

            if quarters_params[q_s].present?
              h_val = quarters_params[q_s]["home"].to_i
              a_val = quarters_params[q_s]["away"].to_i
            else
              # If quarter param is missing, we need to handle it.
              # For delta, we assume 0 was added. For cumulative, we use existing.
              existing = current_quarter_scores[q_s] || { "home" => 0, "away" => 0 }
              if input_mode != "delta"
                h_val = existing["home"].to_i
                a_val = existing["away"].to_i
              end
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

          # 총점 계산 (마지막 쿼터 기준 또는 합산)
          if input_mode == "cumulative" || input_mode == "delta"
            game.home_score = temp_scores["4"]["home"]
            game.away_score = temp_scores["4"]["away"]
          else
            # "per_quarter" 가 선택된 경우 (현재 기본은 아님)
            # 사실 위 loop에서 cum_* 방식이 per_quarter와 충돌할 수 있음.
            # 하지만 현재 프로젝트의 요구사항은 기본적으로 cumulative/delta 임.
            game.home_score = temp_scores.values.sum { |v| v["home"].to_i }
            game.away_score = temp_scores.values.sum { |v| v["away"].to_i }
          end

          game.quarter_scores = temp_scores
          game.update_result_from_scores
          game.save!
        end
      end

      expire_member_stats_cache
      redirect_to club_match_path(@club, @match), notice: "경기 점수가 수정되었습니다."
    else
      redirect_to club_match_path(@club, @match), alert: "수정할 점수 데이터가 없습니다."
    end
  rescue StandardError => e
    Rails.logger.error("점수 수정 실패: #{e.class} - #{e.message}")
    redirect_to club_match_path(@club, @match), alert: "점수 수정에 실패했습니다. 입력 값을 확인해주세요."
  end

  def move_member
    target_team = @match.teams.find(params[:target_team_id])
    member = @club.members.find(params[:member_id])

    team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first

    if team_member
      team_member.update!(team_id: target_team.id)
      render json: { success: true }
    else
      render json: { success: false, error: "Member not found in this match" }, status: :unprocessable_entity
    end
  rescue StandardError
    render json: { success: false, error: "멤버 이동에 실패했습니다." }, status: :unprocessable_entity
  end

  def add_member
    target_team = @match.teams.find(params[:target_team_id])
    member = @club.members.find(params[:member_id])

    existing_team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first
    if existing_team_member
      return respond_member_update_error("이미 이 경기의 다른 팀에 배정된 멤버입니다.")
    end

    target_team.team_members.create!(member: member)
    respond_member_update_success("멤버가 팀에 추가되었습니다.")
  rescue ActiveRecord::RecordInvalid => e
    respond_member_update_error(e.record.errors.full_messages.first || "멤버 추가에 실패했습니다.")
  rescue StandardError => e
    Rails.logger.error("멤버 추가 실패: #{e.class} - #{e.message}")
    respond_member_update_error("멤버 추가에 실패했습니다.")
  end

  def remove_member
    member = @club.members.find(params[:member_id])
    team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first

    unless team_member
      return render json: { success: false, error: "이 경기에서 멤버를 찾을 수 없습니다." }, status: :unprocessable_entity
    end

    team_member.destroy!
    render json: { success: true }
  rescue StandardError => e
    Rails.logger.error("멤버 삭제 실패: #{e.class} - #{e.message}")
    render json: { success: false, error: "멤버 삭제에 실패했습니다." }, status: :unprocessable_entity
  end

  def add_game
    unless @match.teams_count == 2
      return render json: { success: false, error: "2팀 경기에서만 경기 추가가 가능합니다." }, status: :unprocessable_entity
    end

    if @match.games.count >= 3
      return render json: { success: false, error: "최대 3게임(총 12쿼터)까지 추가할 수 있습니다." }, status: :unprocessable_entity
    end

    teams = @match.teams.order(:id).to_a
    unless teams.size == 2
      return render json: { success: false, error: "팀 정보가 올바르지 않습니다." }, status: :unprocessable_entity
    end

    game = nil
    ActiveRecord::Base.transaction do
      game = @match.games.create!(home_team: teams[0], away_team: teams[1], result: "pending")
      @match.update!(games_per_match: @match.games.count)
    end

    render json: {
      success: true,
      game: {
        id: game.id,
        home_team_id: game.home_team_id,
        away_team_id: game.away_team_id
      },
      games_per_match: @match.games.count
    }
  rescue StandardError => e
    Rails.logger.error("경기 추가 실패: #{e.class} - #{e.message}")
    render json: { success: false, error: "경기 추가에 실패했습니다." }, status: :unprocessable_entity
  end

  def remove_game
    unless @match.teams_count == 2
      redirect_to club_match_path(@club, @match), alert: "2팀 경기에서만 경기 삭제가 가능합니다."
      return
    end

    if @match.games.count <= 1
      redirect_to club_match_path(@club, @match), alert: "최소 1경기는 유지되어야 합니다."
      return
    end

    game = @match.games.find(params[:game_id])
    if game_started?(game)
      redirect_to club_match_path(@club, @match), alert: "이미 진행된 경기는 삭제할 수 없습니다."
      return
    end

    ActiveRecord::Base.transaction do
      game.destroy!
      @match.update!(games_per_match: [ @match.games.count, 1 ].max)
    end

    Rails.cache.delete("scoreboard_state_#{@match.id}")
    redirect_to club_match_path(@club, @match), notice: "미진행 경기를 삭제했습니다."
  rescue ActiveRecord::RecordNotFound
    redirect_to club_match_path(@club, @match), alert: "삭제할 경기를 찾을 수 없습니다."
  rescue StandardError => e
    Rails.logger.error("경기 삭제 실패: #{e.class} - #{e.message}")
    redirect_to club_match_path(@club, @match), alert: "경기 삭제에 실패했습니다."
  end

  def shuffle_teams
    if @match.games.any? { |g| g.result != "pending" || g.home_score > 0 || g.away_score > 0 }
      return redirect_to club_match_path(@club, @match), alert: "이미 진행된 게임이 있어 팀을 섞을 수 없습니다."
    end

    # eager loading으로 N+1 방지
    current_members = @match.teams.includes(:members).flat_map(&:members).uniq

    if current_members.empty?
      return redirect_to club_match_path(@club, @match), alert: "참가 멤버가 없어 팀을 섞을 수 없습니다."
    end

    teams_count = @match.teams_count
    member_stats = cached_member_stats
    assignments = TeamBalancer.new(current_members, teams_count, stats: member_stats).call

    ActiveRecord::Base.transaction do
      TeamMember.where(team_id: @match.team_ids).destroy_all

      teams = @match.teams.order(:id)

      teams.each_with_index do |team, index|
        assignments[index].each do |member|
          team.team_members.create!(member: member)
        end
      end
    end

    redirect_to club_match_path(@club, @match), notice: "팀을 랜덤하게 새로 섞었습니다."
  rescue StandardError => e
    Rails.logger.error("팀 섞기 실패: #{e.class} - #{e.message}")
    redirect_to club_match_path(@club, @match), alert: "팀 섞기에 실패했습니다."
  end

  private

  def set_club
    @club = current_user.clubs.find(params[:club_id])
  end

  def set_match
    @match = @club.matches.find(params[:id])
  end

  # share 액션용: 로그인 없이 공개 접근 가능 (토큰 검증 필수)
  def set_public_club_and_match
    @club = Club.find(params[:club_id])
    @match = @club.matches.find(params[:id])

    unless params[:token].present? && ActiveSupport::SecurityUtils.secure_compare(params[:token].to_s, @match.share_token.to_s)
      render plain: "공유 링크가 유효하지 않습니다.", status: :not_found
    end
  end

  def match_params
    params.require(:match).permit(:played_on, :teams_count, :games_per_match, :note)
  end

  def match_update_params
    params.require(:match).permit(:played_on, :note)
  end

  def normalize_team_colors(raw_colors, teams_count)
    colors = Array(raw_colors).map { |value| value.to_s.strip }
    colors = colors.first(teams_count)

    while colors.size < teams_count
      colors << Team::COLORS[colors.size % Team::COLORS.size]
    end

    colors.map do |color|
      Team::COLORS.include?(color) ? color : Team::COLORS.first
    end
  end

  def game_started?(game)
    return true if game.result != "pending"
    return true if game.home_score.to_i > 0 || game.away_score.to_i > 0

    quarter_scores = game.quarter_scores
    return false if quarter_scores.blank?

    quarter_scores.values.any? do |score|
      score.is_a?(Hash) && (score["home"].to_i > 0 || score["away"].to_i > 0)
    end
  end

  # Strong parameters가 중첩 해시를 자동으로 처리하지 못할 때 안전하게 추출
  def extract_scores_from_params
    return nil unless params[:scores].respond_to?(:each)

    scores = {}
    params[:scores].each do |game_id, score_data|
      next unless game_id.to_s.match?(/\A\d+\z/)

      sanitized = {}
      quarters = score_data[:quarters] || score_data["quarters"]
      if quarters.respond_to?(:each)
        sanitized_quarters = {}
        quarters.each do |q_num, q_data|
          next unless q_num.to_s.match?(/\A[1-5]\z/)
          sanitized_quarters[q_num.to_s] = {
            "home" => q_data[:home].to_i,
            "away" => q_data[:away].to_i
          }
        end
        sanitized["quarters"] = sanitized_quarters
      end
      scores[game_id] = sanitized
    end
    scores.presence
  end

  def ordered_games_for_display(games)
    ordered_games = games.sort_by(&:id)
    return ordered_games if ordered_games.size < 2

    default_order = (0...ordered_games.size).to_a
    cached_state = Rails.cache.read("scoreboard_state_#{@match.id}")
    raw_order = if cached_state.is_a?(Hash)
      cached_state["matchup_order"] || cached_state[:matchup_order]
    end
    matchup_order = normalize_matchup_order(raw_order, default_order)

    sorted = matchup_order.filter_map do |game_index|
      ordered_games[game_index]
    end

    sorted + (ordered_games - sorted)
  end

  def normalize_matchup_order(raw_order, fallback)
    return fallback unless raw_order.is_a?(Array)

    seen = {}
    normalized = []

    raw_order.each do |value|
      index = value.to_i
      next unless fallback.include?(index)
      next if seen[index]

      seen[index] = true
      normalized << index
    end

    fallback.each do |index|
      normalized << index unless seen[index]
    end

    normalized
  end

  def respond_member_update_success(message)
    respond_to do |format|
      format.html { redirect_to club_match_path(@club, @match), notice: message }
      format.json { render json: { success: true, message: message } }
    end
  end

  def respond_member_update_error(message)
    respond_to do |format|
      format.html { redirect_to club_match_path(@club, @match), alert: message }
      format.json { render json: { success: false, error: message }, status: :unprocessable_entity }
    end
  end
end
