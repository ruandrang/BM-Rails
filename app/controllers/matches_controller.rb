class MatchesController < ApplicationController
  skip_before_action :require_login, only: [ :share ]
  before_action :set_club, except: [ :share ]
  before_action :set_match, only: [ :show, :edit, :update, :destroy, :record_results, :save_game_scores, :save_quarter_scores, :move_member, :shuffle_teams, :update_scores ]
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

    @match = @club.matches.new(played_on: default_date, teams_count: 3)
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
        teams.combination(2).each do |home, away|
          @match.games.create!(home_team: home, away_team: away, result: "pending")
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
    @games = @match.games.includes(:home_team, :away_team)

    if @match.teams_count == 3
      # 3팀 게임을 생성 순서(Rotational) 기준으로 정렬
      team_labels = @teams.map(&:label)
      if team_labels.size == 3
        expected_matchups = [
          [ team_labels[0], team_labels[1] ],
          [ team_labels[1], team_labels[2] ],
          [ team_labels[2], team_labels[0] ]
        ]

        sorted_games = expected_matchups.filter_map do |home_label, away_label|
          @games.find { |g| g.home_team.label == home_label && g.away_team.label == away_label }
        end

        remaining = @games - sorted_games
        @games = sorted_games + remaining
      end
    end
  end

  def share
    @teams = @match.teams.includes(:members).order(:label)
    @games = @match.games.includes(:home_team, :away_team)
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
    @match.destroy
    redirect_to club_matches_path(@club), notice: "경기가 삭제되었습니다."
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
    home_score = params[:home_score].to_i
    away_score = params[:away_score].to_i

    game = if game_id.present?
      @match.games.find(game_id)
    else
      @match.games.first
    end

    if game && game.update_scores(home_score, away_score)
      expire_member_stats_cache
      render json: { success: true, result: game.result, game_id: game.id }
    else
      render json: { success: false, errors: game&.errors&.full_messages || [ "Game not found" ] }, status: :unprocessable_entity
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
      quarter_scores = game.quarter_scores || {}
      quarter_scores[quarter.to_s] = { "home" => quarter_home_score, "away" => quarter_away_score }

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
          (1..4).each do |q|
            q_s = q.to_s
            if quarters_params[q_s].present?
              temp_scores[q_s] = {
                "home" => quarters_params[q_s]["home"].to_i,
                "away" => quarters_params[q_s]["away"].to_i
              }
            else
              temp_scores[q_s] = current_quarter_scores[q_s] || { "home" => 0, "away" => 0 }
            end
          end

          h_scores = (1..4).map { |q| temp_scores[q.to_s]["home"] }
          a_scores = (1..4).map { |q| temp_scores[q.to_s]["away"] }

          # 명시적 입력 모드에 따라 총점 계산
          if input_mode == "cumulative"
            game.home_score = h_scores.last
            game.away_score = a_scores.last
          else
            game.home_score = h_scores.sum
            game.away_score = a_scores.sum
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

  # share 액션용: 로그인 없이 공개 접근 가능
  def set_public_club_and_match
    @club = Club.find(params[:club_id])
    @match = @club.matches.find(params[:id])
  end

  def match_params
    params.require(:match).permit(:played_on, :teams_count, :note)
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

  def cached_member_stats
    Rails.cache.fetch("club_#{@club.id}_member_stats", expires_in: 5.minutes) do
      StatsCalculator.new(@club).member_stats
    end
  end

  def expire_member_stats_cache
    Rails.cache.delete("club_#{@club.id}_member_stats")
  end

  # Strong parameters가 중첩 해시를 자동으로 처리하지 못할 때 안전하게 추출
  def extract_scores_from_params
    return nil unless params[:scores].respond_to?(:each)

    scores = {}
    params[:scores].each do |game_id, score_data|
      next unless game_id.to_s.match?(/\A\d+\z/)
      scores[game_id] = score_data.respond_to?(:to_unsafe_h) ? score_data.to_unsafe_h : score_data.to_h
    end
    scores.presence
  end
end
