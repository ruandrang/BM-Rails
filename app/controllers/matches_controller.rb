class MatchesController < ApplicationController
  include MatchScoring
  include MatchMembership
  include MatchGames

  skip_before_action :require_login, only: [ :share ]
  before_action :set_club, except: [ :share ]
  before_action :set_match, only: [ :show, :edit, :update, :destroy, :record_results, :save_game_scores, :save_quarter_scores, :move_member, :add_member, :remove_member, :add_game, :remove_game, :shuffle_teams, :update_scores, :reset_all_scores, :finish_match ]
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

    default_attributes = { played_on: default_date, teams_count: 3, games_per_match: 1 }
    default_attributes[:regular_quarters] = 4 if Match.column_names.include?("regular_quarters")
    @match = @club.matches.new(default_attributes)
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
    @teams = @match.teams.includes(:members).order(:id)
    @games = ordered_games_for_display(@match.games.includes(:home_team, :away_team).to_a)
    assigned_member_ids = TeamMember.joins(:team).where(teams: { match_id: @match.id }).distinct.pluck(:member_id)
    @available_members_for_match = @club.members.where.not(id: assigned_member_ids).order(:sort_order, :id)
  end

  def share
    @teams = @match.teams.includes(:members).order(:id)
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
    permitted = [ :played_on, :teams_count, :games_per_match, :note ]
    permitted << :regular_quarters if Match.column_names.include?("regular_quarters")
    params.require(:match).permit(*permitted)
  end

  def match_update_params
    params.require(:match).permit(:played_on, :note)
  end

  def normalize_team_colors(raw_colors, teams_count)
    colors = if raw_colors.is_a?(Hash) || raw_colors.is_a?(ActionController::Parameters)
      # { "0" => "Red", "1" => "Blue" } 형태의 params 처리
      (0...teams_count).map { |i| raw_colors[i.to_s].to_s.strip }
    else
      Array(raw_colors).map { |value| value.to_s.strip }
    end
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

    max_regular_quarters = regular_quarters_count(@match)
    scores = {}
    params[:scores].each do |game_id, score_data|
      next unless game_id.to_s.match?(/\A\d+\z/)

      sanitized = {}
      quarters = score_data[:quarters] || score_data["quarters"]
      if quarters.respond_to?(:each)
        sanitized_quarters = {}
        quarters.each do |q_num, q_data|
          next unless q_num.to_s.match?(/\A\d+\z/)
          quarter_number = q_num.to_i
          next unless quarter_number.between?(1, max_regular_quarters)

          sanitized_quarters[quarter_number.to_s] = {
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

  def regular_quarters_count(match)
    return 4 unless match.respond_to?(:regular_quarters)

    value = match.regular_quarters.to_i
    [ 3, 4 ].include?(value) ? value : 4
  end
end
