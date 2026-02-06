class MatchesController < ApplicationController
  before_action :set_club
  before_action :set_match, only: [ :show, :edit, :update, :destroy, :record_results, :save_game_scores, :save_quarter_scores, :share, :move_member, :shuffle_teams, :update_scores ]

  def index
    @matches = @club.matches.order(played_on: :desc, created_at: :desc)
  end

  def new
    @match = @club.matches.new(played_on: Date.current, teams_count: 3)
    @members = @club.members.order(:sort_order, :id)

    # 승률 계산 (뷰에서 정렬용)
    raw_stats = StatsCalculator.new(@club).member_stats
    @member_stats = raw_stats.index_by { |s| s[:member].id }
  end

  def create
    @match = @club.matches.new(match_params)
    @members = @club.members.order(:sort_order, :id)
    selected_ids = Array(params[:member_ids]).map(&:to_i)
    teams_count = @match.teams_count

    # ... (유효성 검사는 그대로)
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
    team_names = params[:team_names] || %w[A B C] # 사용자 지정 팀 이름

    member_stats = Rails.cache.fetch("club_#{@club.id}_member_stats", expires_in: 5.minutes) do
      StatsCalculator.new(@club).member_stats
    end
    assignments = TeamBalancer.new(selected_members, teams_count, stats: member_stats).call

    ActiveRecord::Base.transaction do
      @match.save!

      teams = teams_count.times.map do |index|
        name = team_names[index].presence || (index < 3 ? %w[A B C][index] : "T#{index+1}")
        @match.teams.create!(label: name, color: team_colors[index])
      end

      teams.each_with_index do |team, index|
        assignments[index].each do |member|
          team.team_members.create!(member: member)
        end
      end

      if teams_count == 3
        # 3팀일 경우: A vs B, B vs C, C vs A (Rotational)
        matchups = [
          [ teams[0], teams[1] ], # A vs B
          [ teams[1], teams[2] ], # B vs C
          [ teams[2], teams[0] ]  # C vs A
        ]
        matchups.each do |home, away|
          @match.games.create!(home_team: home, away_team: away, result: "pending")
        end
      else
        # 2팀일 경우: A vs B
        teams.combination(2).each do |home, away|
          @match.games.create!(home_team: home, away_team: away, result: "pending")
        end
      end
    end

    redirect_to club_match_path(@club, @match), notice: "팀이 생성되었습니다."
  rescue StandardError => e
    flash.now[:alert] = "팀 생성에 실패했습니다: #{e.message}"
    render :new, status: :unprocessable_entity
  end

  def show
    @teams = @match.teams.includes(:members).order(:label)
    @games = @match.games.includes(:home_team, :away_team)

    if @match.teams_count == 3
      # 3팀일 경우 표시 순서 강제 정렬: A-B, B-C, C-A 순서
      # DB에서 가져온 게임들을 home_team label 기준으로 찾아서 정렬
      sorted_games = []

      # A(0) vs B(1)
      g1 = @games.find { |g| g.home_team.label == "A" && g.away_team.label == "B" }
      # B(1) vs C(2)
      g2 = @games.find { |g| g.home_team.label == "B" && g.away_team.label == "C" }
      # C(2) vs A(0)
      g3 = @games.find { |g| g.home_team.label == "C" && g.away_team.label == "A" }

      sorted_games << g1 if g1
      sorted_games << g2 if g2
      sorted_games << g3 if g3

      # 만약 위 패턴에 매칭되지 않는 게임(예: A vs C)이 있다면 나머지에 추가
      remaining = @games - sorted_games
      @games = sorted_games + remaining
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
      results.each do |game_id, result|
        game = @match.games.find(game_id)
        next unless Game::RESULTS.include?(result)

        game.update!(result: result)
      end
    end

    redirect_to club_match_path(@club, @match), notice: "경기 결과가 저장되었습니다."
  end

  def save_game_scores
    game_id = params[:game_id]
    home_score = params[:home_score].to_i
    away_score = params[:away_score].to_i

    # game_id가 없으면 첫 번째 게임 사용 (2팀 대전의 경우)
    game = if game_id.present?
      @match.games.find(game_id)
    else
      @match.games.first
    end

    if game && game.update_scores(home_score, away_score)
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
    home_score = params[:home_score].to_i
    away_score = params[:away_score].to_i

    # game_id가 제공되면 직접 찾기, 아니면 team_id로 찾기
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
    quarter_scores[quarter.to_s] = { "home" => home_score, "away" => away_score }

    # 쿼터 점수 저장 및 게임 최종 점수/결과 업데이트
    game.assign_attributes(
      quarter_scores: quarter_scores,
      home_score: home_score,
      away_score: away_score
    )
    game.update_result_from_scores

    if game.save
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
    # params[:scores]가 ActionController::Parameters 일 수 있으므로 to_unsafe_h 또는 permit 처리가 필요할 수 있음
    # 하지만 간단히 처리하기 위해 scores_data로 받아서 처리
    scores_data = params[:scores]

    if scores_data.present?
      ActiveRecord::Base.transaction do
        scores_data.each do |game_id, score_params|
          game = @match.games.find(game_id)

          # 쿼터 점수 처리
          quarters_params = score_params[:quarters] || {}
          current_quarter_scores = game.quarter_scores || {}

          # 입력된 값들로 임시 해시 구성 (없으면 기존 값 유지)
          temp_scores = {}
          (1..4).each do |q|
            q_s = q.to_s
            if quarters_params[q_s].present?
              temp_scores[q_s] = {
                "home" => quarters_params[q_s][:home].to_i,
                "away" => quarters_params[q_s][:away].to_i
              }
            else
              temp_scores[q_s] = current_quarter_scores[q_s] || { "home" => 0, "away" => 0 }
            end
          end

          # Home 점수 계산
          h_scores = (1..4).map { |q| temp_scores[q.to_s]["home"] }
          # 누적 패턴 판단: 점수가 모두 0 이상이고, 단조 증가(이전보다 크거나 같음)하며, 마지막 점수가 합계보다 작을 때 (즉, 단순 합산하면 너무 커질 때)
          # 또는 사용자가 명시적으로 누적으로 입력했을 것 같은 패턴 (마지막 점수가 0이 아닌데 합계가 마지막 점수의 2배 가까이 되거나 등)
          # 여기서는 엄격하게: "모든 쿼터 점수가 0 이상이고, 이전 쿼터보다 크거나 같으면" 누적으로 간주
          h_is_cumulative = h_scores.all? { |s| s >= 0 } && h_scores.each_cons(2).all? { |a, b| a <= b } && h_scores.last > 0

          # 하지만 10, 10, 10, 10 처럼 똑같은 경우도 누적일 수 있고(10점 멈춤), 구간일 수 있음(매 쿼터 10점)
          # 구분하기 어려우므로, "합계 vs 마지막값" 중 더 합리적인 것을 선택해야 함.
          # 사용자 멘트: "수정하는 화면에는 누적으로 잘 나오는데" -> 사용자는 누적 입력을 선호함.
          # 따라서 "증가 패턴"이면 누적으로 간주하여 Last를 Total로.
          # 단, 0, 0, 0, 0 은 예외.

          game.home_score = if h_is_cumulative
            h_scores.last
          else
            h_scores.sum
          end

          # Away 점수 계산
          a_scores = (1..4).map { |q| temp_scores[q.to_s]["away"] }
          a_is_cumulative = a_scores.all? { |s| s >= 0 } && a_scores.each_cons(2).all? { |a, b| a <= b } && a_scores.last > 0

          game.away_score = if a_is_cumulative
            a_scores.last
          else
            a_scores.sum
          end

          game.quarter_scores = temp_scores

          # 결과 자동 업데이트
          game.update_result_from_scores
          game.save!
        end
      end
      redirect_to club_match_path(@club, @match), notice: "경기 점수가 수정되었습니다."
    else
      redirect_to club_match_path(@club, @match), alert: "수정할 점수 데이터가 없습니다."
    end
  rescue => e
    redirect_to club_match_path(@club, @match), alert: "점수 수정 실패: #{e.message}"
  end

  def move_member
    target_team = @match.teams.find(params[:target_team_id])
    member = @club.members.find(params[:member_id])

    # 해당 멤버가 현재 매치의 어느 팀에 속해있는지 확인
    team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first

    if team_member
      team_member.update!(team_id: target_team.id)
      render json: { success: true }
    else
      render json: { success: false, error: "Member not found in this match" }, status: :unprocessable_entity
    end
  rescue => e
    render json: { success: false, error: e.message }, status: :unprocessable_entity
  end

  def shuffle_teams
    # 게임 기록이 있는지 확인 (점수가 있거나 결과가 나온 게임이 하나라도 있으면 불가)
    if @match.games.any? { |g| g.result != "pending" || g.home_score > 0 || g.away_score > 0 }
      return redirect_to club_match_path(@club, @match), alert: "이미 진행된 게임이 있어 팀을 섞을 수 없습니다."
    end

    # 현재 참가 중인 멤버들 가져오기
    current_members = @match.teams.flat_map(&:members).uniq

    if current_members.empty?
      return redirect_to club_match_path(@club, @match), alert: "참가 멤버가 없어 팀을 섞을 수 없습니다."
    end

    # 밸런싱 재실행
    teams_count = @match.teams_count
    member_stats = Rails.cache.fetch("club_#{@club.id}_member_stats", expires_in: 5.minutes) do
      StatsCalculator.new(@club).member_stats
    end

    assignments = TeamBalancer.new(current_members, teams_count, stats: member_stats).call

    ActiveRecord::Base.transaction do
      # 기존 팀 멤버십 모두 삭제
      TeamMember.where(team_id: @match.team_ids).destroy_all

      # 새 배정 적용
      teams = @match.teams.order(:id) # ID 순서대로 가져와서 매핑 (A, B, C...)

      teams.each_with_index do |team, index|
        assignments[index].each do |member|
          team.team_members.create!(member: member)
        end
      end
    end

    redirect_to club_match_path(@club, @match), notice: "팀을 랜덤하게 새로 섞었습니다."
  rescue => e
    redirect_to club_match_path(@club, @match), alert: "팀 섞기 실패: #{e.message}"
  end

  private

  def set_club
    @club = current_user.clubs.find(params[:club_id])
  end

  def set_match
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
end
